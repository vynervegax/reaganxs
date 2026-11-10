import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import fs from 'fs';
import path from 'path';
import { ProcessingJob } from '../models/ProcessingJob';
import { compressionService } from '../services/compressionService';
import { restorationService } from '../services/restorationService';
import { imageCompressionService } from '../services/imageCompressionService';
import { imageRestorationService } from '../services/imageRestorationService';
import { routingService } from '../services/routingService';
import { r2Service, SHORT_LIVED_HOURS } from '../services/r2Service';
import { savingsService } from '../services/savingsService';
import {
  COMPRESSION_ONLY,
  PARTIAL_BY_TIER,
  UPLOAD_TEMP_DIR,
} from '../config/constants';
import { MEDIA_KINDS } from '../config/mediaKinds';
import { PROGRESSIVE_OFFERINGS, type UserTier } from '../config/tiers';
import type { VideoJobData } from '../queue/videoQueue';

const connection = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: null,
});

function sizeOf(p: string) {
  try {
    return fs.statSync(p).size;
  } catch {
    return 0;
  }
}

function safeUnlink(p?: string) {
  try {
    if (p && fs.existsSync(p)) fs.unlinkSync(p);
  } catch {
    /* ignore */
  }
}

function expiryHoursForTier(tier: UserTier): number {
  const h = PROGRESSIVE_OFFERINGS[tier]?.expiryHours;
  if (h === 0) return 0;
  if (typeof h === 'number' && h > 0) return h;
  return 24;
}

async function ensureLocalInput(
  jobId: string,
  filePath: string | undefined,
  r2Key: string | undefined,
  temps: string[]
): Promise<string> {
  if (filePath && fs.existsSync(filePath)) return filePath;
  if (!r2Key) throw new Error('Missing input file');
  fs.mkdirSync(UPLOAD_TEMP_DIR, { recursive: true });
  const dest = path.join(
    UPLOAD_TEMP_DIR,
    `${jobId}_src${path.extname(r2Key) || '.bin'}`
  );
  await r2Service.downloadToLocal(r2Key, dest);
  temps.push(dest);
  return dest;
}

async function finishJob(opts: {
  jobId: string;
  tier: UserTier;
  originalSize: number;
  processedPath: string;
  codec: string;
  modelUsed: string;
  didRestore: boolean;
  restoreMode: string;
  temps: string[];
  r2Key?: string;
  mediaKind: string;
  route?: string;
  previewFrameUrls?: string[];
}) {
  const {
    jobId,
    tier,
    originalSize,
    processedPath,
    codec,
    modelUsed,
    didRestore,
    restoreMode,
    temps,
    r2Key,
    mediaKind,
    route,
    previewFrameUrls = [],
  } = opts;

  await ProcessingJob.findByIdAndUpdate(jobId, {
    status: 'uploading',
    progress: 80,
  });

  const finalExpiry = expiryHoursForTier(tier);
  const uploaded = await r2Service.uploadWithKey(processedPath, {
    prefix: 'processed/',
    expiryHours: finalExpiry > 0 ? finalExpiry : 168,
  });

  const finalSize = sizeOf(processedPath);
  const savingsPercent = savingsService.calculate
    ? savingsService.calculate(originalSize, finalSize)
    : originalSize > 0
      ? Math.max(0, Math.round((1 - finalSize / originalSize) * 1000) / 10)
      : 0;

  const expiresAt =
    finalExpiry > 0
      ? new Date(Date.now() + finalExpiry * 60 * 60 * 1000)
      : null;

  await ProcessingJob.findByIdAndUpdate(jobId, {
    mediaKind,
    compressedSize: finalSize,
    finalSize,
    finalUrl: uploaded.url,
    modelUsed,
    codec,
    route: route || mediaKind,
    savingsPercent,
    status: 'completed',
    progress: 100,
    completedAt: new Date(),
    expiresAt,
    restored: didRestore,
    restoreMode,
    previewFrameUrls,
    previewClipUrl: null,
    error: null,
  });

  for (const t of temps) safeUnlink(t);
  if (r2Key) {
    try {
      await r2Service.deleteObject(r2Key);
    } catch {
      /* ignore */
    }
  }
}

