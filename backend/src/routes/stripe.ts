import { Router, Response, NextFunction } from 'express';
import { authenticate } from '../middleware/auth';
import { stripeService } from '../services/stripeService';
import { authService } from '../services/authService';
import { TEMP_PREMIUM_DAYS } from '../config/constants';
import { User } from '../models/User';

const router = Router();

type AuthRequest = any; // use your shared AuthRequest if you have one

// POST /api/stripe/create-checkout  → $2.99 Premium
router.post(
  '/create-checkout',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.id || req.user?._id;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }
      const session = await stripeService.createCheckoutSession(String(userId));
      return res.json({ success: true, url: session.url });
    } catch (e: any) {
      console.error('[stripe]', e);
      return res.status(500).json({ success: false, message: e.message });
    }
  }
);

// POST /api/stripe/confirm  { sessionId }  — no webhook required for now
router.post(
  '/confirm',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const { sessionId } = req.body || {};
      if (!sessionId) {
        return res.status(400).json({ success: false, message: 'sessionId required' });
      }
      const user = await stripeService.confirmSessionAndActivate(sessionId);
      const token = authService.signToken({
        id: String(user._id),
        email: user.email,
        tier: user.tier,
      });
      return res.json({
        success: true,
        token,
        user: {
          id: String(user._id),
          email: user.email,
          name: user.name,
          tier: user.tier,
        },
      });
    } catch (e: any) {
      return res.status(400).json({ success: false, message: e.message });
    }
  }
);

/**
 * TEMPORARY — 7-day premium for testing.
 * Remove this route before production launch.
 * POST /api/stripe/claim-temp-premium
 */
router.post(
  '/claim-temp-premium',
  authenticate,
  async (req: AuthRequest, res: Response) => {
    try {
      const userId = req.user?.id || req.user?._id;
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      // Already real premium
      if (user.tier === 'premium' || user.tier === 'desktop') {
        return res.json({
          success: true,
          message: 'Already premium',
          user: { id: String(user._id), tier: user.tier },
        });
      }

      // One claim only
      if (user.tempPremiumClaimedAt) {
        const stillValid =
          user.tempPremiumExpiresAt &&
          user.tempPremiumExpiresAt.getTime() > Date.now();
        if (stillValid) {
          return res.json({
            success: true,
            message: 'Temp premium still active',
            expiresAt: user.tempPremiumExpiresAt,
            user: { id: String(user._id), tier: user.tier },
          });
        }
        return res.status(400).json({
          success: false,
          message: 'Temp premium already used. Please pay $2.99.',
        });
      }

      const expires = new Date();
      expires.setDate(expires.getDate() + TEMP_PREMIUM_DAYS);

      user.tier = 'premium';
      user.tempPremiumClaimedAt = new Date();
      user.tempPremiumExpiresAt = expires;
      await user.save();

      const token = authService.signToken({
        id: String(user._id),
        email: user.email,
        tier: user.tier,
      });

      return res.json({
        success: true,
        message: `Premium for ${TEMP_PREMIUM_DAYS} days (testing)`,
        expiresAt: expires,
        token,
        user: {
          id: String(user._id),
          email: user.email,
          tier: user.tier,
          tempPremiumExpiresAt: expires,
        },
      });
    } catch (e: any) {
      return res.status(500).json({ success: false, message: e.message });
    }
  }
);

export default router;