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

const router = Router();

/**
 * Step 1: Frontend asks for a presigned URL
 * POST /api/upload/presign
 * body: { filename, contentType }
 */
router.post('/presign', optionalAuthenticate, async (req, res) => {
  try {
    const { filename, contentType } = req.body;

    if (!filename) {
      return res.status(400).json({ success: false, message: 'filename required' });
    }

    const result = await r2Service.createPresignedUpload(
      sanitizeFilename(filename),
      contentType || 'video/mp4'
    );

    return res.json({
      success: true,
      uploadUrl: result.uploadUrl,
      key: result.key,
    });
  } catch (err: any) {
    console.error('[presign]', err);
    return res.status(500).json({ success: false, message: err.message || 'Presign failed' });
  }
});

/**
 * Step 2: Frontend notifies that the upload to R2 finished
 * POST /api/upload/complete
 * body: { key, originalFilename, originalSize, model?, deviceProfile? }
 */
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
} = req.body;

    if (!key || !originalFilename || !originalSize) {
      return res.status(400).json({
        success: false,
        message: 'key, originalFilename and originalSize are required',
      });
    }

    const user = (req as any).user as
      | { id?: string; _id?: string; tier?: UserTier }
      | undefined;

    const tier = (user?.tier as UserTier) || 'demo';
    const userId = user?.id || user?._id || null;

    // Create job record
    const job = await ProcessingJob.create({
      userId,
      originalFilename: sanitizeFilename(originalFilename),
      originalSize: Number(originalSize),
      status: 'queued',
      progress: 0,
      tier,
      r2Key: key, // store the R2 key
    });

    // Download from R2 → local volume so existing worker can process it
    const localPath = path.join(
      UPLOAD_TEMP_DIR,
      `${Date.now()}-${sanitizeFilename(originalFilename)}`
    );
    fs.mkdirSync(UPLOAD_TEMP_DIR, { recursive: true });

    await r2Service.downloadToLocal(key, localPath);

    // Enqueue the normal video job
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
  },
  { removeOnComplete: 100, removeOnFail: 50 }
);

    return res.json({
      success: true,
      jobId: job._id,
      status: 'queued',
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