import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import {
  MODEL_FILES,
  MODELS_DIR,
  MODEL_DISPLAY,
} from '../config/constants';

const FULL_RESTORE_TIMEOUT_MS = 10 * 60 * 1000; // 10 min
const FRAME_TIMEOUT_MS = 3 * 60 * 1000;
const PARTIAL_EXTRACT_TIMEOUT_MS = 5 * 60 * 1000;

function run(args: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log('[restore]', args.join(' '));
    const p = spawn('ffmpeg', ['-hide_banner', '-y', ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let err = '';
    const timer = setTimeout(() => {
      p.kill('SIGKILL');
      reject(
        new Error(
          `FFmpeg restore timed out after ${Math.round(timeoutMs / 1000)}s`
        )
      );
    }, timeoutMs);

    p.stderr.on('data', (d) => (err += d.toString()));

    p.on('close', (code, signal) => {
      clearTimeout(timer);
      if (code === 0) return resolve();
      if (signal === 'SIGKILL') {
        return reject(new Error('FFmpeg restore killed (OOM or timeout)'));
      }
      reject(new Error(err.slice(-2500) || `FFmpeg exited ${code}`));
    });

    p.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

function fileSize(p: string): number {
  try {
    return fs.statSync(p).size;
  } catch {
    return 0;
  }
}

/**
 * Sharpener selection — CAS (Contrast Adaptive Sharpen, FFmpeg >= 4.3)
 * preferred over unsharp: halo-free edges, no ringing on enhanced output.
 * Probed once per process; falls back to unsharp on older FFmpeg builds.
 */
let sharpenerProbe: Promise<boolean> | null = null;

function hasCas(): Promise<boolean> {
  if (!sharpenerProbe) {
    sharpenerProbe = new Promise((resolve) => {
      const p = spawn('ffmpeg', ['-hide_banner', '-filters']);
      let out = '';
      const timer = setTimeout(() => {
        p.kill('SIGKILL');
        resolve(false);
      }, 10_000);
      p.stdout.on('data', (d) => (out += d.toString()));
      p.on('close', () => {
        clearTimeout(timer);
        resolve(/^\s*[\w.]+\s+cas\s+/m.test(out));
      });
      p.on('error', () => {
        clearTimeout(timer);
        resolve(false);
      });
    });
  }
  return sharpenerProbe;
}

async function sharpen(
  casStrength: number,
  unsharpFallback: string
): Promise<string> {
  return (await hasCas()) ? `cas=${casStrength}` : unsharpFallback;
}

/**
 * Audio strategy — the restore input is normally our own compressed file,
 * whose audio is already Opus 96k. Copying avoids a second lossy generation
 * and saves CPU. Anything that is NOT Opus (e.g. AAC from a client-side
 * skipCompress upload) is re-encoded to libopus so no encumbered audio
 * can ever reach the delivered output.
 */
function probeAudioCodec(inputPath: string): Promise<string | null> {
  return new Promise((resolve) => {
    const p = spawn('ffprobe', [
      '-v', 'error',
      '-select_streams', 'a:0',
      '-show_entries', 'stream=codec_name',
      '-of', 'default=noprint_wrappers=1:nokey=1',
      inputPath,
    ]);

    let out = '';
    const timer = setTimeout(() => {
      p.kill('SIGKILL');
      resolve(null);
    }, 10_000);

    p.stdout.on('data', (d) => (out += d.toString()));
    p.on('close', () => {
      clearTimeout(timer);
      resolve(out.trim() || null);
    });
    p.on('error', () => {
      clearTimeout(timer);
      resolve(null);
    });
  });
}

async function audioArgs(inputPath: string): Promise<string[]> {
  const codec = await probeAudioCodec(inputPath);
  if (codec === 'opus') {
    return ['-c:a', 'copy'];
  }
  // Unknown / absent / encumbered → safe royalty-free encode
  return ['-c:a', 'libopus', '-b:a', '96k', '-ac', '2', '-ar', '48000'];
}

/**
 * Full-timeline restore encode.
 * Speed rule: if AV1 times out or fails, do NOT run another full VP9 pass —
 * throw so the worker switches to partial frames (same quality samples, ~10 min saved).
 */
async function encodeAv1OrVp9(
  inputPath: string,
  outPath: string,
  vf?: string
): Promise<'libsvtav1' | 'libvpx-vp9'> {
  const videoFilter = vf ? ['-vf', vf] : [];
  const av1 = outPath.replace(/(\.\w+)?$/, '_av1.mp4');
  const audio = await audioArgs(inputPath);

  try {
    await run(
      [
        '-i', inputPath,
        ...videoFilter,
        '-map', '0:v:0',
        '-map', '0:a:0?',
        '-c:v', 'libsvtav1',
        '-preset', '8',
        '-crf', '28', // optional: 26 for a gentler second pass (size gate still protects)
        '-pix_fmt', 'yuv420p',
        '-svtav1-params', 'lp=1:tune=0', // tune=0 → visual-quality tune (same speed)
        '-threads', '2',
        ...audio,
        '-movflags', '+faststart',
        '-sn',
        av1,
      ],
      FULL_RESTORE_TIMEOUT_MS
    );

    if (fileSize(av1) > 0) {
      fs.renameSync(av1, outPath);
      return 'libsvtav1';
    }

    // Empty output without throw — treat as failure for full path
    throw new Error('Full restore AV1 produced empty output');
  } catch (e: any) {
    const msg = e?.message || String(e);
    console.warn(
      '[restore] full AV1 failed/timed out — skip full VP9 → partial',
      msg.slice?.(0, 200) || msg
    );
    // Do not start a second full-timeline VP9 enhance (saves ~10 min on large jobs)
    throw e instanceof Error ? e : new Error(msg);
  }
}

async function enhanceFramePng(
  src: string,
  dest: string,
  maxWidth: number
): Promise<void> {
  const vfA = [
    `scale='min(${maxWidth},iw)':-2:flags=lanczos+accurate_rnd+full_chroma_int`,
'atadenoise=0a=0.01:0b=0.02:1a=0.01:1b=0.02',
'hqdn3d=1.2:1.2:2.5:2.5',
    'eq=contrast=1.06:saturation=1.05', // brightness lift removed (amplifies banding)
    'gradfun=1.2:8',                    // cheap debanding of 8-bit gradients
    await sharpen(0.35, 'unsharp=5:5:1.2:5:5:0.6'),
  ].join(',');

  try {
    await run(['-i', src, '-vf', vfA, dest], FRAME_TIMEOUT_MS);
    if (fileSize(dest) > 0) return;
  } catch {
    /* fall through */
  }

  const vfB = [
    'scale=iw*2:ih*2:flags=lanczos',
    `scale='min(${maxWidth},iw)':-2:flags=lanczos+accurate_rnd+full_chroma_int`,
    'hqdn3d=1.0:1.0:2:2',
    'gradfun=1.2:8',
    await sharpen(0.3, 'unsharp=5:5:1.0:5:5:0.5'),
  ].join(',');

  await run(['-i', src, '-vf', vfB, dest], FRAME_TIMEOUT_MS);
}

export type RestoreOptions = {
  maxWidth?: number;
  maxSeconds?: number;
};

export type PartialFrameResult = {
  mode: 'partial-frames';
  framePaths: string[];
  frameCount: number;
  workDir: string;
  model: string;
};

export const restorationService = {
  weightPath(modelId: string) {
    return path.join(
      MODELS_DIR,
      MODEL_FILES[modelId] || MODEL_FILES['atd-webphoto']
    );
  },

  displayName(modelId: string) {
    return MODEL_DISPLAY[modelId] || modelId;
  },

  async restore(
    inputPath: string,
    model: string,
    opts: RestoreOptions = {}
  ): Promise<string> {
    if (!fs.existsSync(inputPath)) {
      throw new Error(`Restore input missing: ${inputPath}`);
    }

    const dir = path.dirname(inputPath);
    const stem = path.basename(inputPath, path.extname(inputPath));
    const outPath = path.join(
      dir,
      `${stem}_restored_${model.replace(/[^\w.-]+/g, '_')}.mp4`
    );

    try {
      await this.runModelWorker(inputPath, outPath, model, opts);
    } catch (e: any) {
      console.warn('[restore] worker failed → ffmpeg enhance:', e?.message);
      await this.ffmpegEnhance(inputPath, outPath, opts);
    }

    if (fileSize(outPath) === 0) {
      throw new Error('Restoration produced empty output');
    }
    return outPath;
  },

  async runModelWorker(
    _input: string,
    _out: string,
    model: string,
    _opts: RestoreOptions
  ): Promise<void> {
    const weights = this.weightPath(model);
    if (!fs.existsSync(weights)) {
      throw new Error(`Weight missing: ${weights}`);
    }
    throw new Error(`Model worker not configured for ${model}`);
  },

  async ffmpegEnhance(
    inputPath: string,
    outPath: string,
    opts: RestoreOptions = {}
  ): Promise<void> {
    let source = inputPath;
    const workDir = path.dirname(outPath);

    if (opts.maxSeconds && opts.maxSeconds > 0) {
      const slice = path.join(workDir, `slice_${Date.now()}.mp4`);
      await run(
        ['-t', String(opts.maxSeconds), '-i', inputPath, '-c', 'copy', slice],
        FRAME_TIMEOUT_MS
      );
      source = slice;
    }

    const maxWidth = opts.maxWidth ?? 1920;
    const vf = [
      `scale='min(${maxWidth},iw)':-2:flags=lanczos+accurate_rnd+full_chroma_int`,
      'hqdn3d=1.2:1.2:2.5:2.5',
      'eq=contrast=1.04:saturation=1.03',
      'gradfun=1.2:8',
      await sharpen(0.3, 'unsharp=5:5:0.9:5:5:0.45'),
    ].join(',');

    await encodeAv1OrVp9(source, outPath, vf);
  },

  async restorePartialFrames(
    compressedPath: string,
    model: string,
    opts: { frameCount?: number; maxWidth?: number } = {}
  ): Promise<PartialFrameResult> {
    if (!fs.existsSync(compressedPath)) {
      throw new Error('Partial restore input missing: ' + compressedPath);
    }

    const frameCount = opts.frameCount ?? 2;
    const maxWidth = opts.maxWidth ?? 720;
    const dir = path.dirname(compressedPath);
    const stem = path.basename(compressedPath, path.extname(compressedPath));
    const workDir = path.join(dir, `${stem}_partial_${Date.now()}`);
    const framesIn = path.join(workDir, 'in');
    const framesOut = path.join(workDir, 'out');
    fs.mkdirSync(framesIn, { recursive: true });
    fs.mkdirSync(framesOut, { recursive: true });

    const patternIn = path.join(framesIn, 'frame_%03d.png');

    const extractArgs = (seek?: string): string[] => [
      ...(seek ? ['-ss', seek] : []),
      '-i', compressedPath,
      '-vf', `fps=1,scale='min(${maxWidth},iw)':-2:flags=lanczos+accurate_rnd`,
      '-frames:v', String(frameCount),
      patternIn,
    ];

    const readFrames = (): string[] =>
      fs
        .readdirSync(framesIn)
        .filter((f) => f.endsWith('.png'))
        .sort()
        .map((f) => path.join(framesIn, f));

    // Skip the first second — t=0 is often black/fade-in (poor showcase frame).
    try {
      await run(extractArgs('1'), PARTIAL_EXTRACT_TIMEOUT_MS);
    } catch {
      /* very short clip or seek issue — retry from t=0 below */
    }

    let inputs = readFrames();

    if (inputs.length === 0) {
      await run(extractArgs(), PARTIAL_EXTRACT_TIMEOUT_MS);
      inputs = readFrames();
    }

    if (inputs.length === 0) {
      throw new Error('No frames extracted for partial restore');
    }

    const framePaths: string[] = [];

    for (let i = 0; i < inputs.length; i++) {
      const src = inputs[i];
      const dest = path.join(
        framesOut,
        `restored_${String(i).padStart(3, '0')}.png`
      );

      try {
        await enhanceFramePng(src, dest, maxWidth);
      } catch {
        try {
          fs.copyFileSync(src, dest);
        } catch {
          continue;
        }
      }

      if (fs.existsSync(dest) && fileSize(dest) > 0) {
        framePaths.push(dest);
      }
    }

    if (framePaths.length === 0) {
      throw new Error('Partial restore produced no frames');
    }

    return {
      mode: 'partial-frames',
      framePaths,
      frameCount: framePaths.length,
      workDir,
      model,
    };
  },

  async framesToPreviewClip(
    framePaths: string[],
    outPath: string,
    fps = 2
  ): Promise<string> {
    if (framePaths.length === 0) {
      throw new Error('No frames for preview clip');
    }

    const listFile = path.join(
      path.dirname(outPath),
      `concat_${Date.now()}.txt`
    );
    const body = framePaths
      .map((p) => `file '${p.replace(/'/g, `'\\''`)}'`)
      .join('\n');
    fs.writeFileSync(listFile, body);

    const raw = outPath.replace(/(\.\w+)?$/, '_raw.mp4');

    // Preview clip is tiny — VP9-only is fine for speed
    try {
      await run(
        [
          '-f', 'concat', '-safe', '0',
          '-r', String(fps),
          '-i', listFile,
          '-c:v', 'libsvtav1',
          '-preset', '10',
          '-crf', '28',
          '-svtav1-params', 'lp=1:tune=0',
          '-threads', '2',
          '-an',
          raw,
        ],
        PARTIAL_EXTRACT_TIMEOUT_MS
      );
    } catch {
      await run(
        [
          '-f', 'concat', '-safe', '0',
          '-r', String(fps),
          '-i', listFile,
          '-c:v', 'libvpx-vp9',
          '-crf', '28',
          '-b:v', '0',
          '-cpu-used', '5',
          '-an',
          raw,
        ],
        PARTIAL_EXTRACT_TIMEOUT_MS
      );
    }

    if (fileSize(raw) === 0) {
      throw new Error('Preview clip empty');
    }
    fs.renameSync(raw, outPath);

    try {
      fs.unlinkSync(listFile);
    } catch {
      /* ignore */
    }

    return outPath;
  },
};