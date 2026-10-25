import { Router, Response, Request } from 'express';
import mongoose from 'mongoose';
import { authenticate } from '../middleware/auth';
import { ProcessingJob } from '../models/ProcessingJob';
import { removeQueuedBullJobs, videoQueue } from '../queue/videoQueue';

const router = Router();

type AuthedRequest = Request & {
  user?: {
    id?: string;
    _id?: string;
    email?: string;
    tier?: string;
  };
};

router.get('/', authenticate, async (req: AuthedRequest, res: Response) => {
  try {
    const rawId = req.user?._id || req.user?.id;
    if (!rawId) {
      return res
        .status(401)
        .json({ success: false, error: 'Authentication required', jobs: [] });
    }

    const userId = mongoose.Types.ObjectId.isValid(String(rawId))
      ? new mongoose.Types.ObjectId(String(rawId))
      : rawId;

    const jobs = await ProcessingJob.find({ userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    if (jobs.length === 0) {
      const jobsByString = await ProcessingJob.find({ userId: String(rawId) })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();
      return res.json(jobsByString);
    }

    return res.json(jobs);
  } catch (error) {
    console.error('History error:', error);
    return res
      .status(500)
      .json({ success: false, error: 'Failed to fetch history' });
  }
});

router.get('/demo', async (_req, res) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const jobs = await ProcessingJob.find({
      userId: null,
      createdAt: { $gte: thirtyDaysAgo },
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    return res.json(jobs);
  } catch (error) {
    console.error(error);
    return res
      .status(500)
      .json({ success: false, error: 'Failed to fetch demo history' });
  }
});

/** Delete from history; if still queued, also remove from BullMQ */
router.delete('/:id', authenticate, async (req: AuthedRequest, res: Response) => {
  try {
    const rawId = req.user?._id || req.user?.id;
    if (!rawId) {
      return res.status(401).json({ success: false, message: 'Auth required' });
    }

    const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
    if (!id) {
      return res.status(400).json({ success: false, message: 'Missing job id' });
    }

    const job = await ProcessingJob.findById(String(id));
    if (!job) {
      return res.status(404).json({ success: false, message: 'Not found' });
    }

    if (job.userId && String(job.userId) !== String(rawId)) {
      return res.status(403).json({ success: false, message: 'Not your job' });
    }

    if (job.status === 'queued' || job.status === 'pending') {
      try {
        if (job.bullJobId) {
          const bj = await videoQueue.getJob(String(job.bullJobId));
          if (bj) await bj.remove();
        }
        await removeQueuedBullJobs(String(job._id));
      } catch (e: any) {
        console.warn('[history delete] queue', e?.message);
      }
    }

    await ProcessingJob.findByIdAndDelete(job._id);

    return res.json({ success: true, message: 'Deleted' });
  } catch (error) {
    console.error('History delete error:', error);
    return res.status(500).json({ success: false, message: 'Delete failed' });
  }
});

export default router;