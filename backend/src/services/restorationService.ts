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
 * Full-timeline restore encode.
 * On AV1 failure/timeout, throw so the caller can handle it (no partial-frames fallback).
 */
async function encodeAv1OrVp9(
  inputPath: string,
  outPath: string,
  vf?: string
): Promise<'libsvtav1'> {
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

    throw new Error('Full restore AV1 produced empty output');
  } catch (e: any) {
    const msg = e?.message || String(e);
    console.warn(
      '[restore] full AV1 failed/timed out',
      msg.slice?.(0, 200) || msg
    );
    throw e instanceof Error ? e : new Error(msg);
  }
}

export type RestoreOptions = {
  maxWidth?: number;
  maxSeconds?: number;
savingsPercent?: number;
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
};