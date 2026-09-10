import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { ProcessingJob } from '../models/ProcessingJob';
import mongoose from 'mongoose';

const router = Router();

interface AuthRequest extends Request {
  user?: {
    id?: string;
    _id?: string;
    email?: string;
    tier?: string;
  };
}

router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const rawId = req.user?._id || req.user?.id;

    if (!rawId) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    // Support both string and ObjectId
    const userId = mongoose.Types.ObjectId.isValid(rawId)
      ? new mongoose.Types.ObjectId(rawId)
      : rawId;

    const jobs = await ProcessingJob.find({ userId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    // Fallback: also try string match if nothing found
    if (jobs.length === 0) {
      const jobsByString = await ProcessingJob.find({ userId: String(rawId) })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();
      return res.json(jobsByString);
    }

    res.json(jobs);
  } catch (error: any) {
    console.error('History error:', error);
    res.status(500).json({ error: 'Failed to fetch history' });
  }
});

//DEMO-HISTORY
router.get('/demo', async (req, res) => {
  try {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const jobs = await ProcessingJob.find({
      userId: null,           // demo jobs have no userId
      createdAt: { $gte: thirtyDaysAgo },
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    res.json(jobs);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: 'Failed to fetch demo history' });
  }
});

export default router;