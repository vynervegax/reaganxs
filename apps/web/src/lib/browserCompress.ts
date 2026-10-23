import { FFmpeg } from '@ffmpeg/ffmpeg';
import { fetchFile, toBlobURL } from '@ffmpeg/util';

let ffmpeg: FFmpeg | null = null;
let loading: Promise<void> | null = null;

async function getFFmpeg(onLog?: (msg: string) => void): Promise<FFmpeg> {
  if (ffmpeg?.loaded) return ffmpeg;

  if (!loading) {
    loading = (async () => {
      ffmpeg = new FFmpeg();
      if (onLog) {
        ffmpeg.on('log', ({ message }) => onLog(message));
      }

      const base = 'https://unpkg.com/@ffmpeg/core@0.12.6/dist/esm';
      await ffmpeg.load({
        coreURL: await toBlobURL(`${base}/ffmpeg-core.js`, 'text/javascript'),
        wasmURL: await toBlobURL(`${base}/ffmpeg-core.wasm`, 'application/wasm'),
      });
    })();
  }

  await loading;
  return ffmpeg!;
}

export type BrowserCompressResult = {
  blob: Blob;
  codec: string;
  compressedSize: number;
};

export async function compressInBrowser(
  file: File,
  onProgress?: (ratio: number) => void,
  onStatus?: (msg: string) => void
): Promise<BrowserCompressResult> {
  onStatus?.('Loading encoder on your device…');
  const ff = await getFFmpeg();

  const inputName = 'input' + (file.name.match(/\.\w+$/)?.[0] || '.mp4');
  const outputName = 'output.webm';

  await ff.writeFile(inputName, await fetchFile(file));

  ff.on('progress', ({ progress }) => {
    if (typeof progress === 'number' && progress >= 0 && progress <= 1) {
      onProgress?.(progress);
    }
  });

  onStatus?.('Compressing on your device…');

  await ff.exec([
    '-i', inputName,
    '-c:v', 'libvpx-vp9',
    '-crf', '28',
    '-b:v', '0',
    '-row-mt', '1',
    '-c:a', 'libopus',
    '-b:a', '96k',
    '-ac', '2',
    '-ar', '48000',
    '-y',
    outputName,
  ]);

  const data = await ff.readFile(outputName);

  const u8 =
    typeof data === 'string'
      ? new TextEncoder().encode(data)
      : data instanceof Uint8Array
        ? data
        : new Uint8Array(data as ArrayBuffer);

  const copy = new Uint8Array(u8.byteLength);
  copy.set(u8);
  const blob = new Blob([copy], { type: 'video/webm' });

  try {
    await ff.deleteFile(inputName);
    await ff.deleteFile(outputName);
  } catch {
    /* ignore */
  }

  return {
    blob,
    codec: 'libvpx-vp9',
    compressedSize: blob.size,
  };
}