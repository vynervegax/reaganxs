import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import {
  MODEL_FILES,
  MODELS_DIR,
  MODEL_DISPLAY,
} from '../config/constants';

const FULL_RESTORE_TIMEOUT_MS = 10 * 60 * 1000; // 10 min
const FRAME_TIMEOUT_MS = 90 * 1000;

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

async function sharpen(casStrength: number, unsharpFallback: string): Promise<string> {
  return (await hasCas()) ? `cas=${casStrength}` : unsharpFallback;
}

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
  if (codec === 'opus') return ['-c:a', 'copy'];
  return ['-c:a', 'libopus', '-b:a', '96k', '-ac', '2', '-ar', '48000'];
}

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
    console.warn('[restore] full AV1 failed/timed out', msg.slice?.(0, 200) || msg);
    throw e instanceof Error ? e : new Error(msg);
  }
}

function shouldUseAggressive(opts: RestoreOptions, savingsPercent?: number): boolean {
  if (opts.forceAggressive) return true;
  if (opts.forceLight) return false;
  if (savingsPercent != null && savingsPercent > 35) return true;
  return false;
}

function shouldUpscale(opts: RestoreOptions, savingsPercent?: number): boolean {
  if (opts.forceUpscale) return true;
  if (opts.forceNoUpscale) return false;
  const factor = opts.upscaleFactor ?? 1;
  if (factor <= 1) return false;
  if (savingsPercent != null && savingsPercent > 30) return true;
  return false;
}

async function buildScaleFilter(maxWidth: number, upscaleFactor: number, preferGpu = true): Promise<string> {
  // Upscale path: no maxWidth cap (max output)
  if (upscaleFactor > 1 && preferGpu) {
    const { hasPlacebo, hasNpp } = await probeFilters();
    if (hasPlacebo) {
      return `libplacebo=w=trunc(iw*${upscaleFactor}/2)*2:h=trunc(ih*${upscaleFactor}/2)*2:upscaler=ewa_lanczos:deband=1:deband_iterations=1`;
    }
    if (hasNpp) {
      return `scale_npp=w=trunc(iw*${upscaleFactor}/2)*2:h=trunc(ih*${upscaleFactor}/2)*2:interp_algo=lanczos`;
    }
  }

  if (upscaleFactor > 1) {
    return `scale=trunc(iw*${upscaleFactor}/2)*2:trunc(ih*${upscaleFactor}/2)*2:flags=lanczos+accurate_rnd+full_chroma_int`;
  }

  // Non-upscale: respect maxWidth (quality-oriented Lanczos)
  return `scale='min(${maxWidth},iw)':-2:flags=lanczos+accurate_rnd+full_chroma_int`;
}

async function buildVideoFilter(
  maxWidth: number,
  aggressive: boolean,
  upscaleFactor: number
): Promise<string> {
  const scale = await buildScaleFilter(maxWidth, upscaleFactor);

  if (aggressive) {
    // Stronger chain (closer to the old high-quality version)
    return [
      scale,
      'hqdn3d=1.8:1.8:3.0:3.0',
      'eq=contrast=1.06:saturation=1.05',
      await sharpen(0.42, 'unsharp=5:5:1.3:5:5:0.65'),
    ].join(',');
  }

  // Default chain — quality-focused but still fast (matches the old “best” feel)
  return [
    scale,
    'hqdn3d=1.4:1.4:2.8:2.8',
    'eq=contrast=1.05:saturation=1.04',
    await sharpen(0.36, 'unsharp=5:5:1.1:5:5:0.55'),
  ].join(',');
}

export type RestoreOptions = {
  maxWidth?: number;
  maxSeconds?: number;
  forceAggressive?: boolean;
  forceLight?: boolean;
  durationSec?: number;
  savingsPercent?: number;
  upscaleFactor?: number;
  forceUpscale?: boolean;
  forceNoUpscale?: boolean;
};

export const restorationService = {
  weightPath(modelId: string) {
    return path.join(MODELS_DIR, MODEL_FILES[modelId] || MODEL_FILES['atd-webphoto']);
  },

  displayName(modelId: string) {
    return MODEL_DISPLAY[modelId] || modelId;
  },

  async restore(inputPath: string, model: string, opts: RestoreOptions = {}): Promise<string> {
    if (!fs.existsSync(inputPath)) {
      throw new Error(`Restore input missing: ${inputPath}`);
    }

    const dir = path.dirname(inputPath);
    const stem = path.basename(inputPath, path.extname(inputPath));
    const outPath = path.join(dir, `${stem}_restored_${model.replace(/[^\w.-]+/g, '_')}.mp4`);

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

  async runModelWorker(_input: string, _out: string, model: string, _opts: RestoreOptions): Promise<void> {
    const weights = this.weightPath(model);
    if (!fs.existsSync(weights)) {
      throw new Error(`Weight missing: ${weights}`);
    }
    throw new Error(`Model worker not configured for ${model}`);
  },

  async ffmpegEnhance(inputPath: string, outPath: string, opts: RestoreOptions = {}): Promise<void> {
    let source = inputPath;
    const workDir = path.dirname(outPath);

    if (opts.maxSeconds && opts.maxSeconds > 0) {
      const slice = path.join(workDir, `slice_${Date.now()}.mp4`);
      await run(['-t', String(opts.maxSeconds), '-i', inputPath, '-c', 'copy', slice], FRAME_TIMEOUT_MS);
      source = slice;
    }

    const maxWidth = opts.maxWidth ?? 1920;
    const aggressive = shouldUseAggressive(opts, opts.savingsPercent);
    const doUpscale = shouldUpscale(opts, opts.savingsPercent);
    const upscaleFactor = doUpscale ? (opts.upscaleFactor ?? 2) : 1;

    const vf = await buildVideoFilter(maxWidth, aggressive, upscaleFactor);
    await encodeAv1OrVp9(source, outPath, vf);
  },
};