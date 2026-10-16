import { Request, Response } from 'express';
import { ProcessingJob } from '../models/ProcessingJob';
import { videoQueue } from '../queue/videoQueue';
import { sanitizeFilename } from '../utils/sanitizer';
import type { UserTier } from '../config/tiers';

export const processController = {
  async processVideo(req: Request, res: Response) {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ success: false, message: 'No video uploaded' });
    }

    const user = (req as any).user as
      | { id?: string; _id?: string; tier?: UserTier; preferredModel?: string }
      | undefined;

    let deviceProfile: any = { vram: 4, batteryLevel: 100, isLowPower: false };
    try {
      if (typeof req.body?.deviceProfile === 'string') {
        deviceProfile = JSON.parse(req.body.deviceProfile);
      } else if (req.body?.deviceProfile && typeof req.body.deviceProfile === 'object') {
        deviceProfile = req.body.deviceProfile;
      }
    } catch {
      /* defaults */
    }
    if (req.body?.model) {
      deviceProfile.preferredModel = String(req.body.model);
    }

    const tier = ((user?.tier as UserTier) || 'demo') as UserTier;
    const userId = user?.id || user?._id || null;

    const job = await ProcessingJob.create({
      userId,
      originalFilename: sanitizeFilename(file.originalname),
      originalSize: file.size,
      status: 'queued',
      progress: 0,
      tier,
    });

    await videoQueue.add(
      'process',
      {
        jobId: String(job._id),
        filePath: file.path,
        originalFilename: file.originalname,
        originalSize: file.size,
        userId: userId ? String(userId) : null,
        tier,
        preferredModel: req.body?.model ? String(req.body.model) : undefined,
        deviceProfile,
      },
      { removeOnComplete: 100, removeOnFail: 50 }
    );

    return res.json({
      success: true,
      jobId: job._id,
      status: 'queued',
    });
  },

  async getJobStatus(req: Request, res: Response) {
    const job = await ProcessingJob.findById(req.params.id).lean();
    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    return res.json({
      success: true,
      job: {
        id: job._id,
        status: job.status,
        progress: job.progress || 0,
        finalUrl: job.finalUrl || null,
        modelUsed: job.modelUsed || null,
        savingsPercent: job.savingsPercent || 0,
        vmafScore: job.vmafScore ?? null,
        restored: job.restored ?? false,
        didRestore: job.restored ?? false,
        restoreMode: job.restoreMode || null,
        codec: job.codec || null,
        originalSize: job.originalSize,
        finalSize: job.compressedSize || null,
        error: job.error || null,
        previewFrames: job.previewFrameUrls || [],
        previewClipUrl: job.previewClipUrl || null,
      },
    });
  },
};