/** Image path — uses image* services */
async function processImage(ctx: {
  jobId: string;
  inputPath: string;
  originalSize: number;
  tier: UserTier;
  user: any;
  deviceProfile: any;
  temps: string[];
  r2Key?: string;
}) {
  const { jobId, inputPath, originalSize, tier, user, deviceProfile, temps, r2Key } =
    ctx;

  await ProcessingJob.findByIdAndUpdate(jobId, {
    status: 'compressing',
    progress: 15,
  });

  const compressed = await imageCompressionService.compress(inputPath, {
    maxWidth: tier === 'demo' ? 1600 : 2560,
  });
  temps.push(compressed.outputPath);

  let processedPath = compressed.outputPath;
  let modelUsed = COMPRESSION_ONLY;
  let didRestore = false;
  let restoreMode = 'none';

  const decision = await routingService.decide(
    { originalSize, size: compressed.compressedSize },
    deviceProfile,
    user
  );

  if (decision.model && compressed.compressedSize < originalSize * 0.98) {
    try {
      await ProcessingJob.findByIdAndUpdate(jobId, {
        status: 'restoring',
        progress: 55,
      });
      const enhanced = await imageRestorationService.enhance(
        compressed.outputPath,
        decision.model,
        { maxWidth: tier === 'demo' ? 1280 : 2048 }
      );
      temps.push(enhanced);
      const again = await imageCompressionService.compress(enhanced, {
        maxWidth: tier === 'demo' ? 1600 : 2560,
      });
      temps.push(again.outputPath);
      if (again.compressedSize > 0 && again.compressedSize <= originalSize) {
        processedPath = again.outputPath;
        modelUsed = decision.model;
        didRestore = true;
        restoreMode = 'full';
      }
    } catch (e: any) {
      console.warn('[worker:image] enhance skipped', e?.message);
    }
  }

  // Single-frame preview = final (optional)
  let previewFrameUrls: string[] = [];
  try {
    const { url } = await r2Service.uploadSample(processedPath);
    previewFrameUrls = [url];
  } catch {
    /* ignore */
  }

  await finishJob({
    jobId,
    tier,
    originalSize,
    processedPath,
    codec: compressed.codec,
    modelUsed,
    didRestore,
    restoreMode,
    temps,
    r2Key,
    mediaKind: 'image',
    route: decision.route,
    previewFrameUrls,
  });
}

/** Existing video path kept compact — call your current compress/restore logic */
async function processVideo(ctx: {
  jobId: string;
  inputPath: string;
  originalSize: number;
  tier: UserTier;
  user: any;
  deviceProfile: any;
  temps: string[];
  r2Key?: string;
  skipCompress?: boolean;
  resumeFrom?: string;
  compressedKey?: string;
  clientCodec?: string;
  clientCompressedSize?: number;
}) {
  // --- Prefer your full production videoWorker body here ---
  // This skeletal version: compress → optional partial restore → upload

  const {
    jobId,
    inputPath,
    originalSize,
    tier,
    user,
    deviceProfile,
    temps,
    r2Key,
  } = ctx;

  await ProcessingJob.findByIdAndUpdate(jobId, {
    status: 'compressing',
    progress: 15,
  });

  const compressedResult = await compressionService.compress(inputPath);
  temps.push(compressedResult.outputPath);
  let processedPath = compressedResult.outputPath;
  let codec = compressedResult.codec || '';
  const compressedSize =
    compressedResult.compressedSize ?? sizeOf(processedPath);

  try {
    const up = await r2Service.uploadWithKey(processedPath, {
      prefix: 'compressed/',
      expiryHours: SHORT_LIVED_HOURS,
    });
    await ProcessingJob.findByIdAndUpdate(jobId, {
      status: 'compressed',
      progress: 35,
      compressedSize,
      codec,
      compressedKey: up.key,
    });
  } catch {
    await ProcessingJob.findByIdAndUpdate(jobId, {
      status: 'routing',
      progress: 35,
      compressedSize,
      codec,
    });
  }

  const decision = await routingService.decide(
    { originalSize, size: compressedSize },
    deviceProfile,
    user
  );

  let modelUsed = COMPRESSION_ONLY;
  let didRestore = false;
  let restoreMode: 'none' | 'full' | 'partial-frames' = 'none';
  let previewFrameUrls: string[] = [];
  const partialOpts = PARTIAL_BY_TIER[tier] || { frameCount: 2, maxWidth: 960 };

  if (decision.model) {
    await ProcessingJob.findByIdAndUpdate(jobId, {
      status: 'restoring',
      progress: 55,
    });
    try {
      const partial = await restorationService.restorePartialFrames(
        processedPath,
        decision.model,
        partialOpts
      );
      for (const fp of partial.framePaths) {
        try {
          const { url } = await r2Service.uploadSample(fp);
          previewFrameUrls.push(url);
        } catch {
          /* ignore */
        }
        temps.push(fp);
      }
      modelUsed = `${decision.model}-partial`;
      didRestore = true;
      restoreMode = 'partial-frames';
    } catch (e: any) {
      console.warn('[worker:video] partial failed', e?.message);
    }
  }

  await finishJob({
    jobId,
    tier,
    originalSize,
    processedPath,
    codec,
    modelUsed,
    didRestore,
    restoreMode,
    temps,
    r2Key,
    mediaKind: 'video',
    route: decision.route,
    previewFrameUrls,
  });
}

