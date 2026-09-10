import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { Contribution } from '../models/Contribution';
import { mergeService } from '../services/mergeService';

const router = Router();

router.post('/', authenticate, async (req, res) => {
  try {
    const { anonymized = true, vmafScore, modelUsed, savingsPercent } = req.body;

    const contribution = await Contribution.create({
      userId: (req as any).user._id,
      anonymized,
      vmafScore,
      modelUsed,
      savingsPercent,
      uploadedAt: new Date(),
    });

    // Trigger merge if enough contributions
    if (anonymized) {
      await mergeService.queueForMerge(contribution);
    }

    res.json({ success: true, contributionId: contribution._id });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;