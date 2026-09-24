import { Router, Response } from 'express';
import mongoose from 'mongoose';
import { authenticate } from '../middleware/auth';
import { ProcessingJob } from '../models/ProcessingJob';

const router = Router();

type Authed = {
  user?: {
    id?: string;
    _id?: string;
    email?: string;
    tier?: string;
  };
};

router.get('/', authenticate, async (req: Authed, res: Response) => {
  try {
    const rawId = req.user?._id || req.user?.id;
    if (!rawId) {
      return res.status(401).json({ success: false, error: 'Authentication required', jobs: [] });
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
    return res.status(500).json({ success: false, error: 'Failed to fetch history' });
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
    return res.status(500).json({ success: false, error: 'Failed to fetch demo history' });
  }
});

export default router;