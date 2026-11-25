import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import {
  MODEL_FILES,
  MODELS_DIR,
  MODEL_DISPLAY,
} from '../config/constants';

const FULL_RESTORE_TIMEOUT_MS = 10 * 60 * 1000; // 10 min
const FRAME_TIMEOUT_MS = 90 * 1000; // 90 s
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
 * Sharpener selection — CAS preferred; unsharp fallback.
 * Probed once per process.
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
 * Filter availability probe (libplacebo / scale_npp).
 * Probed once per process.
 */
let filterProbe: Promise<{ hasPlacebo: boolean; hasNpp: boolean }> | null = null;

function probeFilters(): Promise<{ hasPlacebo: boolean; hasNpp: boolean }> {
  if (!filterProbe) {
    filterProbe = new Promise((resolve) => {
      const p = spawn('ffmpeg', ['-hide_banner', '-filters']);
      let out = '';
      const timer = setTimeout(() => {
        p.kill('SIGKILL');
        resolve({ hasPlacebo: false, hasNpp: false });
      }, 10_000);
      p.stdout.on('data', (d) => (out += d.toString()));
      p.on('close', () => {
        clearTimeout(timer);
        resolve({
          hasPlacebo: /^\s*[\w.]+\s+libplacebo\s+/m.test(out),
          hasNpp: /^\s*[\w.]+\s+scale_npp\s+/m.test(out),
        });
      });
      p.on('error', () => {
        clearTimeout(timer);
        resolve({ hasPlacebo: false, hasNpp: false });
      });
    });
  }
  return filterProbe;
}

/**
 * Audio strategy — copy Opus when possible; otherwise re-encode to libopus.
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
  return ['-c:a', 'libopus', '-b:a', '96k', '-ac', '2', '-ar', '48000'];
}

/**
 * Full-timeline restore encode.
 * On AV1 failure/timeout, throw so the caller switches to partial frames.
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
        '-crf', '28',
        '-pix_fmt', 'yuv420p',
        '-svtav1-params', 'lp=1:tune=0',
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

    throw new Error('Full restore AV1 produced empty output');
  } catch (e: any) {
    const msg = e?.message || String(e);
    console.warn(
      '[restore] full AV1 failed/timed out — skip full VP9 → partial',
      msg.slice?.(0, 200) || msg
    );
    throw e instanceof Error ? e : new Error(msg);
  }
}

/** Decide whether to use the stronger filter chain. */
function shouldUseAggressive(
  opts: RestoreOptions,
  durationSec?: number,
  savingsPercent?: number
): boolean {
  if (opts.forceAggressive) return true;
  if (opts.forceLight) return false;

  // Lowered from 50 % → 35 % so more jobs get the stronger chain
  if (savingsPercent != null && savingsPercent > 35) return true;

  return false;
}

/** Decide whether to upscale (model-free). */
function shouldUpscale(
  opts: RestoreOptions,
  savingsPercent?: number
): boolean {
  if (opts.forceUpscale) return true;
  if (opts.forceNoUpscale) return false;

  const factor = opts.upscaleFactor ?? 1;
  if (factor <= 1) return false;

  // Lowered from 50 % → 30 % so GPU upscale engages more often
  if (savingsPercent != null && savingsPercent > 30) return true;

  return false;
}

async function buildScaleFilter(
  maxWidth: number,
  upscaleFactor: number,
  preferGpu = true
): Promise<string> {
  if (upscaleFactor > 1 && preferGpu) {
    const { hasPlacebo, hasNpp } = await probeFilters();

    if (hasPlacebo) {
      return `libplacebo=w=trunc(iw*${upscaleFactor}/2)*2:h=trunc(ih*${upscaleFactor}/2)*2:upscaler=ewa_lanczos:deband=1:deband_iterations=1`;
    }

    if (hasNpp) {
      return `scale_npp=w=trunc(iw*${upscaleFactor}/2)*2:h=trunc(ih*${upscaleFactor}/2)*2:interp_algo=lanczos`;
    }
  }

  // CPU fallback
  if (upscaleFactor > 1) {
    return `scale=trunc(iw*${upscaleFactor}/2)*2:trunc(ih*${upscaleFactor}/2)*2:flags=lanczos+accurate_rnd+full_chroma_int`;
  }

  return `scale='min(${maxWidth},iw)':-2:flags=lanczos+accurate_rnd+full_chroma_int`;
}

