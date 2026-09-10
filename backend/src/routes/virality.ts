import { Router } from 'express';
import { authenticate } from '../middleware/auth';

const router = Router();

router.post('/share', authenticate, async (req, res) => {
  try {
    // Generate shareable card data
    res.json({
      success: true,
      shareUrl: `https://reaganxs.com/share/${Date.now()}`,
      message: 'Savings card generated successfully',
    });
  } catch (error: any) {
    res.status(500).json({ success: false, message: error.message });
  }
});

export default router;