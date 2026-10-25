import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { COMPRESS } from '../config/constants';

const AV1_TIMEOUT_MS = 45 * 60 * 1000; // < ~800 MB
const AV1_TIMEOUT_LARGE_MS = 75 * 60 * 1000; // ≥ ~800 MB
const VP9_TIMEOUT_MS = 20 * 60 * 1000;
const VP9_TIMEOUT_LARGE_MS = 35 * 60 * 1000;

const LARGE_MB = 800;

function inputMb(inputPath: string): number {
  try {
    return fs.statSync(inputPath).size / (1024 * 1024);
  } catch {
    return 0;
  }
}

function av1TimeoutFor(inputPath: string): number {
  return inputMb(inputPath) >= LARGE_MB ? AV1_TIMEOUT_LARGE_MS : AV1_TIMEOUT_MS;
}

function vp9TimeoutFor(inputPath: string): number {
  return inputMb(inputPath) >= LARGE_MB ? VP9_TIMEOUT_LARGE_MS : VP9_TIMEOUT_MS;
}

/** Slightly faster preset only for very large inputs; CRF stays the same */
function av1PresetFor(inputPath: string): string {
  return inputMb(inputPath) >= LARGE_MB ? '10' : COMPRESS.av1.preset;
}

function run(args: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log('[compress]', args.join(' '));
    const p = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let err = '';
    const timer = setTimeout(() => {
      p.kill('SIGKILL');
      reject(
        new Error(`FFmpeg timed out after ${Math.round(timeoutMs / 1000)}s`)
      );
    }, timeoutMs);

    p.stderr.on('data', (d) => (err += d.toString()));

    p.on('close', (code, signal) => {
      clearTimeout(timer);
      if (code === 0) return resolve();
      if (signal === 'SIGKILL') {
        return reject(new Error('FFmpeg killed (likely OOM or timeout)'));
      }
      reject(new Error(err.slice(-2000) || `FFmpeg exited with code ${code}`));
    });

    p.on('error', (e) => {
      clearTimeout(timer);
      reject(e);
    });
  });
}

export const compressionService = {
  async compress(inputPath: string): Promise<{
    outputPath: string;
    codec: string;
    compressedSize: number;
  }> {
    const dir = path.dirname(inputPath);
    const stem = path.basename(inputPath, path.extname(inputPath));
    const av1 = path.join(dir, `${stem}_av1.mp4`);
    const vp9 = path.join(dir, `${stem}_vp9.webm`);

    const mb = inputMb(inputPath);
    const av1Timeout = av1TimeoutFor(inputPath);
    const vp9Timeout = vp9TimeoutFor(inputPath);
    const av1Preset = av1PresetFor(inputPath);

    console.log(
      `[compress] input=${mb.toFixed(1)}MB av1Timeout=${Math.round(av1Timeout / 1000)}s vp9Timeout=${Math.round(vp9Timeout / 1000)}s preset=${av1Preset}`
    );

    const audio = [
      '-c:a', COMPRESS.audio.codec,
      '-b:a', COMPRESS.audio.bitrate,
      '-ac', COMPRESS.audio.channels,
      '-ar', COMPRESS.audio.rate,
    ];

    // Full resolution — no scale
    try {
      await run(
        [
          '-hide_banner', '-y',
          '-i', inputPath,
          '-map', '0:v:0',
          '-map', '0:a:0?',
          '-c:v', COMPRESS.av1.codec,
          '-preset', av1Preset,
          '-crf', COMPRESS.av1.crf,
          '-pix_fmt', 'yuv420p',
          '-svtav1-params', 'lp=1',
          '-threads', '2',
          ...audio,
          '-movflags', '+faststart',
          '-sn',
          av1,
        ],
        av1Timeout
      );

      if (fs.existsSync(av1) && fs.statSync(av1).size > 0) {
        return {
          outputPath: av1,
          codec: COMPRESS.av1.codec,
          compressedSize: fs.statSync(av1).size,
        };
      }
    } catch (e: any) {
      console.warn('[compress] AV1 → VP9', e?.message?.slice?.(0, 200));
    }

    // Fast VP9 fallback (still CRF 28 for size target)
    await run(
      [
        '-hide_banner', '-y',
        '-i', inputPath,
        '-map', '0:v:0',
        '-map', '0:a:0?',
        '-c:v', COMPRESS.vp9.codec,
        '-crf', COMPRESS.vp9.crf,
        '-b:v', '0',
        '-cpu-used', '8',
        '-deadline', 'realtime',
        '-row-mt', '1',
        '-threads', '2',
        '-pix_fmt', 'yuv420p',
        ...audio,
        '-sn',
        vp9,
      ],
      vp9Timeout
    );

    if (!fs.existsSync(vp9) || fs.statSync(vp9).size === 0) {
      throw new Error('Compression failed (empty output)');
    }

    return {
      outputPath: vp9,
      codec: COMPRESS.vp9.codec,
      compressedSize: fs.statSync(vp9).size,
    };
  },
};