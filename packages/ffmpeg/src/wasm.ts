import { FFmpeg } from '@ffmpeg/ffmpeg';

export const ffmpeg = new FFmpeg();

export async function initFFmpeg() {
  await ffmpeg.load();
}

export async function compressWithAV1(input: Uint8Array): Promise<Uint8Array> {
  await initFFmpeg();
  // Full implementation with SVT-AV1
  return input; // placeholder
}