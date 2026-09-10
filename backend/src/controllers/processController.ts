import { Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import { routingService } from '../services/routingService';
import { compressionService } from '../services/compressionService';
import { restorationService } from '../services/restorationService';
import { r2Service } from '../services/r2Service';
import { savingsService } from '../services/savingsService';
import { qualityMetricsService } from '../services/qualityMetricsService';
import { sanitizeFilename } from '../utils/sanitizer';
import { ProcessingJob } from '../models/ProcessingJob';
import {
  COMPRESSION_ONLY,
  PARTIAL_BY_TIER,
} from '../config/constants';
import { PROGRESSIVE_OFFERINGS, type UserTier } from '../config/tiers';

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

export const processController = {
  async processVideo(req: Request, res: Response) {
    const file = req.file;
    if (!file) {
      return res
        .status(400)
        .json({ success: false, message: 'No video uploaded' });
    }

    const user = (req as any).user as
      | { id?: string; _id?: string; tier?: UserTier; preferredModel?: string }
      | undefined;

    let deviceProfile: any = {
      vram: 4,
      batteryLevel: 100,
      isLowPower: false,
    };
    try {
      if (typeof req.body?.deviceProfile === 'string') {
        deviceProfile = JSON.parse(req.body.deviceProfile);
      } else if (
        req.body?.deviceProfile &&
        typeof req.body.deviceProfile === 'object'
      ) {
        deviceProfile = req.body.deviceProfile;
      }
    } catch {
      /* defaults */
    }
    if (req.body?.model) {
      deviceProfile.preferredModel = String(req.body.model);
    }

    const tier = ((user?.tier as UserTier) || 'demo') as UserTier;
    const offering = PROGRESSIVE_OFFERINGS[tier] || PROGRESSIVE_OFFERINGS.demo;
    const partialOpts = PARTIAL_BY_TIER[tier] || PARTIAL_BY_TIER.demo;

    const originalPath = file.path;
    const originalSize = file.size;
    let processedPath = '';
    let compressedPath = '';
    let didRestore = false;
    let restoreMode: 'none' | 'full' | 'partial-frames' = 'none';
    let codec = '';
    let previewFrameUrls: string[] = [];
    let previewClipUrl: string | null = null;
    const temps: string[] = [originalPath];

    try {
      const userId = user?.id || user?._id || null;

      const job = await ProcessingJob.create({
        userId,
        originalFilename: sanitizeFilename(file.originalname),
        originalSize,
        status: 'compressing',
        tier,
      });

      // 1) Compress (same presets as desktop)
      const compressedResult = await compressionService.compress(originalPath);
      compressedPath = compressedResult.outputPath;
      processedPath = compressedPath;
      codec = compressedResult.codec || '';
      const compressedSize =
        compressedResult.compressedSize ?? sizeOf(compressedPath);
      temps.push(compressedPath);

      // 2) Route by tier model
      const decision = await routingService.decide(
        { originalSize, size: compressedSize },
        deviceProfile,
        user || null
      );

      let modelUsed: string = COMPRESSION_ONLY;
      let restoreSkippedReason: string | null = decision.reason || null;
      const model = decision.model;

      // 3) Full restore → size ≤ original → else tiered partial frames
      if (model) {
        await ProcessingJob.findByIdAndUpdate(job._id, { status: 'restoring' });

        let fullAccepted = false;
        try {
          const fullPath = await restorationService.restore(
            compressedPath,
            model,
            { maxWidth: tier === 'demo' ? 960 : 1280 }
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
            restoreSkippedReason = `Full restore ${fullSize}B > original ${originalSize}B — partial frames`;
            safeUnlink(fullPath);
          }
        } catch (e: any) {
          restoreSkippedReason =
            e?.message || 'Full restore failed — partial frames';
          console.warn('[process]', restoreSkippedReason);
        }

        if (!fullAccepted) {
          try {
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
                  Math.min(24, decision.expiryHours || 24)
                );
                previewFrameUrls.push(url);
              } catch (upErr: any) {
                console.warn('[process] frame upload', upErr?.message);
              }
              temps.push(fp);
            }

            try {
              const clipLocal = path.join(
                partial.workDir,
                `preview_${Date.now()}.webm`
              );
              await restorationService.framesToPreviewClip(
                partial.framePaths,
                clipLocal,
                2
              );
              temps.push(clipLocal);
              if (
                sizeOf(clipLocal) > 0 &&
                sizeOf(clipLocal) <= originalSize
              ) {
                previewClipUrl = await r2Service.uploadWithExpiry(
                  clipLocal,
                  Math.min(24, decision.expiryHours || 24)
                );
              }
            } catch (clipErr: any) {
              console.warn('[process] preview clip', clipErr?.message);
            }

            processedPath = compressedPath;
            modelUsed = `${model}-partial`;
            didRestore = true;
            restoreMode = 'partial-frames';
            restoreSkippedReason =
              (restoreSkippedReason ? restoreSkippedReason + ' | ' : '') +
              `Partial frames OK (${partial.frameCount}, tier=${tier})`;
          } catch (pfErr: any) {
            processedPath = compressedPath;
            modelUsed = COMPRESSION_ONLY;
            didRestore = false;
            restoreMode = 'none';
            restoreSkippedReason =
              (restoreSkippedReason ? restoreSkippedReason + ' | ' : '') +
              (pfErr?.message || 'Partial frames failed');
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

      const finalUrl = await r2Service.uploadWithExpiry(
        processedPath,
        decision.expiryHours
      );

      const savingsPercent = savingsService.calculate
        ? savingsService.calculate(originalSize, finalSize)
        : originalSize > 0
        ? Math.max(0, Math.round((1 - finalSize / originalSize) * 1000) / 10)
        : 0;

      let vmafScore: number | null = null;
      if (offering.canUseVMAF && (tier === 'premium' || tier === 'desktop')) {
        try {
          const metrics = await qualityMetricsService.runVMAF(
            originalPath,
            processedPath
          );
          vmafScore =
            typeof metrics?.vmafScore === 'number' ? metrics.vmafScore : null;
        } catch (e: any) {
          console.warn('[process] VMAF', e?.message);
        }
      }

      await ProcessingJob.findByIdAndUpdate(job._id, {
        compressedSize: finalSize,
        finalUrl,
        modelUsed,
        route: decision.route,
        savingsPercent,
        vmafScore,
        status: 'completed',
        completedAt: new Date(),
        restored: didRestore,
        restoreMode,
        codec,
        previewFrameUrls,
        previewClipUrl,
      });

      for (const t of temps) safeUnlink(t);

      return res.json({
        success: true,
        url: finalUrl,
        savingsPercent,
        vmafScore,
        modelUsed,
        codec,
        originalSize,
        finalSize,
        compressedSize,
        expiryHours: decision.expiryHours,
        isDemo: !user,
        tier,
        restored: didRestore,
        didRestore,
        restoreMode,
        shouldRestore: decision.shouldRestore,
        restoreSkippedReason,
        reason: restoreSkippedReason,
        previewFrames: previewFrameUrls,
        previewClipUrl,
        stages: [
          `compress:ok${codec ? ` (${codec})` : ''}`,
          `savings:${savingsPercent}%`,
          restoreMode === 'full'
            ? `restore:full:${modelUsed}`
            : restoreMode === 'partial-frames'
            ? `restore:partial-frames:${previewFrameUrls.length}`
            : 'restore:skipped',
          vmafScore != null ? `vmaf:${vmafScore}` : 'vmaf:none',
        ],
      });
    } catch (error: any) {
      console.error('[process]', error);
      for (const t of temps) safeUnlink(t);
      return res.status(500).json({
        success: false,
        message: error?.message || 'Processing failed',
      });
    }
  },
};