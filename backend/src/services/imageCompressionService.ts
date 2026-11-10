import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

function run(args: string[], timeoutMs = 120_000): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log('[img-compress]', args.join(' '));
    const p = spawn('ffmpeg', ['-hide_banner', '-y', ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let err = '';
    const t = setTimeout(() => {
      p.kill('SIGKILL');
      reject(new Error('Image compress timed out'));
    }, timeoutMs);
    p.stderr.on('data', (d) => (err += d.toString()));
    p.on('close', (c) => {
      clearTimeout(t);
      c === 0 ? resolve() : reject(new Error(err.slice(-1500) || `exit ${c}`));
    });
    p.on('error', (e) => {
      clearTimeout(t);
      reject(e);
    });
  });
}

function sizeOf(p: string) {
  try {
    return fs.statSync(p).size;
  } catch {
    return 0;
  }
}

export const imageCompressionService = {
  /**
   * Compress still: AVIF first, WebP fallback.
   * Returns path + codec label.
   */
  async compress(
    inputPath: string,
    opts: { maxWidth?: number; quality?: number } = {}
  ): Promise<{ outputPath: string; codec: string; compressedSize: number }> {
    if (!fs.existsSync(inputPath)) {
      throw new Error(`Image missing: ${inputPath}`);
    }

    const dir = path.dirname(inputPath);
    const stem = path.basename(inputPath, path.extname(inputPath));
    const maxWidth = opts.maxWidth ?? 2560;
    const q = opts.quality ?? 50; // AVIF cq-level-ish via -crf for libaom

    const avifOut = path.join(dir, `${stem}_rx.avif`);
    const webpOut = path.join(dir, `${stem}_rx.webp`);
    const scale = `scale='min(${maxWidth},iw)':-2:flags=lanczos`;

    try {
      await run([
        '-i',
        inputPath,
        '-vf',
        scale,
        '-c:v',
        'libaom-av1',
        '-still-picture',
        '1',
        '-crf',
        String(Math.min(63, Math.max(20, q))),
        '-cpu-used',
        '6',
        avifOut,
      ]);
      if (sizeOf(avifOut) > 0) {
        return {
          outputPath: avifOut,
          codec: 'avif',
          compressedSize: sizeOf(avifOut),
        };
      }
    } catch (e: any) {
      console.warn('[img-compress] AVIF failed → WebP', e?.message?.slice?.(0, 200));
    }

    await run([
      '-i',
      inputPath,
      '-vf',
      scale,
      '-c:v',
      'libwebp',
      '-quality',
      String(Math.min(95, Math.max(40, 100 - q))),
      webpOut,
    ]);

    if (sizeOf(webpOut) === 0) {
      throw new Error('Image compression produced empty output');
    }

    return {
      outputPath: webpOut,
      codec: 'webp',
      compressedSize: sizeOf(webpOut),
    };
  },
};