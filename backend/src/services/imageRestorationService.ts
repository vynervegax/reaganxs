import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

function run(args: string[], timeoutMs = 90_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const p = spawn('ffmpeg', ['-hide_banner', '-y', ...args], {
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let err = '';
    const t = setTimeout(() => {
      p.kill('SIGKILL');
      reject(new Error('Image restore timed out'));
    }, timeoutMs);
    p.stderr.on('data', (d) => (err += d.toString()));
    p.on('close', (c) => {
      clearTimeout(t);
      c === 0 ? resolve() : reject(new Error(err.slice(-1200) || `exit ${c}`));
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

/** Lightweight still enhance until real model worker is wired for images */
export const imageRestorationService = {
  async enhance(
    inputPath: string,
    model: string,
    opts: { maxWidth?: number } = {}
  ): Promise<string> {
    const dir = path.dirname(inputPath);
    const stem = path.basename(inputPath, path.extname(inputPath));
    const out = path.join(
      dir,
      `${stem}_restored_${model.replace(/[^\w.-]+/g, '_')}.png`
    );
    const maxWidth = opts.maxWidth ?? 2048;
    const vf = [
      `scale='min(${maxWidth},iw)':-2:flags=lanczos`,
      'hqdn3d=1.2:1.2:2:2',
      'unsharp=5:5:0.8:5:5:0.4',
      'eq=contrast=1.03:saturation=1.02',
    ].join(',');

    await run(['-i', inputPath, '-vf', vf, out]);
    if (sizeOf(out) === 0) throw new Error('Image enhance empty');
    return out;
  },
};