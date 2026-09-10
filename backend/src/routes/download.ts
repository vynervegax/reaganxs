import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { ProcessingJob } from '../models/ProcessingJob';

const router = Router();

router.get('/:jobId', authenticate, async (req, res) => {
  try {
    const job = await ProcessingJob.findOne({
      _id: req.params.jobId,
      userId: (req as any).user._id,
    });

    if (!job || !job.finalUrl) {
      return res.status(404).json({ success: false, message: 'File not found or access denied' });
    }

    // Redirect to R2 temp URL (or serve directly if needed)
    res.redirect(job.finalUrl);
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;