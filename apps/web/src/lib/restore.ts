// src/lib/restore.ts

'use client';
import * as ort from 'onnxruntime-web';

const R2 =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_R2_PUBLIC_URL) ||
  'https://pub-3e1cccdd28344fe2bf9883405d1f1e4f.r2.dev';

const MODEL_URLS = {
  rgt: 'https://pub-3e1cccdd28344fe2bf9883405d1f1e4f.r2.dev/models/4xRealWebPhoto_v2_rtg_s.onnx',
  atd: 'https://your-r2-public-or-signed.r2.dev/models/atd.onnx',
  bhi: 'https://pub-3e1cccdd28344fe2bf9883405d1f1e4f.r2.dev/models/4xBHI_realplksr_dysample_real.onnx',
} as const;


export type ModelName = keyof typeof MODEL_URLS;

const ORT_WASM_BASE =
  (typeof process !== 'undefined' && process.env.NEXT_PUBLIC_ORT_WASM_BASE) ||
  'https://cdn.jsdelivr.net/npm/onnxruntime-web@1.31.1/dist/';

let ortReady: Promise<void> | null = null;
const sessions: Partial<Record<ModelName, ort.InferenceSession>> = {};

async function ensureOrt() {
  if (!ortReady) {
    ortReady = (async () => {
      // Critical for Cloudflare Pages: WASM is NOT in your deploy
      ort.env.wasm.wasmPaths = ORT_WASM_BASE.endsWith('/')
        ? ORT_WASM_BASE
        : `${ORT_WASM_BASE}/`;
      // Safer default for mobile / low RAM
      ort.env.wasm.numThreads = 1;
    })();
  }
  await ortReady;
}

export async function loadModel(name: ModelName) {
  await ensureOrt();
  if (sessions[name]) return sessions[name]!;

  const url = MODEL_URLS[name];
  if (!url || url.includes('your-r2')) {
    throw new Error(`Model URL not configured for "${name}"`);
  }

  sessions[name] = await ort.InferenceSession.create(url, {
    executionProviders: ['wasm'], // add 'webgpu' later when stable for you
  });
  return sessions[name]!;
}

function preprocessImage(imageData: ImageData): ort.Tensor {
  const { data, width, height } = imageData;
  const plane = width * height;
  const input = new Float32Array(3 * plane);
  for (let i = 0; i < plane; i++) {
    input[i] = data[i * 4] / 255;
    input[plane + i] = data[i * 4 + 1] / 255;
    input[2 * plane + i] = data[i * 4 + 2] / 255;
  }
  return new ort.Tensor('float32', input, [1, 3, height, width]);
}

function postprocessOutput(
  output: Float32Array,
  outW: number,
  outH: number,
  ctx: CanvasRenderingContext2D
): ImageData {
  const plane = outW * outH;
  const outImage = ctx.createImageData(outW, outH);
  for (let i = 0; i < plane; i++) {
    outImage.data[i * 4] = Math.min(255, Math.max(0, output[i] * 255));
    outImage.data[i * 4 + 1] = Math.min(
      255,
      Math.max(0, output[plane + i] * 255)
    );
    outImage.data[i * 4 + 2] = Math.min(
      255,
      Math.max(0, output[2 * plane + i] * 255)
    );
    outImage.data[i * 4 + 3] = 255;
  }
  return outImage;
}

/** Cap input side so browser VRAM/RAM survives 4× models */
function maxSide(w: number, h: number, max = 512): { w: number; h: number } {
  const m = Math.max(w, h);
  if (m <= max) return { w, h };
  const s = max / m;
  return { w: Math.max(1, Math.round(w * s)), h: Math.max(1, Math.round(h * s)) };
}

export async function restoreImage(
  file: File,
  model: ModelName
): Promise<Blob> {
  const session = await loadModel(model);
  const bitmap = await createImageBitmap(file);
  const { w, h } = maxSide(bitmap.width, bitmap.height, 512);

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  const imageData = ctx.getImageData(0, 0, w, h);

  const feeds: Record<string, ort.Tensor> = {
    input: preprocessImage(imageData),
  };
  // If your ONNX input name differs, change "input"
  const results = await session.run(feeds);
  const outName = session.outputNames[0];
  const output = results[outName].data as Float32Array;

  const scale = 4;
  const outW = w * scale;
  const outH = h * scale;

  const outCanvas = document.createElement('canvas');
  outCanvas.width = outW;
  outCanvas.height = outH;
  const outCtx = outCanvas.getContext('2d')!;
  outCtx.putImageData(postprocessOutput(output, outW, outH, outCtx), 0, 0);

  return new Promise((resolve, reject) =>
    outCanvas.toBlob(
      (b) => (b ? resolve(b) : reject(new Error('toBlob failed'))),
      'image/png'
    )
  );
}

/**
 * Full-timeline 4× in-browser is extremely heavy.
 * Prefer: short clips, low fps, or Tauri/server for long video.
 */
export async function restoreVideo(
  file: File,
  model: ModelName,
  fps = 8,
  onProgress?: (progress: number) => void,
  maxSeconds = 15
): Promise<Blob> {
  const session = await loadModel(model);
  const videoUrl = URL.createObjectURL(file);
  const video = document.createElement('video');
  video.src = videoUrl;
  video.muted = true;
  video.playsInline = true;
  video.preload = 'auto';

  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error('Video load failed'));
  });

  const duration = Math.min(video.duration || 0, maxSeconds);
  const { w: width, h: height } = maxSide(
    video.videoWidth,
    video.videoHeight,
    320
  );
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

  const stream = outputCanvas.captureStream(fps);
  let mimeType = 'video/webm;codecs=vp9';
  if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'video/webm';

  const mediaRecorder = new MediaRecorder(stream, { mimeType });
  const chunks: Blob[] = [];
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };

  const recordedBlob = new Promise<Blob>((resolve, reject) => {
    mediaRecorder.onstop = () =>
      resolve(new Blob(chunks, { type: mimeType }));
    mediaRecorder.onerror = () => reject(new Error('MediaRecorder error'));
  });

  mediaRecorder.start();
  const totalFrames = Math.max(1, Math.floor(duration * fps));

  try {
    for (let currentFrame = 0; currentFrame < totalFrames; currentFrame++) {
      const time = currentFrame / fps;
      video.currentTime = Math.min(time, duration);
      await new Promise<void>((resolve) => {
        const onSeeked = () => {
          video.removeEventListener('seeked', onSeeked);
          resolve();
        };
        video.addEventListener('seeked', onSeeked);
      });

      inputCtx.drawImage(video, 0, 0, width, height);
      const imageData = inputCtx.getImageData(0, 0, width, height);
      const results = await session.run({
        input: preprocessImage(imageData),
      });
      const outName = session.outputNames[0];
      const output = results[outName].data as Float32Array;
      outputCtx.putImageData(
        postprocessOutput(output, outW, outH, outputCtx),
        0,
        0
      );
      onProgress?.(currentFrame / totalFrames);
    }
  } finally {
    mediaRecorder.stop();
    video.remove();
    URL.revokeObjectURL(videoUrl);
  }

  return recordedBlob;
}