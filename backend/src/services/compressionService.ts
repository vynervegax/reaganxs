import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { COMPRESS } from '../config/constants';

const AV1_TIMEOUT_MS = 20 * 60 * 1000;           // < 500 MB
const AV1_TIMEOUT_LARGE_MS = 30 * 60 * 1000;     // 500–1000 MB
const AV1_TIMEOUT_HUGE_MS = 40 * 60 * 1000;      // ≥ 1000 MB

const VP9_TIMEOUT_MS = 8 * 60 * 1000;
const VP9_TIMEOUT_LARGE_MS = 12 * 60 * 1000;
const VP9_TIMEOUT_HUGE_MS = 40 * 60 * 1000;

const SKIP_AV1_MB = 500;
const LARGE_MB = 500;
const HUGE_MB = 1000;

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

/** Relaxed default presets (speed still prioritised on large files) */
function av1PresetFor(mb: number): string {
  if (mb >= HUGE_MB) return '12';
  if (mb >= LARGE_MB) return '11';
  return '9';
}

/** Relaxed default CRF — higher quality than before */
function av1CrfFor(mb: number): string {
  if (mb >= HUGE_MB) return '30';
  if (mb >= LARGE_MB) return '29';
  return '28';
}

/** Stronger CRF used only when savings < 50 % */
function av1CrfAggressiveFor(mb: number): string {
  if (mb >= HUGE_MB) return '34';
  if (mb >= LARGE_MB) return '33';
  return '32';
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

function savingsPercent(originalBytes: number, compressedBytes: number): number {
  if (originalBytes <= 0) return 0;
  return ((originalBytes - compressedBytes) / originalBytes) * 100;
}

export const compressionService = {
  async compress(inputPath: string): Promise<{
    outputPath: string;
    codec: string;
    compressedSize: number;
    savingsPercent: number;
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
    const skipAv1 = mb >= SKIP_AV1_MB;

    console.log(
      `[compress] input=${mb.toFixed(1)}MB class=${sizeClass(mb)} skipAv1=${skipAv1} preset=${av1Preset} crf=${av1Crf}`
    );

    const audio = [
      '-c:a', COMPRESS.audio.codec,
      '-b:a', COMPRESS.audio.bitrate,
      '-ac', COMPRESS.audio.channels,
      '-ar', COMPRESS.audio.rate,
    ];

    const scale =
      mb >= 1500
        ? ['-vf', 'scale=min(1280\\,iw):-2']
        : mb >= HUGE_MB
          ? ['-vf', 'scale=min(1600\\,iw):-2']
          : mb >= LARGE_MB
            ? ['-vf', 'scale=min(1920\\,iw):-2']
            : [];

    let finalPath = '';
    let finalCodec = '';
    let finalSize = 0;

    // ---------- First pass (relaxed) ----------
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
            '-crf', av1Crf,
            '-pix_fmt', 'yuv420p',
            '-svtav1-params', 'lp=1:tune=0',
            '-threads', '2',
            ...scale,
            ...audio,
            '-movflags', '+faststart',
            '-sn',
            av1,
          ],
          av1Timeout
        );

        if (fs.existsSync(av1) && fs.statSync(av1).size > 0) {
          finalPath = av1;
          finalCodec = COMPRESS.av1.codec;
          finalSize = fs.statSync(av1).size;
        }
      } catch (e: any) {
        console.warn('[compress] AV1 first pass failed → VP9', e?.message?.slice?.(0, 200));
      }
    }

    // ---------- Second pass (more aggressive) only if savings < 50 % ----------
    if (finalPath) {
      const savings = savingsPercent(originalSize, finalSize);
      console.log(`[compress] first-pass savings=${savings.toFixed(1)}%`);

      if (savings < 50 && !skipAv1) {
        console.log('[compress] savings < 50% → second pass (more aggressive)');
        const aggressiveCrf = av1CrfAggressiveFor(mb);
        const aggressivePath = path.join(dir, `${stem}_av1_aggressive.mp4`);

        try {
          await run(
            [
              '-hide_banner', '-y',
              '-i', inputPath,
              '-map', '0:v:0',
              '-map', '0:a:0?',
              '-c:v', COMPRESS.av1.codec,
              '-preset', '10',          // faster preset for second pass
              '-crf', aggressiveCrf,
              '-pix_fmt', 'yuv420p',
              '-svtav1-params', 'lp=1:tune=0',
              '-threads', '2',
              ...scale,
              ...audio,
              '-movflags', '+faststart',
              '-sn',
              aggressivePath,
            ],
            av1Timeout
          );

          if (fs.existsSync(aggressivePath) && fs.statSync(aggressivePath).size > 0) {
            const aggressiveSize = fs.statSync(aggressivePath).size;
            const aggressiveSavings = savingsPercent(originalSize, aggressiveSize);

            // Keep the better of the two (prefer higher savings, or first pass if close)
            if (aggressiveSavings > savings + 5) {
              try { fs.unlinkSync(finalPath); } catch {}
              finalPath = aggressivePath;
              finalSize = aggressiveSize;
              console.log(`[compress] second pass kept (savings=${aggressiveSavings.toFixed(1)}%)`);
            } else {
              try { fs.unlinkSync(aggressivePath); } catch {}
              console.log('[compress] second pass discarded (not enough improvement)');
            }
          }
        } catch (e: any) {
          console.warn('[compress] aggressive second pass failed', e?.message?.slice?.(0, 200));
          try { fs.unlinkSync(aggressivePath); } catch {}
        }
      }
    }

    // ---------- VP9 fallback (unchanged) ----------
    if (!finalPath) {
      console.log('[compress] falling back to VP9');
      const cpuUsed = mb >= HUGE_MB ? '8' : mb >= LARGE_MB ? '7' : '6';
      const vp9Crf = mb >= HUGE_MB ? '32' : mb >= LARGE_MB ? '31' : '30'; // slightly relaxed

      await run(
        [
          '-hide_banner', '-y',
          '-i', inputPath,
          '-map', '0:v:0',
          '-map', '0:a:0?',
          '-c:v', COMPRESS.vp9.codec,
          '-crf', vp9Crf,
          '-b:v', '0',
          '-cpu-used', cpuUsed,
          '-deadline', 'realtime',
          '-row-mt', '1',
          '-threads', '2',
          '-pix_fmt', 'yuv420p',
          ...scale,
          ...audio,
          '-sn',
          vp9,
        ],
        vp9Timeout
      );

      if (!fs.existsSync(vp9) || fs.statSync(vp9).size === 0) {
        throw new Error('Compression failed (empty output)');
      }

      finalPath = vp9;
      finalCodec = COMPRESS.vp9.codec;
      finalSize = fs.statSync(vp9).size;
    }

    const finalSavings = savingsPercent(originalSize, finalSize);

    return {
      outputPath: finalPath,
      codec: finalCodec,
      compressedSize: finalSize,
      savingsPercent: Math.round(finalSavings * 10) / 10,
    };
  },
};