import { Router } from 'express';
import { optionalAuthenticate } from '../middleware/auth';
import { r2Service } from '../services/r2Service';
import { ProcessingJob } from '../models/ProcessingJob';
import { videoQueue } from '../queue/videoQueue';
import { sanitizeFilename } from '../utils/sanitizer';
import type { UserTier } from '../config/tiers';
import path from 'path';
import fs from 'fs';
import { UPLOAD_TEMP_DIR } from '../config/constants';
import { resolveMediaKind, isMimeAllowed, type MediaKind } from '../config/mediaKinds';

const router = Router();

router.post('/presign', optionalAuthenticate, async (req, res) => {
  try {
    const { filename, contentType } = req.body;

    if (!filename) {
      return res.status(400).json({ success: false, message: 'filename required' });
    }

    if (!isMimeAllowed(contentType, filename)) {
      return res.status(415).json({
        success: false,
        message: 'Unsupported media type. Enabled: video and image.',
      });
    }

    const result = await r2Service.createPresignedUpload(
      sanitizeFilename(filename),
      contentType || 'application/octet-stream'
    );

    return res.json({
      success: true,
      uploadUrl: result.uploadUrl,
      key: result.key,
      mediaKind: resolveMediaKind(contentType, filename),
    });
  } catch (err: any) {
    console.error('[presign]', err);
    return res.status(500).json({ success: false, message: err.message || 'Presign failed' });
  }
});

router.post('/complete', optionalAuthenticate, async (req, res) => {
  try {
    const {
      key,
      originalFilename,
      originalSize,
      compressedSize,
      codec,
      skipCompress,
      model,
      deviceProfile,
      mimeType,
      mediaKind: bodyKind,
    } = req.body;

    if (!key || !originalFilename || !originalSize) {
      return res.status(400).json({
        success: false,
        message: 'key, originalFilename and originalSize are required',
      });
    }

    if (!isMimeAllowed(mimeType, originalFilename)) {
      return res.status(415).json({
        success: false,
        message: 'Unsupported media type.',
      });
    }

    const user = (req as any).user as
      | { id?: string; _id?: string; tier?: UserTier }
      | undefined;

    const tier = (user?.tier as UserTier) || 'demo';
    const userId = user?.id || user?._id || null;

    const mediaKind: MediaKind =
      (bodyKind as MediaKind) || resolveMediaKind(mimeType, originalFilename);

    const job = await ProcessingJob.create({
      userId,
      originalFilename: sanitizeFilename(originalFilename),
      originalSize: Number(originalSize),
      mediaKind,
      mimeType: mimeType || null,
      status: 'queued',
      progress: 0,
      tier,
      r2Key: key,
    });

    const localPath = path.join(
      UPLOAD_TEMP_DIR,
      `${Date.now()}-${sanitizeFilename(originalFilename)}`
    );
    fs.mkdirSync(UPLOAD_TEMP_DIR, { recursive: true });

    await r2Service.downloadToLocal(key, localPath);

    await videoQueue.add(
      'process',
      {
        jobId: String(job._id),
        filePath: localPath,
        originalFilename,
        originalSize: Number(originalSize),
        compressedSize: compressedSize ? Number(compressedSize) : undefined,
        codec: codec || undefined,
        skipCompress: Boolean(skipCompress),
        userId: userId ? String(userId) : null,
        tier,
        preferredModel: model ? String(model) : undefined,
        deviceProfile: deviceProfile || {},
        r2Key: key,
        mediaKind,
        mimeType,
      },
      { removeOnComplete: 100, removeOnFail: 50 }
    );

    return res.json({
      success: true,
      jobId: job._id,
      status: 'queued',
      mediaKind,
    });
  } catch (err: any) {
    console.error('[upload/complete]', err);
    return res.status(500).json({
      success: false,
      message: err.message || 'Failed to start processing',
    });
  }
});

export default router;