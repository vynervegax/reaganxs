import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import {
  MODEL_FILES,
  MODELS_DIR,
  MODEL_DISPLAY,
} from '../config/constants';

const FULL_RESTORE_TIMEOUT_MS = 10 * 60 * 1000;
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

async function encodeAv1OrVp9(
  inputPath: string,
  outPath: string,
  vf?: string
): Promise<'libsvtav1' | 'libvpx-vp9'> {
  const videoFilter = vf ? ['-vf', vf] : [];
  const av1 = outPath.replace(/(\.\w+)?$/, '_av1.mp4');

  try {
    await run(
      [
        '-i', inputPath,
        ...videoFilter,
        '-map', '0:v:0',
        '-map', '0:a:0?',
        '-c:v', 'libsvtav1',
        '-preset', '8',
        '-crf', '28',
        '-pix_fmt', 'yuv420p',
        '-svtav1-params', 'lp=1',
        '-threads', '2',
        '-c:a', 'libopus',
        '-b:a', '96k',
        '-ac', '2',
        '-ar', '48000',
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
  } catch (e: any) {
    console.warn('[restore] AV1 → VP9', e?.message?.slice?.(0, 200));
  }

  const vp9 = outPath.replace(/(\.\w+)?$/, '_vp9.webm');
  await run(
    [
      '-i', inputPath,
      ...videoFilter,
      '-map', '0:v:0',
      '-map', '0:a:0?',
      '-c:v', 'libvpx-vp9',
      '-crf', '28',
      '-b:v', '0',
      '-cpu-used', '5',
      '-deadline', 'good',
      '-row-mt', '1',
      '-threads', '2',
      '-pix_fmt', 'yuv420p',
      '-c:a', 'libopus',
      '-b:a', '96k',
      '-ac', '2',
      '-ar', '48000',
      '-sn',
      vp9,
    ],
    FULL_RESTORE_TIMEOUT_MS
  );

  if (fileSize(vp9) === 0) {
    throw new Error('Restore encode empty');
  }
  fs.renameSync(vp9, outPath);
  return 'libvpx-vp9';
}

async function enhanceFramePng(
  src: string,
  dest: string,
  maxWidth: number
): Promise<void> {
  const vfA = [
    `scale='min(${maxWidth},iw)':-2:flags=lanczos`,
    'hqdn3d=1.5:1.5:3:3',
    'eq=contrast=1.06:brightness=0.02:saturation=1.05',
    'unsharp=5:5:1.2:5:5:0.6',
  ].join(',');

  try {
    await run(['-i', src, '-vf', vfA, dest], FRAME_TIMEOUT_MS);
    if (fileSize(dest) > 0) return;
  } catch {
    /* fall through */
  }

  const vfB = [
    'scale=iw*2:ih*2:flags=lanczos',
    `scale='min(${maxWidth},iw)':-2:flags=lanczos`,
    'hqdn3d=1.0:1.0:2:2',
    'unsharp=5:5:1.0:5:5:0.5',
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
      `scale='min(${maxWidth},iw)':-2:flags=lanczos`,
      'hqdn3d=1.2:1.2:2.5:2.5',
      'eq=contrast=1.04:saturation=1.03',
      'unsharp=5:5:0.9:5:5:0.45',
    ].join(',');

    await encodeAv1OrVp9(source, outPath, vf);
  },

  async restorePartialFrames(
    compressedPath: string,
    model: string,
    opts: { frameCount?: number; maxWidth?: number } = {}
  ): Promise<PartialFrameResult> {
    if (!fs.existsSync(compressedPath)) {
      throw new Error(`Partial restore input missing: ${compressedPath}`);
    }

    const frameCount = opts.frameCount ?? 8;
    const maxWidth = opts.maxWidth ?? 720;
    const dir = path.dirname(compressedPath);
    const stem = path.basename(compressedPath, path.extname(compressedPath));
    const workDir = path.join(dir, `${stem}_partial_${Date.now()}`);
    const framesIn = path.join(workDir, 'in');
    const framesOut = path.join(workDir, 'out');
    fs.mkdirSync(framesIn, { recursive: true });
    fs.mkdirSync(framesOut, { recursive: true });

    const patternIn = path.join(framesIn, 'frame_%03d.png');
    await run(
      [
        '-i', compressedPath,
        '-vf', `fps=1,scale='min(${maxWidth},iw)':-2:flags=lanczos`,
        '-frames:v', String(frameCount),
        patternIn,
      ],
      PARTIAL_EXTRACT_TIMEOUT_MS
    );

    const inputs = fs
      .readdirSync(framesIn)
      .filter((f) => f.endsWith('.png'))
      .sort()
      .map((f) => path.join(framesIn, f));

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

    try {
      await run(
        [
          '-f', 'concat', '-safe', '0',
          '-r', String(fps),
          '-i', listFile,
          '-c:v', 'libsvtav1',
          '-preset', '10',
          '-crf', '28',
          '-svtav1-params', 'lp=1',
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