async function buildVideoFilter(
  maxWidth: number,
  aggressive: boolean,
  upscaleFactor: number
): Promise<string> {
  const scale = await buildScaleFilter(maxWidth, upscaleFactor);

  if (aggressive) {
    return [
      scale,
      'atadenoise=0a=0.02:0b=0.04:1a=0.02:1b=0.04',
      'hqdn3d=2.0:2.0:3:3',
      'eq=contrast=1.05:saturation=1.04',
      'gradfun=1.5:8',
      await sharpen(0.45, 'unsharp=5:5:1.4:5:5:0.7'),
    ].join(',');
  }

  // Slightly stronger default chain (still very fast)
  return [
    scale,
    'hqdn3d=1.5:1.5:2.8:2.8',
    'eq=contrast=1.05:saturation=1.04',
    'gradfun=1.3:8',
    await sharpen(0.38, 'unsharp=5:5:1.1:5:5:0.55'),
  ].join(',');
}

async function enhanceFramePng(
  src: string,
  dest: string,
  maxWidth: number,
  aggressive = false,
  upscaleFactor = 1
): Promise<void> {
  const scale = await buildScaleFilter(maxWidth, upscaleFactor);

  const vfA = aggressive
    ? [
        scale,
        'atadenoise=0a=0.02:0b=0.04:1a=0.02:1b=0.04',
        'hqdn3d=1.8:1.8:2.5:2.5',
        'eq=contrast=1.06:saturation=1.05',
        'gradfun=1.5:8',
        await sharpen(0.4, 'unsharp=5:5:1.3:5:5:0.65'),
      ].join(',')
    : [
        scale,
        'atadenoise=0a=0.01:0b=0.02:1a=0.01:1b=0.02',
        'hqdn3d=1.5:1.5:2.8:2.8',
        'eq=contrast=1.06:saturation=1.05',
        'gradfun=1.3:8',
        await sharpen(0.38, 'unsharp=5:5:1.2:5:5:0.6'),
      ].join(',');

  try {
    await run(['-i', src, '-vf', vfA, dest], FRAME_TIMEOUT_MS);
    if (fileSize(dest) > 0) return;
  } catch {
    /* fall through */
  }

  // Fallback: simpler chain (CPU scale only)
  const scaleCpu = upscaleFactor > 1
    ? `scale=trunc(iw*${upscaleFactor}/2)*2:trunc(ih*${upscaleFactor}/2)*2:flags=lanczos+accurate_rnd+full_chroma_int`
    : `scale='min(${maxWidth},iw)':-2:flags=lanczos+accurate_rnd+full_chroma_int`;

  const vfB = [
    scaleCpu,
    'hqdn3d=1.2:1.2:2.2:2.2',
    'gradfun=1.2:8',
    await sharpen(0.32, 'unsharp=5:5:1.0:5:5:0.5'),
  ].join(',');

  await run(['-i', src, '-vf', vfB, dest], FRAME_TIMEOUT_MS);
}

export type RestoreOptions = {
  maxWidth?: number;
  maxSeconds?: number;
  /** Force the stronger filter chain */
  forceAggressive?: boolean;
  /** Force the light filter chain */
  forceLight?: boolean;
  /** Optional: duration in seconds (used by the gate) */
  durationSec?: number;
  /** Optional: savings percent (used by the gate) */
  savingsPercent?: number;
  /** Model-free upscale factor (1 = none, 1.5 or 2 typical). Even output dimensions enforced. */
  upscaleFactor?: number;
  /** Force upscale regardless of savings */
  forceUpscale?: boolean;
  /** Force no upscale */
  forceNoUpscale?: boolean;
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
    const aggressive = shouldUseAggressive(
      opts,
      opts.durationSec,
      opts.savingsPercent
    );

    const doUpscale = shouldUpscale(opts, opts.savingsPercent);
    const upscaleFactor = doUpscale ? (opts.upscaleFactor ?? 2) : 1;

    const vf = await buildVideoFilter(maxWidth, aggressive, upscaleFactor);
    await encodeAv1OrVp9(source, outPath, vf);
  },

  async restorePartialFrames(
    compressedPath: string,
    model: string,
    opts: {
      frameCount?: number;
      maxWidth?: number;
      forceAggressive?: boolean;
      savingsPercent?: number;
      upscaleFactor?: number;
      forceUpscale?: boolean;
      forceNoUpscale?: boolean;
    } = {}
  ): Promise<PartialFrameResult> {
    if (!fs.existsSync(compressedPath)) {
      throw new Error('Partial restore input missing: ' + compressedPath);
    }

    const frameCount = opts.frameCount ?? 2;
    const maxWidth = opts.maxWidth ?? 720;
    const aggressive = shouldUseAggressive(
      { forceAggressive: opts.forceAggressive },
      undefined,
      opts.savingsPercent
    );

    const doUpscale = shouldUpscale(opts, opts.savingsPercent);
    const upscaleFactor = doUpscale ? (opts.upscaleFactor ?? 2) : 1;

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

    try {
      await run(extractArgs('1'), PARTIAL_EXTRACT_TIMEOUT_MS);
    } catch {
      /* retry from t=0 */
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
        await enhanceFramePng(src, dest, maxWidth, aggressive, upscaleFactor);
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