import { Request, Response } from 'express';
import { ProcessingJob, type IProcessingJob } from '../models/ProcessingJob';
import { videoQueue, removeQueuedBullJobs } from '../queue/videoQueue';
import { sanitizeFilename } from '../utils/sanitizer';
import type { UserTier } from '../config/tiers';
import { assertAllowedUpload } from '../middleware/validateFile';
import { resolveMediaKind, type MediaKind } from '../config/mediaKinds';

type AuthedUser = {
  id?: string;
  _id?: string;
  tier?: UserTier;
  preferredModel?: string;
};

function parseDeviceProfile(body: any): Record<string, unknown> {
  let deviceProfile: any = { vram: 4, batteryLevel: 100, isLowPower: false };
  try {
    if (typeof body?.deviceProfile === 'string') {
      deviceProfile = JSON.parse(body.deviceProfile);
    } else if (body?.deviceProfile && typeof body.deviceProfile === 'object') {
      deviceProfile = body.deviceProfile;
    }
  } catch {
    /* defaults */
  }
  if (body?.model) {
    deviceProfile.preferredModel = String(body.model);
  }
  return deviceProfile;
}

export const processController = {
  async processVideo(req: Request, res: Response) {
    const file = req.file;
    if (!file) {
      return res
        .status(400)
        .json({ success: false, message: 'No file uploaded' });
    }

    const user = (req as any).user as AuthedUser | undefined;
    const tier = ((user?.tier as UserTier) || 'demo') as UserTier;
    const userId = user?.id || user?._id || null;
    const deviceProfile = parseDeviceProfile(req.body);

    let mediaKind: MediaKind;
    try {
      const allowed = assertAllowedUpload({
        mime: file.mimetype,
        filename: file.originalname,
        size: file.size,
        tier,
      });
      const fromBody =
        typeof req.body?.mediaKind === 'string'
          ? (req.body.mediaKind as MediaKind)
          : null;
      mediaKind =
        fromBody || allowed.mediaKind || resolveMediaKind(file.mimetype, file.originalname);
    } catch (e: any) {
      const status = e?.status || 400;
      return res.status(status).json({
        success: false,
        message: e?.message || 'Unsupported media type',
      });
    }

    const job = await ProcessingJob.create({
      userId,
      originalFilename: sanitizeFilename(file.originalname),
      originalSize: file.size,
      mediaKind,
      mimeType: file.mimetype,
      status: 'queued',
      progress: 0,
      tier,
    });

    const bullJob = await videoQueue.add(
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
        mediaKind,
        mimeType: file.mimetype,
      },
      { removeOnComplete: 100, removeOnFail: 50, priority: 5 }
    );

    await ProcessingJob.findByIdAndUpdate(job._id, {
      bullJobId: String(bullJob.id),
    });

    return res.json({
      success: true,
      jobId: job._id,
      status: 'queued',
      mediaKind,
    });
  },

  async getJobStatus(req: Request, res: Response) {
    const job = await ProcessingJob.findById(req.params.id).lean<
      IProcessingJob | null
    >();
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
        compressedKey: job.compressedKey || null,
        mediaKind: job.mediaKind || 'video',
        mimeType: job.mimeType || null,
        canRetryRestore: Boolean(
          (job.status === 'failed' || job.status === 'cancelled') &&
            job.compressedKey
        ),
        error: job.error || null,
        previewFrames: job.previewFrameUrls || [],
        previewClipUrl: job.previewClipUrl || null,
      },
    });
  },

  async cancelJob(req: Request, res: Response) {
    const job = await ProcessingJob.findById(req.params.id);
    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    const user = (req as any).user as { id?: string; _id?: string } | undefined;
    const uid = user?.id || user?._id;
    if (job.userId && uid && String(job.userId) !== String(uid)) {
      return res.status(403).json({ success: false, message: 'Not your job' });
    }

    const status = job.status;
    if (status === 'completed' || status === 'cancelled') {
      return res.json({ success: true, status, message: 'Already finished' });
    }

    let removed = 0;
    try {
      if (job.bullJobId) {
        const bj = await videoQueue.getJob(String(job.bullJobId));
        if (bj) {
          const state = String(await bj.getState());
          if (state === 'waiting' || state === 'delayed') {
            await bj.remove();
            removed = 1;
          }
        }
      }
      if (removed === 0) {
        removed = await removeQueuedBullJobs(String(job._id));
      }
    } catch (e: any) {
      console.warn('[cancel] queue remove', e?.message);
    }

    job.status = 'cancelled';
    job.error = 'Cancelled by user';
    job.progress = 0;
    await job.save();

    return res.json({
      success: true,
      status: 'cancelled',
      removedFromQueue: removed,
      message:
        status === 'queued' || status === 'pending'
          ? 'Removed from queue'
          : 'Marked cancelled (active encode may finish current step)',
    });
  },

  async retryJob(req: Request, res: Response) {
    const job = await ProcessingJob.findById(req.params.id);
    if (!job) {
      return res.status(404).json({ success: false, message: 'Job not found' });
    }

    const user = (req as any).user as { id?: string; _id?: string } | undefined;
    const uid = user?.id || user?._id;
    if (job.userId && uid && String(job.userId) !== String(uid)) {
      return res.status(403).json({ success: false, message: 'Not your job' });
    }

    if (job.status === 'completed') {
      return res
        .status(400)
        .json({ success: false, message: 'Already completed' });
    }

    if (!job.compressedKey) {
      return res.status(400).json({
        success: false,
        message:
          'No compressed artifact — full re-upload required (failed before compress finished)',
      });
    }

    try {
      await removeQueuedBullJobs(String(job._id));
    } catch {
      /* ignore */
    }

    const promote = req.body?.promote === true || req.body?.promote === 'true';
    const priority = promote ? 1 : 8;
    const mediaKind: MediaKind = (job.mediaKind as MediaKind) || 'video';

    job.status = 'queued';
    job.progress = 35;
    job.error = undefined;
    await job.save();

    const bullJob = await videoQueue.add(
      'process',
      {
        jobId: String(job._id),
        originalFilename: job.originalFilename,
        originalSize: job.originalSize || 0,
        userId: job.userId ? String(job.userId) : null,
        tier: job.tier || 'demo',
        preferredModel: req.body?.model,
        deviceProfile: req.body?.deviceProfile || {
          vram: 4,
          batteryLevel: 100,
          isLowPower: false,
        },
        resumeFrom: 'restore',
        compressedKey: job.compressedKey,
        compressedSize: job.compressedSize,
        codec: job.codec,
        skipCompress: true,
        mediaKind,
        mimeType: job.mimeType,
      },
      { removeOnComplete: 100, removeOnFail: 50, priority }
    );

    job.bullJobId = String(bullJob.id);
    await job.save();

    return res.json({
      success: true,
      jobId: job._id,
      status: 'queued',
      resumeFrom: 'restore',
      mediaKind,
      priority,
      message: promote
        ? 'Restore retry queued at front'
        : 'Restore retry queued (after new uploads unless promoted)',
    });
  },
};