import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import fs from 'fs';
import path from 'path';
import { ProcessingJob } from '../models/ProcessingJob';
import { compressionService } from '../services/compressionService';
import { restorationService } from '../services/restorationService';
import { routingService } from '../services/routingService';
import { r2Service } from '../services/r2Service';
import { savingsService } from '../services/savingsService';
import { qualityMetricsService } from '../services/qualityMetricsService';
import { COMPRESSION_ONLY, PARTIAL_BY_TIER } from '../config/constants';
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

async function runPartialRestore(opts: {
  compressedPath: string;
  model: string;
  partialOpts: { frameCount: number; maxWidth: number };
  expiryHours: number;
  temps: string[];
  originalSize: number;
}): Promise<{
  previewFrameUrls: string[];
  previewClipUrl: string | null;
  frameCount: number;
}> {
  const {
    compressedPath,
    model,
    partialOpts,
    expiryHours,
    temps,
    originalSize,
  } = opts;

  const previewFrameUrls: string[] = [];
  let previewClipUrl: string | null = null;

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
      const url = await r2Service.uploadWithExpiry(
        fp,
        Math.min(24, expiryHours || 24)
      );
      previewFrameUrls.push(url);
    } catch (upErr: any) {
      console.warn('[worker] frame upload', upErr?.message);
    }
    temps.push(fp);
  }

  try {
    const clipLocal = path.join(partial.workDir, `preview_${Date.now()}.webm`);
    await restorationService.framesToPreviewClip(
      partial.framePaths,
      clipLocal,
      2
    );
    temps.push(clipLocal);
    // Never let preview compete with storage win on the main deliverable;
    // still upload sample if small enough relative to original
    if (sizeOf(clipLocal) > 0 && sizeOf(clipLocal) <= originalSize) {
      previewClipUrl = await r2Service.uploadWithExpiry(
        clipLocal,
        Math.min(24, expiryHours || 24)
      );
    }
  } catch (clipErr: any) {
    console.warn('[worker] preview clip', clipErr?.message);
  }

  return {
    previewFrameUrls,
    previewClipUrl,
    frameCount: partial.frameCount,
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
    } = job.data;

    const tier = (tierRaw as UserTier) || 'demo';
    const offering = PROGRESSIVE_OFFERINGS[tier] || PROGRESSIVE_OFFERINGS.demo;
    const partialOpts = PARTIAL_BY_TIER[tier] || PARTIAL_BY_TIER.demo;

    const originalPath = filePath;
    let processedPath = '';
    let compressedPath = '';
    let didRestore = false;
    let restoreMode: 'none' | 'full' | 'partial-frames' = 'none';
    let codec = '';
    let previewFrameUrls: string[] = [];
    let previewClipUrl: string | null = null;
    const temps: string[] = [originalPath];

    try {
      let compressedSize = 0;

      // ── Compress (dev sweet spot via compressionService + constants) ─
      if (skipCompress) {
        await ProcessingJob.findByIdAndUpdate(jobId, {
          status: 'routing',
          progress: 35,
        });
        compressedPath = originalPath;
        processedPath = compressedPath;
        codec = clientCodec || 'libvpx-vp9';
        compressedSize = clientCompressedSize ?? sizeOf(compressedPath);
      } else {
        await ProcessingJob.findByIdAndUpdate(jobId, {
          status: 'compressing',
          progress: 15,
        });

        const compressedResult =
          await compressionService.compress(originalPath);
        compressedPath = compressedResult.outputPath;
        processedPath = compressedPath;
        codec = compressedResult.codec || '';
        compressedSize =
          compressedResult.compressedSize ?? sizeOf(compressedPath);
        temps.push(compressedPath);

        await ProcessingJob.findByIdAndUpdate(jobId, {
          status: 'routing',
          progress: 35,
        });
      }

      // ── Routing ──────────────────────────────────────────────────────
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

      let modelUsed: string = COMPRESSION_ONLY;
      let restoreSkippedReason: string | null = decision.reason || null;
      const model = decision.model;

      // ── Restore: dev-like — always try FULL first when model exists ──
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
            {
              maxWidth: tier === 'demo' ? 960 : 1280,
            }
          );
          temps.push(fullPath);
          const fullSize = sizeOf(fullPath);

          // Critical: never keep a restore larger than the original
          if (fullSize > 0 && fullSize <= originalSize) {
            processedPath = fullPath;
            modelUsed = model;
            didRestore = true;
            restoreMode = 'full';
            restoreSkippedReason = null;
            fullAccepted = true;
          } else {
            restoreSkippedReason = `Full restore ${fullSize}B > original ${originalSize}B — partial samples`;
            safeUnlink(fullPath);
          }
        } catch (e: any) {
          restoreSkippedReason =
            e?.message || 'Full restore failed — partial samples';
          console.warn('[worker]', restoreSkippedReason);
        }

        if (!fullAccepted) {
          try {
            const partial = await runPartialRestore({
              compressedPath,
              model,
              partialOpts,
              expiryHours: decision.expiryHours || 24,
              temps,
              originalSize,
            });
            previewFrameUrls = partial.previewFrameUrls;
            previewClipUrl = partial.previewClipUrl;
            processedPath = compressedPath; // main file stays compressed (size win)
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

      // ── Final size gate ──────────────────────────────────────────────
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

      const finalUrl = await r2Service.uploadWithExpiry(
        processedPath,
        decision.expiryHours
      );

      const savingsPercent = savingsService.calculate
        ? savingsService.calculate(originalSize, finalSize)
        : originalSize > 0
          ? Math.max(
              0,
              Math.round((1 - finalSize / originalSize) * 1000) / 10
            )
          : 0;

      let vmafScore: number | null = null;
      if (
        offering.canUseVMAF &&
        (tier === 'premium' || tier === 'desktop') &&
        !skipCompress
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

      await ProcessingJob.findByIdAndUpdate(jobId, {
        compressedSize: finalSize,
        finalUrl,
        modelUsed,
        route: decision.route,
        savingsPercent,
        vmafScore,
        status: 'completed',
        progress: 100,
        completedAt: new Date(),
        restored: didRestore,
        restoreMode,
        codec,
        previewFrameUrls,
        previewClipUrl,
      });

      for (const t of temps) safeUnlink(t);

      if (r2Key) {
        try {
          await r2Service.deleteObject?.(r2Key);
        } catch (e: any) {
          console.warn('[worker] r2 delete', e?.message);
        }
      }
    } catch (error: any) {
      console.error('[worker]', error);
      await ProcessingJob.findByIdAndUpdate(jobId, {
        status: 'failed',
        error: error?.message || 'Processing failed',
      });
      for (const t of temps) safeUnlink(t);
      if (r2Key) {
        try {
          await r2Service.deleteObject?.(r2Key);
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