export const videoWorker = new Worker<VideoJobData>(
  'video-process',
  async (job) => {
    const {
      jobId,
      filePath,
      originalSize,
      userId,
      tier: tierRaw,
      preferredModel,
      deviceProfile,
      r2Key,
      mediaKind: dataKind,
      skipCompress,
      resumeFrom,
      compressedKey,
      codec: clientCodec,
      compressedSize: clientCompressedSize,
    } = job.data;

    const existing = await ProcessingJob.findById(jobId).lean() as any;
if (!existing || existing.status === 'cancelled') {
      if (r2Key) {
        try {
          await r2Service.deleteObject(r2Key);
        } catch {
          /* ignore */
        }
      }
      return;
    }

    const tier = (tierRaw as UserTier) || 'demo';
    const mediaKind =
      dataKind ||
      (existing as any).mediaKind ||
      'video';

    const kindCfg = MEDIA_KINDS[mediaKind as keyof typeof MEDIA_KINDS];
    if (kindCfg && !kindCfg.enabled) {
      throw new Error(`Media kind "${mediaKind}" is not enabled`);
    }

    const temps: string[] = [];
    const user = userId
      ? { id: userId, tier, preferredModel }
      : preferredModel
        ? { preferredModel }
        : null;

    try {
      const inputPath = await ensureLocalInput(jobId, filePath, r2Key, temps);

      const processor = kindCfg?.processor || 'video';

      if (processor === 'image') {
        await processImage({
          jobId,
          inputPath,
          originalSize,
          tier,
          user,
          deviceProfile,
          temps,
          r2Key,
        });
        return;
      }

      if (processor === 'audio' || processor === 'text') {
        // Skeletal: mark failed with clear message until pipelines ship
        throw new Error(
          `Processor "${processor}" is skeletal — enable when pipeline is ready`
        );
      }

      // video (default) + custom passthrough later
      await processVideo({
        jobId,
        inputPath,
        originalSize,
        tier,
        user,
        deviceProfile,
        temps,
        r2Key,
        skipCompress,
        resumeFrom,
        compressedKey,
        clientCodec,
        clientCompressedSize,
      });
    } catch (error: any) {
      console.error('[worker]', error);
      const latest = await ProcessingJob.findById(jobId).lean() as any;
if (latest?.status !== 'cancelled') {
        await ProcessingJob.findByIdAndUpdate(jobId, {
          status: 'failed',
          error: error?.message || 'Processing failed',
        });
      }
      for (const t of temps) safeUnlink(t);
      if (r2Key) {
        try {
          await r2Service.deleteObject(r2Key);
        } catch {
          /* ignore */
        }
      }
      throw error;
    }
  },
  { connection, concurrency: 1 }
);

videoWorker.on('failed', (job, err) => {
  console.error(`[worker] job ${job?.id} failed:`, err.message);
});