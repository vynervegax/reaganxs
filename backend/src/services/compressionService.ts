import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { COMPRESS } from '../config/constants';

function run(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    console.log('[compress]', args.join(' '));
    const p = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe'] });
    let err = '';
    p.stderr.on('data', (d) => (err += d.toString()));
    p.on('close', (code) =>
      code === 0 ? resolve() : reject(new Error(err.slice(-2000)))
    );
    p.on('error', reject);
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

    const audio = [
      '-c:a', COMPRESS.audio.codec,
      '-b:a', COMPRESS.audio.bitrate,
      '-ac', COMPRESS.audio.channels,
      '-ar', COMPRESS.audio.rate,
    ];

    // Full duration — never -t (match desktop)
    try {
      await run([
        '-hide_banner', '-y',
        '-i', inputPath,
        '-map', '0:v:0',
        '-map', '0:a:0?',
        '-c:v', COMPRESS.av1.codec,
        '-preset', COMPRESS.av1.preset,
        '-crf', COMPRESS.av1.crf,
        ...audio,
        '-movflags', '+faststart',
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
      '-hide_banner', '-y',
      '-i', inputPath,
      '-map', '0:v:0',
      '-map', '0:a:0?',
      '-c:v', COMPRESS.vp9.codec,
      '-crf', COMPRESS.vp9.crf,
      '-b:v', '0',
      '-row-mt', '1',
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