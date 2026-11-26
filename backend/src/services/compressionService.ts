import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { COMPRESS } from '../config/constants';

const AV1_TIMEOUT_MS = 45 * 60 * 1000;       // < ~800 MB
const AV1_TIMEOUT_LARGE_MS = 75 * 60 * 1000; // ≥ ~800 MB
const VP9_TIMEOUT_MS = 20 * 60 * 1000;
const VP9_TIMEOUT_LARGE_MS = 35 * 60 * 1000;

const LARGE_MB = 800;

export type CompressOptions = {
  /** Force VP9 only (demo, or free-web when connection is slow) */
  forceVp9?: boolean;
  /** 'demo' | 'free' | 'premium' | 'desktop' */
  tier?: string;
};

function inputMb(inputPath: string): number {
  try {
    return fs.statSync(inputPath).size / (1024 * 1024);
  } catch {
    return 0;
  }
}

function av1TimeoutFor(mb: number): number {
  return mb >= LARGE_MB ? AV1_TIMEOUT_LARGE_MS : AV1_TIMEOUT_MS;
}

function vp9TimeoutFor(mb: number): number {
  return mb >= LARGE_MB ? VP9_TIMEOUT_LARGE_MS : VP9_TIMEOUT_MS;
}

function av1PresetFor(mb: number): string {
  return mb >= LARGE_MB ? '10' : (COMPRESS.av1.preset ?? '8');
}

function av1CrfFor(mb: number): string {
  const base = COMPRESS.av1.crf ?? '28';
  if (mb >= LARGE_MB) return String(Math.min(34, Number(base) + 2));
  return base;
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

function savingsPercent(original: number, compressed: number): number {
  if (original <= 0) return 0;
  return ((original - compressed) / original) * 100;
}

async function encodeVp9(
  inputPath: string,
  vp9: string,
  audio: string[],
  timeoutMs: number
): Promise<number> {
  await run(
    [
      '-hide_banner', '-y',
      '-i', inputPath,
      '-map', '0:v:0',
      '-map', '0:a:0?',
      '-c:v', COMPRESS.vp9.codec,
      '-crf', COMPRESS.vp9.crf ?? '28',
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
    timeoutMs
  );

  if (!fs.existsSync(vp9) || fs.statSync(vp9).size === 0) {
    throw new Error('Compression failed (empty output)');
  }
  return fs.statSync(vp9).size;
}

export const compressionService = {
  async compress(
    inputPath: string,
    opts: CompressOptions = {}
  ): Promise<{
    outputPath: string;
    codec: string;
    compressedSize: number;
    savingsPercent: number;
    usedVp9BecauseSlow?: boolean;
  }> {
    const dir = path.dirname(inputPath);
    const stem = path.basename(inputPath, path.extname(inputPath));
    const av1 = path.join(dir, `${stem}_av1.mp4`);
    const vp9 = path.join(dir, `${stem}_vp9.webm`);

    const mb = inputMb(inputPath);
    const originalSize = fs.statSync(inputPath).size;
    const av1Timeout = av1TimeoutFor(mb);
    const vp9Timeout = vp9TimeoutFor(mb);
    const av1Preset = av1PresetFor(mb);
    const av1Crf = av1CrfFor(mb);

    // Demo is always VP9-only. Free web can force VP9 when connection is slow.
    const forceVp9 = !!opts.forceVp9 || opts.tier === 'demo';

    console.log(
      `[compress] input=${mb.toFixed(1)}MB forceVp9=${forceVp9} tier=${opts.tier ?? '-'} preset=${av1Preset} crf=${av1Crf}`
    );

    const audio = [
      '-c:a', COMPRESS.audio.codec,
      '-b:a', COMPRESS.audio.bitrate,
      '-ac', COMPRESS.audio.channels,
      '-ar', COMPRESS.audio.rate,
    ];

    if (forceVp9) {
      console.log('[compress] force VP9 (demo or slow free-web connection)');
      const vp9Size = await encodeVp9(inputPath, vp9, audio, vp9Timeout);
      return {
        outputPath: vp9,
        codec: COMPRESS.vp9.codec,
        compressedSize: vp9Size,
        savingsPercent: Math.round(savingsPercent(originalSize, vp9Size) * 10) / 10,
        usedVp9BecauseSlow: !!opts.forceVp9 && opts.tier !== 'demo',
      };
    }

    // Free / premium web: try AV1 first
    try {
      await run(
        [
          '-hide_banner', '-y',
          '-i', inputPath,
          '-map', '0:v:0',
          '-map', '0:a:0?',
          '-c:v', COMPRESS.av1.codec,
          '-preset', av1Preset,
          '-crf', av1Crf,
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
        const size = fs.statSync(av1).size;
        const savings = savingsPercent(originalSize, size);

        // Short stronger second pass only on smaller free files when savings are weak
        if (mb < LARGE_MB && savings < 50 && opts.tier === 'free') {
          const stronger = path.join(dir, `${stem}_av1_stronger.mp4`);
          try {
            await run(
              [
                '-hide_banner', '-y',
                '-i', inputPath,
                '-map', '0:v:0',
                '-map', '0:a:0?',
                '-c:v', COMPRESS.av1.codec,
                '-preset', '8',
                '-crf', String(Math.max(24, Number(av1Crf) - 2)),
                '-pix_fmt', 'yuv420p',
                '-svtav1-params', 'lp=1',
                '-threads', '2',
                ...audio,
                '-movflags', '+faststart',
                '-sn',
                stronger,
              ],
              Math.min(av1Timeout, 20 * 60 * 1000)
            );

            if (fs.existsSync(stronger) && fs.statSync(stronger).size > 0) {
              const sSize = fs.statSync(stronger).size;
              const sSavings = savingsPercent(originalSize, sSize);
              if (sSavings > savings + 5) {
                try { fs.unlinkSync(av1); } catch {}
                return {
                  outputPath: stronger,
                  codec: COMPRESS.av1.codec,
                  compressedSize: sSize,
                  savingsPercent: Math.round(sSavings * 10) / 10,
                };
              }
              try { fs.unlinkSync(stronger); } catch {}
            }
          } catch {
            try { fs.unlinkSync(stronger); } catch {}
          }
        }

        return {
          outputPath: av1,
          codec: COMPRESS.av1.codec,
          compressedSize: size,
          savingsPercent: Math.round(savings * 10) / 10,
        };
      }
    } catch (e: any) {
      console.warn('[compress] AV1 → VP9', e?.message?.slice?.(0, 200));
    }

    // VP9 fallback
    const vp9Size = await encodeVp9(inputPath, vp9, audio, vp9Timeout);
    return {
      outputPath: vp9,
      codec: COMPRESS.vp9.codec,
      compressedSize: vp9Size,
      savingsPercent: Math.round(savingsPercent(originalSize, vp9Size) * 10) / 10,
    };
  },
};