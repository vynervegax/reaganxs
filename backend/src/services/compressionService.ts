import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { COMPRESS } from '../config/constants';

const AV1_TIMEOUT_MS = 25 * 60 * 1000;           // < 800 MB
const AV1_TIMEOUT_LARGE_MS = 40 * 60 * 1000;     // 800–1500 MB
const AV1_TIMEOUT_HUGE_MS = 65 * 60 * 1000;      // ≥ 1500 MB (up to ~3 GB → ~1 h)

const VP9_TIMEOUT_MS = 12 * 60 * 1000;
const VP9_TIMEOUT_LARGE_MS = 20 * 60 * 1000;
const VP9_TIMEOUT_HUGE_MS = 35 * 60 * 1000;

const LARGE_MB = 800;
const HUGE_MB = 1500;

function inputMb(inputPath: string): number {
  try {
    return fs.statSync(inputPath).size / (1024 * 1024);
  } catch {
    return 0;
  }
}

function sizeClass(mb: number): 'normal' | 'large' | 'huge' {
  if (mb >= HUGE_MB) return 'huge';
  if (mb >= LARGE_MB) return 'large';
  return 'normal';
}

function av1TimeoutFor(mb: number): number {
  const c = sizeClass(mb);
  if (c === 'huge') return AV1_TIMEOUT_HUGE_MS;
  if (c === 'large') return AV1_TIMEOUT_LARGE_MS;
  return AV1_TIMEOUT_MS;
}

function vp9TimeoutFor(mb: number): number {
  const c = sizeClass(mb);
  if (c === 'huge') return VP9_TIMEOUT_HUGE_MS;
  if (c === 'large') return VP9_TIMEOUT_LARGE_MS;
  return VP9_TIMEOUT_MS;
}

/** Faster presets on bigger files so 3 GB stays near 1 hour. CRF unchanged. */
function av1PresetFor(mb: number): string {
  if (mb >= 2500) return '13';
  if (mb >= HUGE_MB) return '12';
  if (mb >= LARGE_MB) return '11';
  return COMPRESS.av1.preset; // '8'
}

function threadCount(): string {
  const n = Math.min(6, Math.max(2, os.cpus().length));
  return String(n);
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
    const av1Timeout = av1TimeoutFor(mb);
    const vp9Timeout = vp9TimeoutFor(mb);
    const av1Preset = av1PresetFor(mb);
    const threads = threadCount();

    console.log(
      `[compress] input=${mb.toFixed(1)}MB class=${sizeClass(mb)} av1Timeout=${Math.round(av1Timeout / 1000)}s vp9Timeout=${Math.round(vp9Timeout / 1000)}s preset=${av1Preset} threads=${threads}`
    );

    const audio = [
      '-c:a', COMPRESS.audio.codec,
      '-b:a', COMPRESS.audio.bitrate,
      '-ac', COMPRESS.audio.channels,
      '-ar', COMPRESS.audio.rate,
    ];

    // Full resolution, CRF 28
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
          '-threads', threads,
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

    // Fast VP9 fallback
    const cpuUsed = mb >= HUGE_MB ? '8' : mb >= LARGE_MB ? '7' : '5';
    await run(
      [
        '-hide_banner', '-y',
        '-i', inputPath,
        '-map', '0:v:0',
        '-map', '0:a:0?',
        '-c:v', COMPRESS.vp9.codec,
        '-crf', COMPRESS.vp9.crf,
        '-b:v', '0',
        '-cpu-used', cpuUsed,
        '-deadline', 'realtime',
        '-row-mt', '1',
        '-threads', threads,
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