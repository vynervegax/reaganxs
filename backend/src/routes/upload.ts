import { Router, Request, Response } from 'express';
import { optionalAuthenticate } from '../middleware/auth';
import { r2Service } from '../services/r2Service';
import { ProcessingJob } from '../models/ProcessingJob';
import { videoQueue } from '../queue/videoQueue';
import { assertAllowedUpload } from '../middleware/validateFile';
import { resolveMediaKind, type MediaKind } from '../config/mediaKinds';
import type { UserTier } from '../config/tiers';

type Authed = Request & {
  user?: { id?: string; _id?: string; tier?: string };
};

const router = Router();

router.post('/presign', optionalAuthenticate, async (req: Authed, res: Response) => {
  try {
    const { filename, contentType } = req.body || {};
    if (!filename || !contentType) {
      return res.status(400).json({
        success: false,
        message: 'filename and contentType required',
      });
    }

    const tier = (req.user?.tier as UserTier) || 'demo';
    assertAllowedUpload({
      mime: contentType,
      filename,
      size: 0,
      tier,
    });

    const { uploadUrl, key } = await r2Service.createPresignedUpload(
      filename,
      contentType
    );

    return res.json({
      success: true,
      uploadUrl,
      key,
      mediaKind: resolveMediaKind(contentType, filename),
    });
  } catch (e: any) {
    const status = e?.status || 500;
    return res.status(status).json({
      success: false,
      message: e?.message || 'Presign failed',
    });
  }
});

router.post('/complete', optionalAuthenticate, async (req: Authed, res: Response) => {
  try {
    const {
      key,
      originalFilename,
      originalSize,
      model,
      deviceProfile,
      skipCompress,
      mimeType,
      mediaKind: bodyKind,
    } = req.body || {};

    if (!key || !originalFilename) {
      return res.status(400).json({
        success: false,
        message: 'key and originalFilename required',
      });
    }

    const tier = (req.user?.tier as UserTier) || 'demo';
    const userId = req.user?.id || req.user?._id || null;
    const size = Number(originalSize) || 0;

    const { mediaKind: resolved } = assertAllowedUpload({
      mime: mimeType,
      filename: originalFilename,
      size,
      tier,
    });

    const mediaKind: MediaKind =
      (bodyKind as MediaKind) || resolved || resolveMediaKind(mimeType, originalFilename);

    const job = await ProcessingJob.create({
      userId,
      tier,
      originalFilename,
      originalSize: size,
      mediaKind,
      mimeType: mimeType || null,
      r2Key: key,
      status: 'queued',
      progress: 5,
      preferredModel: model,
      deviceProfile,
    });

    const bull = await videoQueue.add(
      'process',
      {
        jobId: String(job._id),
        originalSize: size,
        userId: userId ? String(userId) : null,
        tier,
        preferredModel: model,
        deviceProfile,
        r2Key: key,
        skipCompress: Boolean(skipCompress),
        mediaKind,
        mimeType,
        originalFilename,
      },
      { removeOnComplete: 100, removeOnFail: 50, priority: 5 }
    );

    job.bullJobId = String(bull.id);
    await job.save();

    return res.json({
      success: true,
      jobId: job._id,
      mediaKind,
    });
  } catch (e: any) {
    const status = e?.status || 500;
    return res.status(status).json({
      success: false,
      message: e?.message || 'Complete failed',
    });
  }
});

export default router;