import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { COMPRESS } from '../config/constants';

const COMPRESS_TIMEOUT_MS = 60 * 60 * 1000; // 60 min for large files on Hobby

function run(args: string[], timeoutMs = COMPRESS_TIMEOUT_MS): Promise<void> {
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

/**
 * Size-aware presets — balance speed vs quality.
 * Mid band (400–800 MB) gets mild scale so ~470 MB doesn't take ~40 min
 * while ~1 GB+ stays in the fast path you already saw.
 */
function presetsForSize(inputBytes: number): {
  av1Preset: string;
  av1Crf: string;
  vp9Crf: string;
  scaleFilter?: string;
} {
  const mb = inputBytes / (1024 * 1024);

  // Small: quality bias
  if (mb < 100) {
    return { av1Preset: '8', av1Crf: '33', vp9Crf: '32' };
  }

  // Medium: a bit faster, full resolution
  if (mb < 400) {
    return { av1Preset: '10', av1Crf: '34', vp9Crf: '34' };
  }

  // Mid-large (e.g. ~470 MB): preset 11 + cap width — closes the 40 min gap
  if (mb < 800) {
    return {
      av1Preset: '11',
      av1Crf: '34',
      vp9Crf: '34',
      scaleFilter: "scale='min(1280,iw)':-2:flags=lanczos",
    };
  }

  // Very large (e.g. 1.27 GB): fastest practical path
  return {
    av1Preset: '12',
    av1Crf: '35',
    vp9Crf: '35',
    scaleFilter: "scale='min(1280,iw)':-2:flags=lanczos",
  };
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

    let inputBytes = 0;
    try {
      inputBytes = fs.statSync(inputPath).size;
    } catch {
      /* ignore */
    }
    const p = presetsForSize(inputBytes);
    console.log(
      `[compress] size=${(inputBytes / 1024 / 1024).toFixed(1)}MB preset=${p.av1Preset} crf=${p.av1Crf}${
        p.scaleFilter ? ' scale=1280' : ''
      }`
    );

    const audio = [
      '-c:a',
      COMPRESS.audio.codec,
      '-b:a',
      COMPRESS.audio.bitrate,
      '-ac',
      COMPRESS.audio.channels,
      '-ar',
      COMPRESS.audio.rate,
    ];
    const vf = p.scaleFilter ? ['-vf', p.scaleFilter] : [];

    try {
      await run([
        '-hide_banner',
        '-y',
        '-i',
        inputPath,
        ...vf,
        '-map',
        '0:v:0',
        '-map',
        '0:a:0?',
        '-c:v',
        COMPRESS.av1.codec,
        '-preset',
        p.av1Preset,
        '-crf',
        p.av1Crf,
        '-svtav1-params',
        'lp=1',
        '-threads',
        '2',
        ...audio,
        '-movflags',
        '+faststart',
        '-sn',
        av1,
      ]);

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

    await run([
      '-hide_banner',
      '-y',
      '-i',
      inputPath,
      ...vf,
      '-map',
      '0:v:0',
      '-map',
      '0:a:0?',
      '-c:v',
      COMPRESS.vp9.codec,
      '-crf',
      p.vp9Crf,
      '-b:v',
      '0',
      '-row-mt',
      '1',
      '-threads',
      '2',
      ...audio,
      '-sn',
      vp9,
    ]);

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