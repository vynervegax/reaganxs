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
import { r2Service } from '../services/r2Service';
import { savingsService } from '../services/savingsService';
import { qualityMetricsService } from '../services/qualityMetricsService';
import { COMPRESSION_ONLY, UPLOAD_TEMP_DIR } from '../config/constants';
import { MEDIA_KINDS } from '../config/mediaKinds';
import {
  PROGRESSIVE_OFFERINGS,
  modelAllowed,
  type UserTier,
} from '../config/tiers';
import type { VideoJobData } from '../queue/videoQueue';

const connection = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: null,
});

/** Intermediate stages (upload, compressed, samples) — 9 hours. */
const STAGE_EXPIRY_HOURS = 9;

function sizeOf(p: string): number {
  try { return fs.statSync(p).size; } catch { return 0; }
}

function safeUnlink(p?: string) {
  try { if (p && fs.existsSync(p)) fs.unlinkSync(p); } catch { /* ignore */ }
}

/** Completed result + savings card: demo 24, free 72, premium 168, desktop 0 (keep). */
function expiryHoursForTier(tier: UserTier): number {
  const h = PROGRESSIVE_OFFERINGS[tier]?.expiryHours;
  if (h === 0) return 0;
  if (typeof h === 'number' && h > 0) return h;
  return 24;
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
      mediaKind: dataMediaKind,
      forceVp9,
    } = job.data as any;

    const existing = await ProcessingJob.findById(jobId).lean();
    if (!existing || existing.status === 'cancelled') {
      console.log('[worker] skip cancelled job', jobId);
      if (r2Key) { try { await r2Service.deleteObject(r2Key); } catch {} }
      return;
    }

    const tier = (tierRaw as UserTier) || 'demo';
    const offering = PROGRESSIVE_OFFERINGS[tier] || PROGRESSIVE_OFFERINGS.demo;
    const tierExpiryHours = expiryHoursForTier(tier);

    const mediaKind = dataMediaKind || (existing as any).mediaKind || 'video';
    const kindCfg = MEDIA_KINDS[mediaKind as keyof typeof MEDIA_KINDS];
    if (kindCfg && !kindCfg.enabled) throw new Error(`Media kind "${mediaKind}" is not enabled`);

    let originalPath = filePath || '';
    let processedPath = '';
    let compressedPath = '';
    let didRestore = false;
    let restoreMode: 'none' | 'full' = 'none';
    let codec = '';
    const temps: string[] = [];
    if (originalPath) temps.push(originalPath);

    const r2KeysOnFail: string[] = [];
    if (r2Key) r2KeysOnFail.push(r2Key);

    let finalKey: string | null = null;
    let persistedCompressedKey: string | null =
      dataCompressedKey || (existing as any).compressedKey || null;

    try {
      // ========== IMAGE PATH ==========
      if (kindCfg?.processor === 'image') {
        if (!filePath || !fs.existsSync(filePath)) throw new Error('Missing input file for image compress');

        await ProcessingJob.findByIdAndUpdate(jobId, { status: 'compressing', progress: 15 });

        const compressed = await imageCompressionService.compress(filePath, {
          maxWidth: tier === 'demo' ? 1600 : 2560,
        });
        temps.push(compressed.outputPath);
        processedPath = compressed.outputPath;
        codec = compressed.codec || 'avif';

        const user = userId ? { id: userId, tier, preferredModel } : preferredModel ? { preferredModel } : null;
        const decision = await routingService.decide(
          { originalSize, size: compressed.compressedSize },
          deviceProfile,
          user
        );

        let modelUsed: string = COMPRESSION_ONLY;

        if (
          decision.model &&
          modelAllowed(tier, decision.model) &&
          compressed.compressedSize < originalSize * 0.98
        ) {
          try {
            await ProcessingJob.findByIdAndUpdate(jobId, { status: 'restoring', progress: 55 });
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

        const finalSize = sizeOf(processedPath);
        const finalExpiryHours = tierExpiryHours > 0 ? tierExpiryHours : 24;

        await ProcessingJob.findByIdAndUpdate(jobId, { status: 'uploading', progress: 80 });

        const uploaded = await r2Service.uploadWithKey(processedPath, {
          prefix: 'processed/',
          expiryHours: finalExpiryHours,
        });

        const savingsPercent = savingsService.calculate
          ? savingsService.calculate(originalSize, finalSize)
          : originalSize > 0 ? Math.max(0, Math.round((1 - finalSize / originalSize) * 1000) / 10) : 0;

        await ProcessingJob.findByIdAndUpdate(jobId, {
          mediaKind: 'image',
          compressedSize: finalSize,
          finalUrl: uploaded.url,
          modelUsed,
          codec,
          route: decision.route,
          savingsPercent,
          status: 'completed',
          progress: 100,
          completedAt: new Date(),
          expiresAt: new Date(Date.now() + finalExpiryHours * 60 * 60 * 1000),
          restored: didRestore,
          restoreMode,
          previewFrameUrls: [],
          previewClipUrl: null,
          error: null,
        });

        for (const t of temps) safeUnlink(t);
        if (r2Key) { try { await r2Service.deleteObject(r2Key); } catch {} }
        return;
      }

      // ========== VIDEO PATH ==========
      let compressedSize = 0;

      const canResumeRestore =
        (resumeFrom === 'restore' || skipCompress) && Boolean(persistedCompressedKey);

      if (canResumeRestore && persistedCompressedKey) {
        const stillThere = await r2Service.exists(persistedCompressedKey);
        if (!stillThere) throw new Error('Compressed checkpoint expired — full re-upload required');

        console.log('[worker] resume from restore', jobId, persistedCompressedKey);
        await ProcessingJob.findByIdAndUpdate(jobId, { status: 'restoring', progress: 40, error: null });

        fs.mkdirSync(UPLOAD_TEMP_DIR, { recursive: true });
        compressedPath = path.join(
          UPLOAD_TEMP_DIR,
          `${jobId}_resume_compressed${path.extname(persistedCompressedKey) || '.mp4'}`
        );
        await r2Service.downloadToLocal(persistedCompressedKey, compressedPath);
        temps.push(compressedPath);
        processedPath = compressedPath;
        codec = clientCodec || (existing as any).codec || 'libsvtav1';
        compressedSize = clientCompressedSize || (existing as any).compressedSize || sizeOf(compressedPath);
      } else if (skipCompress && filePath) {
        await ProcessingJob.findByIdAndUpdate(jobId, { status: 'routing', progress: 35 });
        compressedPath = filePath;
        processedPath = compressedPath;
        codec = clientCodec || 'libvpx-vp9';
        compressedSize = clientCompressedSize ?? sizeOf(compressedPath);
      } else {
        if (!filePath || !fs.existsSync(filePath)) throw new Error('Missing input file for compress');

        await ProcessingJob.findByIdAndUpdate(jobId, { status: 'compressing', progress: 15 });

        const compressedResult = await compressionService.compress(filePath, {
          tier,
          forceVp9: Boolean(forceVp9) || tier === 'demo',
        });
        compressedPath = compressedResult.outputPath;
        processedPath = compressedPath;
        codec = compressedResult.codec || '';
        compressedSize = compressedResult.compressedSize ?? sizeOf(compressedPath);
        if (compressedPath !== filePath) temps.push(compressedPath);

        // Stage checkpoint — 9 hours
        try {
          const up = await r2Service.uploadWithKey(compressedPath, {
            prefix: 'compressed/',
            expiryHours: STAGE_EXPIRY_HOURS,
          });
          persistedCompressedKey = up.key;
          await ProcessingJob.findByIdAndUpdate(jobId, {
            status: 'compressed',
            progress: 35,
            compressedSize,
            codec,
            compressedKey: up.key,
            forceVp9: Boolean(forceVp9),
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

      const user = userId ? { id: userId, tier, preferredModel } : preferredModel ? { preferredModel } : null;
      const decision = await routingService.decide(
        { originalSize, size: compressedSize },
        deviceProfile,
        user
      );

      // Completed result + savings card lifetime
      const finalExpiryHours = tierExpiryHours > 0 ? tierExpiryHours : 24;

      // Model access — only BHI, Real Web Photo RGT-S, DAT2
      let model: string | null = decision.model || null;
      if (model && !modelAllowed(tier, model)) model = offering.defaultModel;
      if (!model || !modelAllowed(tier, model)) model = null;

      let modelUsed: string = COMPRESSION_ONLY;
      let restoreSkippedReason: string | null = decision.reason || null;

      if (model) {
        await ProcessingJob.findByIdAndUpdate(jobId, { status: 'restoring', progress: 55 });

        try {
          const savingsPercentForGate = savingsService.calculate
            ? savingsService.calculate(originalSize, compressedSize)
            : originalSize > 0 ? Math.max(0, Math.round((1 - compressedSize / originalSize) * 1000) / 10) : 0;

          const fullPath = await restorationService.restore(compressedPath, model, {
            maxWidth: offering.maxWidth,
            savingsPercent: savingsPercentForGate,
            tier,
          });
          if (fullPath !== compressedPath) temps.push(fullPath);
          const fullSize = sizeOf(fullPath);

          if (fullSize > 0 && fullSize <= originalSize) {
            processedPath = fullPath;
            modelUsed = model;
            didRestore = true;
            restoreMode = 'full';
            restoreSkippedReason = null;
          } else {
            restoreSkippedReason = `Full restore ${fullSize}B > original ${originalSize}B — kept compressed`;
            if (fullPath !== compressedPath) safeUnlink(fullPath);
            processedPath = compressedPath;
          }
        } catch (e: any) {
          restoreSkippedReason = e?.message || 'Full restore failed — kept compressed';
          console.warn('[worker] full restore failed:', restoreSkippedReason);
          processedPath = compressedPath;
        }
      }

      // ========== HARD SIZE GATE ==========
      let finalSize = sizeOf(processedPath);

      if (offering.enforceSizeGate && finalSize > originalSize) {
        const compressedOnlySize = sizeOf(compressedPath);
        if (compressedOnlySize > 0 && compressedOnlySize <= originalSize) {
          processedPath = compressedPath;
          finalSize = compressedOnlySize;
          modelUsed = COMPRESSION_ONLY;
          didRestore = false;
          restoreMode = 'none';
          restoreSkippedReason = (restoreSkippedReason || '') + ' | size gate: kept compressed';
        } else {
          console.warn(
            `[worker] size gate: compressed ${compressedOnlySize} and candidate ${finalSize} both > original ${originalSize} — returning original`
          );
          processedPath = originalPath;
          finalSize = originalSize;
          modelUsed = 'original';
          didRestore = false;
          restoreMode = 'none';
          restoreSkippedReason = 'Size gate: re-encode increased size — returned original';
        }
      }

      await ProcessingJob.findByIdAndUpdate(jobId, { status: 'uploading', progress: 80 });

      // Completed result — tier expiry (24 / 72 / 168 / keep)
      const uploaded = await r2Service.uploadWithKey(processedPath, {
        prefix: 'processed/',
        expiryHours: finalExpiryHours > 0 ? finalExpiryHours : 168,
      });
      const finalUrl = uploaded.url;
      finalKey = uploaded.key;
      r2KeysOnFail.push(finalKey);

      const savingsPercent = savingsService.calculate
        ? savingsService.calculate(originalSize, finalSize)
        : originalSize > 0 ? Math.max(0, Math.round((1 - finalSize / originalSize) * 1000) / 10) : 0;

      console.log(
        `[worker] done job=${jobId} tier=${tier} expiryH=${finalExpiryHours} in=${(originalSize / 1024 / 1024).toFixed(1)}MB out=${(finalSize / 1024 / 1024).toFixed(1)}MB saved=${savingsPercent}% mode=${restoreMode} model=${modelUsed}`
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
          const metrics = await qualityMetricsService.runVMAF(originalPath, processedPath);
          vmafScore = typeof metrics?.vmafScore === 'number' && metrics.vmafScore > 0 ? metrics.vmafScore : null;
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

      const expiresAt =
        finalExpiryHours > 0
          ? new Date(Date.now() + finalExpiryHours * 60 * 60 * 1000)
          : null;

      await ProcessingJob.findByIdAndUpdate(jobId, {
        mediaKind: 'video',
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
        expiresAt,                 // drives savings card lifetime
        restored: didRestore,
        restoreMode,
        codec,
        previewFrameUrls: [],
        previewClipUrl: null,
        error: null,
      });

      for (const t of temps) safeUnlink(t);

      if (r2Key) {
        try { await r2Service.deleteObject(r2Key); } catch (e: any) {
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
          ...(persistedCompressedKey ? { compressedKey: persistedCompressedKey } : {}),
        });
      }
      for (const t of temps) safeUnlink(t);
      try {
        const keys = r2KeysOnFail.filter((k) => k && k !== persistedCompressedKey);
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