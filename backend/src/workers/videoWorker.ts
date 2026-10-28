import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import fs from 'fs';
import path from 'path';
import { ProcessingJob } from '../models/ProcessingJob';
import { compressionService } from '../services/compressionService';
import { restorationService } from '../services/restorationService';
import { routingService } from '../services/routingService';
import { r2Service, SHORT_LIVED_HOURS } from '../services/r2Service';
import { savingsService } from '../services/savingsService';
import { qualityMetricsService } from '../services/qualityMetricsService';
import {
  COMPRESSION_ONLY,
  PARTIAL_BY_TIER,
  UPLOAD_TEMP_DIR,
} from '../config/constants';
import { PROGRESSIVE_OFFERINGS, type UserTier } from '../config/tiers';
import type { VideoJobData } from '../queue/videoQueue';

const connection = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: null,
});

function sizeOf(p: string): number {
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
  if (h === 0) return 0; // desktop: no auto-expire
  if (typeof h === 'number' && h > 0) return h;
  return 24;
}

/** 2 frames only — no quality sample clip */
async function runPartialRestore(opts: {
  compressedPath: string;
  model: string;
  partialOpts: { frameCount: number; maxWidth: number };
  temps: string[];
  originalSize: number;
}): Promise<{
  previewFrameUrls: string[];
  previewClipUrl: string | null;
  frameCount: number;
  sampleKeys: string[];
}> {
  const { compressedPath, model, partialOpts, temps } = opts;

  const previewFrameUrls: string[] = [];
  const sampleKeys: string[] = [];

  const partial = await restorationService.restorePartialFrames(
    compressedPath,
    model,
    {
      frameCount: partialOpts.frameCount,
      maxWidth: partialOpts.maxWidth,
    }
  );

  for (const fp of partial.framePaths) {
    try {
      const { url, key } = await r2Service.uploadSample(fp);
      previewFrameUrls.push(url);
      sampleKeys.push(key);
    } catch (upErr: any) {
      console.warn('[worker] frame upload', upErr?.message);
    }
    temps.push(fp);
  }

  return {
    previewFrameUrls,
    previewClipUrl: null,
    frameCount: partial.frameCount,
    sampleKeys,
  };
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
      skipCompress,
      compressedSize: clientCompressedSize,
      codec: clientCodec,
      r2Key,
      resumeFrom,
      compressedKey: dataCompressedKey,
    } = job.data;

    const existing = await ProcessingJob.findById(jobId).lean();
    if (!existing || existing.status === 'cancelled') {
      console.log('[worker] skip cancelled job', jobId);
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
    const offering = PROGRESSIVE_OFFERINGS[tier] || PROGRESSIVE_OFFERINGS.demo;
    const tierExpiryHours = expiryHoursForTier(tier);
    const partialOpts = PARTIAL_BY_TIER[tier] || {
      frameCount: 2,
      maxWidth: 960,
    };

    let originalPath = filePath || '';
    let processedPath = '';
    let compressedPath = '';
    let didRestore = false;
    let restoreMode: 'none' | 'full' | 'partial-frames' = 'none';
    let codec = '';
    let previewFrameUrls: string[] = [];
    let previewClipUrl: string | null = null;
    const temps: string[] = [];
    if (originalPath) temps.push(originalPath);

    const r2KeysOnFail: string[] = [];
    if (r2Key) r2KeysOnFail.push(r2Key);

    let sampleKeys: string[] = [];
    let finalKey: string | null = null;
    let persistedCompressedKey: string | null =
      dataCompressedKey || (existing as any).compressedKey || null;

    try {
      let compressedSize = 0;

      const canResumeRestore =
        (resumeFrom === 'restore' || skipCompress) &&
        Boolean(persistedCompressedKey);

      if (canResumeRestore && persistedCompressedKey) {
        console.log(
          '[worker] resume from restore',
          jobId,
          persistedCompressedKey
        );
        await ProcessingJob.findByIdAndUpdate(jobId, {
          status: 'restoring',
          progress: 40,
          error: null,
        });

        fs.mkdirSync(UPLOAD_TEMP_DIR, { recursive: true });
        compressedPath = path.join(
          UPLOAD_TEMP_DIR,
          `${jobId}_resume_compressed${path.extname(persistedCompressedKey) || '.mp4'}`
        );
        await r2Service.downloadToLocal(persistedCompressedKey, compressedPath);
        temps.push(compressedPath);
        processedPath = compressedPath;
        codec = clientCodec || existing.codec || 'libsvtav1';
        compressedSize =
          clientCompressedSize ||
          existing.compressedSize ||
          sizeOf(compressedPath);
      } else if (skipCompress && filePath) {
        await ProcessingJob.findByIdAndUpdate(jobId, {
          status: 'routing',
          progress: 35,
        });
        compressedPath = filePath;
        processedPath = compressedPath;
        codec = clientCodec || 'libvpx-vp9';
        compressedSize = clientCompressedSize ?? sizeOf(compressedPath);
      } else {
        if (!filePath || !fs.existsSync(filePath)) {
          throw new Error('Missing input file for compress');
        }

        await ProcessingJob.findByIdAndUpdate(jobId, {
          status: 'compressing',
          progress: 15,
        });

        const compressedResult = await compressionService.compress(filePath);
        compressedPath = compressedResult.outputPath;
        processedPath = compressedPath;
        codec = compressedResult.codec || '';
        compressedSize =
          compressedResult.compressedSize ?? sizeOf(compressedPath);
        temps.push(compressedPath);

        try {
          // Checkpoint for retry — 9h retention
          const up = await r2Service.uploadWithKey(compressedPath, {
            prefix: 'compressed/',
            expiryHours: SHORT_LIVED_HOURS,
          });
          persistedCompressedKey = up.key;
          await ProcessingJob.findByIdAndUpdate(jobId, {
            status: 'compressed',
            progress: 35,
            compressedSize,
            codec,
            compressedKey: up.key,
          });
        } catch (e: any) {
          console.warn('[worker] compressed checkpoint upload', e?.message);
          await ProcessingJob.findByIdAndUpdate(jobId, {
            status: 'routing',
            progress: 35,
            compressedSize,
            codec,
          });
        }
      }

      const mid = await ProcessingJob.findById(jobId).lean();
      if (mid?.status === 'cancelled') {
        console.log('[worker] cancelled after compress', jobId);
        for (const t of temps) safeUnlink(t);
        await r2Service.deleteMany(r2KeysOnFail);
        return;
      }

      const user = userId
        ? { id: userId, tier, preferredModel }
        : preferredModel
          ? { preferredModel }
          : null;

      const decision = await routingService.decide(
        { originalSize, size: compressedSize },
        deviceProfile,
        user
      );

      // Prefer tier table; routing may still suggest a value
      const finalExpiryHours =
        tierExpiryHours > 0
          ? tierExpiryHours
          : decision.expiryHours > 0
            ? decision.expiryHours
            : 24;

      let modelUsed: string = COMPRESSION_ONLY;
      let restoreSkippedReason: string | null = decision.reason || null;
      const model = decision.model;

      if (model) {
        await ProcessingJob.findByIdAndUpdate(jobId, {
          status: 'restoring',
          progress: 55,
        });

        let fullAccepted = false;
        try {
          const fullPath = await restorationService.restore(
            compressedPath,
            model,
            { maxWidth: tier === 'demo' ? 960 : 1920 }
          );
          temps.push(fullPath);
          const fullSize = sizeOf(fullPath);

          if (fullSize > 0 && fullSize <= originalSize) {
            processedPath = fullPath;
            modelUsed = model;
            didRestore = true;
            restoreMode = 'full';
            restoreSkippedReason = null;
            fullAccepted = true;
          } else {
            restoreSkippedReason = `Full restore ${fullSize}B > original ${originalSize}B — partial`;
            safeUnlink(fullPath);
          }
        } catch (e: any) {
          restoreSkippedReason =
            e?.message || 'Full restore time budget — partial';
          console.warn('[worker] full → partial:', restoreSkippedReason);
        }

        if (!fullAccepted) {
          try {
            const partial = await runPartialRestore({
              compressedPath,
              model,
              partialOpts,
              temps,
              originalSize,
            });
            previewFrameUrls = partial.previewFrameUrls;
            previewClipUrl = null;
            sampleKeys = partial.sampleKeys;
            r2KeysOnFail.push(...sampleKeys);
            processedPath = compressedPath;
            modelUsed = `${model}-partial`;
            didRestore = true;
            restoreMode = 'partial-frames';
            restoreSkippedReason =
              (restoreSkippedReason ? restoreSkippedReason + ' | ' : '') +
              `Partial OK (${partial.frameCount})`;
          } catch (pfErr: any) {
            processedPath = compressedPath;
            modelUsed = COMPRESSION_ONLY;
            didRestore = false;
            restoreMode = 'none';
            restoreSkippedReason =
              (restoreSkippedReason ? restoreSkippedReason + ' | ' : '') +
              (pfErr?.message || 'Partial failed');
          }
        }
      }

      let finalSize = sizeOf(processedPath);
      if (finalSize > originalSize) {
        processedPath = compressedPath;
        finalSize = sizeOf(compressedPath);
        modelUsed = COMPRESSION_ONLY;
        didRestore = false;
        restoreMode = 'none';
        restoreSkippedReason =
          (restoreSkippedReason || '') + ' | forced compressed (size gate)';
      }

      await ProcessingJob.findByIdAndUpdate(jobId, {
        status: 'uploading',
        progress: 80,
      });

      const uploaded = await r2Service.uploadWithKey(processedPath, {
        prefix: 'processed/',
        expiryHours: finalExpiryHours > 0 ? finalExpiryHours : 168,
      });
      const finalUrl = uploaded.url;
      finalKey = uploaded.key;
      r2KeysOnFail.push(finalKey);

      const savingsPercent = savingsService.calculate
        ? savingsService.calculate(originalSize, finalSize)
        : originalSize > 0
          ? Math.max(
              0,
              Math.round((1 - finalSize / originalSize) * 1000) / 10
            )
          : 0;

      console.log(
        `[worker] done job=${jobId} tier=${tier} expiryH=${finalExpiryHours} in=${(originalSize / 1024 / 1024).toFixed(1)}MB out=${(finalSize / 1024 / 1024).toFixed(1)}MB saved=${savingsPercent}% mode=${restoreMode}`
      );

      let vmafScore: number | null = null;
      if (
        offering.canUseVMAF &&
        (tier === 'premium' || tier === 'desktop') &&
        !skipCompress &&
        originalPath &&
        fs.existsSync(originalPath)
      ) {
        try {
          const metrics = await qualityMetricsService.runVMAF(
            originalPath,
            processedPath
          );
          vmafScore =
            typeof metrics?.vmafScore === 'number' && metrics.vmafScore > 0
              ? metrics.vmafScore
              : null;
        } catch (e: any) {
          console.warn('[worker] VMAF', e?.message);
        }
      }

      const latest = await ProcessingJob.findById(jobId).lean();
      if (latest?.status === 'cancelled') {
        for (const t of temps) safeUnlink(t);
        await r2Service.deleteMany(r2KeysOnFail);
        return;
      }

      // Tier-aligned object lifetime (desktop: null = keep until manual/90d row cleanup)
      const expiresAt =
        finalExpiryHours > 0
          ? new Date(Date.now() + finalExpiryHours * 60 * 60 * 1000)
          : null;

      await ProcessingJob.findByIdAndUpdate(jobId, {
        compressedSize: finalSize,
        compressedKey: persistedCompressedKey,
        finalUrl,
        modelUsed,
        route: decision.route,
        savingsPercent,
        vmafScore,
        status: 'completed',
        progress: 100,
        completedAt: new Date(),
        expiresAt,
        restored: didRestore,
        restoreMode,
        codec,
        previewFrameUrls,
        previewClipUrl: null,
        error: null,
      });

      for (const t of temps) safeUnlink(t);

      if (r2Key) {
        try {
          await r2Service.deleteObject(r2Key);
        } catch (e: any) {
          console.warn('[worker] r2 delete source', e?.message);
        }
      }
    } catch (error: any) {
      console.error('[worker]', error);
      const latest = await ProcessingJob.findById(jobId).lean();
      if (latest?.status !== 'cancelled') {
        await ProcessingJob.findByIdAndUpdate(jobId, {
          status: 'failed',
          error: error?.message || 'Processing failed',
          ...(persistedCompressedKey
            ? { compressedKey: persistedCompressedKey }
            : {}),
        });
      }
      for (const t of temps) safeUnlink(t);

      try {
        const keys = r2KeysOnFail.filter(
          (k) => k && k !== persistedCompressedKey
        );
        await r2Service.deleteMany(keys);
      } catch (e: any) {
        console.warn('[worker] r2 cleanup on fail', e?.message);
      }

      throw error;
    }
  },
  { connection, concurrency: 1 }
);

videoWorker.on('failed', (job, err) => {
  console.error(`[worker] job ${job?.id} failed:`, err.message);
});