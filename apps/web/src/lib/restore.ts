// src/lib/restore.ts
import * as ort from 'onnxruntime-web';

const MODEL_URLS = {
  rgt: 'https://pub-3e1cccdd28344fe2bf9883405d1f1e4f.r2.dev/models/4xRealWebPhoto_v2_rtg_s.onnx',
  atd: 'https://your-r2-public-or-signed.r2.dev/models/atd.onnx',
  bhi: 'https://pub-3e1cccdd28344fe2bf9883405d1f1e4f.r2.dev/models/4xBHI_realplksr_dysample_real.onnx',
};

let sessions: Record<string, ort.InferenceSession> = {};

export async function loadModel(name: 'rgt' | 'atd' | 'bhi') {
  if (sessions[name]) return sessions[name];
  const url = MODEL_URLS[name];
  sessions[name] = await ort.InferenceSession.create(url, {
    executionProviders: ['webgpu', 'wasm'],
  });
  return sessions[name];
}

/**
 * Helper: Convert ImageData to Float32Array Tensor [1, 3, height, width]
 */
function preprocessImage(imageData: ImageData): ort.Tensor {
  const { data, width, height } = imageData;
  const input = new Float32Array(1 * 3 * height * width);
  for (let i = 0; i < width * height; i++) {
    input[i] = data[i * 4] / 255;
    input[width * height + i] = data[i * 4 + 1] / 255;
    input[2 * width * height + i] = data[i * 4 + 2] / 255;
  }
  return new ort.Tensor('float32', input, [1, 3, height, width]);
}

/**
 * Helper: Convert model output Float32Array to ImageData
 */
function postprocessOutput(output: Float32Array, outW: number, outH: number, ctx: CanvasRenderingContext2D): ImageData {
  const outImage = ctx.createImageData(outW, outH);
  for (let i = 0; i < outW * outH; i++) {
    outImage.data[i * 4] = Math.min(255, Math.max(0, output[i] * 255));
    outImage.data[i * 4 + 1] = Math.min(255, Math.max(0, output[outW * outH + i] * 255));
    outImage.data[i * 4 + 2] = Math.min(255, Math.max(0, output[2 * outW * outH + i] * 255));
    outImage.data[i * 4 + 3] = 255;
  }
  return outImage;
}

/**
 * Restore a single image file
 */
export async function restoreImage(
  file: File,
  model: 'rgt' | 'atd' | 'bhi'
): Promise<Blob> {
  const session = await loadModel(model);
  const bitmap = await createImageBitmap(file);
  const canvas = document.createElement('canvas');
  canvas.width = bitmap.width;
  canvas.height = bitmap.height;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0);
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

  const { width, height } = imageData;
  const tensor = preprocessImage(imageData);
  
  const results = await session.run({ input: tensor });
  const output = results.output.data as Float32Array;

  const scale = 4; // Assuming 4x super-resolution
  const outW = width * scale;
  const outH = height * scale;
  
  const outCanvas = document.createElement('canvas');
  outCanvas.width = outW;
  outCanvas.height = outH;
  const outCtx = outCanvas.getContext('2d')!;
  
  const outImage = postprocessOutput(output, outW, outH, outCtx);
  outCtx.putImageData(outImage, 0, 0);

  return new Promise((resolve) =>
    outCanvas.toBlob((b) => resolve(b!), 'image/png')
  );
}

/**
 * Restore a video file frame-by-frame and return a WebM video Blob
 */
export async function restoreVideo(
  file: File,
  model: 'rgt' | 'atd' | 'bhi',
  fps = 24,
  onProgress?: (progress: number) => void
): Promise<Blob> {
  const session = await loadModel(model);
  const videoUrl = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.src = videoUrl;
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';

  await new Promise((resolve, reject) => {
    video.onloadedmetadata = () => resolve(true);
    video.onerror = reject;
  });

  const duration = video.duration;
  const width = video.videoWidth;
  const height = video.videoHeight;
  const scale = 4;
  const outW = width * scale;
  const outH = height * scale;

  const inputCanvas = document.createElement('canvas');
  inputCanvas.width = width;
  inputCanvas.height = height;
  const inputCtx = inputCanvas.getContext('2d')!;

  const outputCanvas = document.createElement('canvas');
  outputCanvas.width = outW;
  outputCanvas.height = outH;
  const outputCtx = outputCanvas.getContext('2d')!;

  // Stream output canvas to MediaRecorder
  const stream = outputCanvas.captureStream(fps);
  let mimeType = 'video/webm; codecs=vp9';
  if (!MediaRecorder.isTypeSupported(mimeType)) {
    mimeType = 'video/webm';
  }
  const mediaRecorder = new MediaRecorder(stream, { mimeType });
  const chunks: Blob[] = [];
  mediaRecorder.ondataavailable = (e) => chunks.push(e.data);

  const recordedBlob = new Promise<Blob>((resolve) => {
    mediaRecorder.onstop = () => {
      resolve(new Blob(chunks, { type: mimeType }));
    };
  });

  mediaRecorder.start();

  const totalFrames = Math.floor(duration * fps);
  let currentFrame = 0;

  try {
    while (currentFrame < totalFrames) {
      const time = currentFrame / fps;
      video.currentTime = Math.min(time, duration);

      await new Promise((resolve) => {
        const onSeeked = () => {
          video.removeEventListener('seeked', onSeeked);
          resolve(true);
        };
        video.addEventListener('seeked', onSeeked);
      });

      inputCtx.drawImage(video, 0, 0, width, height);
      const imageData = inputCtx.getImageData(0, 0, width, height);
      const tensor = preprocessImage(imageData);

      const results = await session.run({ input: tensor });
      const output = results.output.data as Float32Array;

      const outImage = postprocessOutput(output, outW, outH, outputCtx);
      outputCtx.putImageData(outImage, 0, 0);

      currentFrame++;
      if (onProgress) {
        onProgress(currentFrame / totalFrames);
      }
    }
  } finally {
    mediaRecorder.stop();
    video.remove();
    URL.revokeObjectURL(videoUrl);
  }

  return await recordedBlob;
}