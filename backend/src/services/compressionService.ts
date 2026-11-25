import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { COMPRESS } from '../config/constants';

const AV1_TIMEOUT_MS = 35 * 60 * 1000;        // < 800 MB
const AV1_TIMEOUT_LARGE_MS = 50 * 60 * 1000;  // 800–1500 MB
const AV1_TIMEOUT_HUGE_MS = 40 * 60 * 1000;   // ≥ 1500 MB (shorter, force faster path)

const VP9_TIMEOUT_MS = 15 * 60 * 1000;
const VP9_TIMEOUT_LARGE_MS = 25 * 60 * 1000;
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

/** Faster presets on big files so they finish. CRF stays 28. */
function av1PresetFor(mb: number): string {
  if (mb >= HUGE_MB) return '12';
  if (mb >= LARGE_MB) return '10';
  return '8';
}

function run(args: string[], timeoutMs: number): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log('[compress]', args.join(' '));
    const p = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });

    let err = '';
    const timer = setTimeout(() => {
      p.kill('SIGKILL');
      reject(new Error(`FFmpeg timed out after ${Math.round(timeoutMs / 1000)}s`));
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
  return [
    '-c:a', COMPRESS.audio.codec,
    '-b:a', COMPRESS.audio.bitrate,
    '-ac', COMPRESS.audio.channels,
    '-ar', COMPRESS.audio.rate,
  ];
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
    const cls = sizeClass(mb);
    const av1Timeout = av1TimeoutFor(mb);
    const vp9Timeout = vp9TimeoutFor(mb);
    const av1Preset = av1PresetFor(mb);
    const audio = await audioArgs(inputPath);

    // For huge files skip AV1 entirely — it almost never finishes in time
    const skipAv1 = cls === 'huge';

    console.log(
      `[compress] input=${mb.toFixed(1)}MB class=${cls} skipAv1=${skipAv1} av1Timeout=${Math.round(av1Timeout / 1000)}s vp9Timeout=${Math.round(vp9Timeout / 1000)}s preset=${av1Preset}`
    );

    // Full resolution — no scale
    if (!skipAv1) {
      try {
        await run(
          [
            '-hide_banner', '-y',
            '-i', inputPath,
            '-map', '0:v:0',
            '-map', '0:a:0?',
            '-c:v', COMPRESS.av1.codec,
            '-preset', av1Preset,
            '-crf', COMPRESS.av1.crf,          // 28
            '-pix_fmt', 'yuv420p',
            '-svtav1-params', 'lp=1:tune=0',
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
    }

    // VP9 fallback — faster settings on huge files
    const cpuUsed = cls === 'huge' ? '8' : cls === 'large' ? '7' : '6';
    const deadline = cls === 'huge' ? 'realtime' : 'good';

    await run(
      [
        '-hide_banner', '-y',
        '-i', inputPath,
        '-map', '0:v:0',
        '-map', '0:a:0?',
        '-c:v', COMPRESS.vp9.codec,
        '-crf', COMPRESS.vp9.crf,             // 28
        '-b:v', '0',
        '-cpu-used', cpuUsed,
        '-deadline', deadline,
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