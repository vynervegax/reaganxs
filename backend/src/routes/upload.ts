import { Router, Request, Response } from 'express';
import { r2Service } from '../services/r2Service';
import { ProcessingJob } from '../models/ProcessingJob';
import { enqueueMediaJob } from '../queue/videoQueue';
import { assertAllowedUpload, resolveMediaKindSafe } from '../utils/uploadHelpers';
import { resolveMediaKind } from '../config/mediaKinds';

// If you prefer, inline assertAllowedUpload from validateFile instead of uploadHelpers

type Authed = Request & { user?: { id?: string; _id?: string; tier?: string } };

const router = Router();

router.post('/presign', async (req: Authed, res: Response) => {
  try {
    const { filename, contentType } = req.body || {};
    if (!filename || !contentType) {
      return res.status(400).json({
        success: false,
        message: 'filename and contentType required',
      });
    }

    const tier = req.user?.tier || 'demo';
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

router.post('/complete', async (req: Authed, res: Response) => {
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

    const tier = req.user?.tier || 'demo';
    const userId = req.user?.id || req.user?._id || null;
    const size = Number(originalSize) || 0;

    const { mediaKind } = assertAllowedUpload({
      mime: mimeType,
      filename: originalFilename,
      size,
      tier,
    });

    const kind = bodyKind || mediaKind;

    const job = await ProcessingJob.create({
      userId,
      tier,
      originalFilename,
      originalSize: size,
      mediaKind: kind,
      mimeType: mimeType || null,
      r2Key: key,
      status: 'queued',
      progress: 5,
      preferredModel: model,
      deviceProfile,
    });

    const bull = await enqueueMediaJob({
      jobId: String(job._id),
      originalSize: size,
      userId: userId ? String(userId) : null,
      tier,
      preferredModel: model,
      deviceProfile,
      r2Key: key,
      skipCompress: Boolean(skipCompress),
      mediaKind: kind,
      mimeType,
      originalFilename,
    });

    job.bullJobId = String(bull.id);
    await job.save();

    return res.json({
      success: true,
      jobId: job._id,
      mediaKind: kind,
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