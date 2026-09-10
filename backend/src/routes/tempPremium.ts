import { Router, Response } from 'express';
import { authenticate } from '../middleware/auth';
import type { AuthRequest } from '../types/auth';
import { User } from '../models/User';

const router = Router();
const TEMP_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * TEMPORARY — free premium for testing.
 * Remove this route + frontend button when Stripe is live-only.
 */
router.post('/claim', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    if (!req.user?.id) {
      return res.status(401).json({ success: false, message: 'Login required' });
    }

    const user = await User.findById(req.user.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    // Do not override real Stripe desktop/paid subscription if you store that flag
    if (user.stripeSubscriptionId && user.tier === 'premium') {
      return res.json({
        success: true,
        alreadyPaid: true,
        tier: user.tier,
        message: 'You already have paid premium',
      });
    }

    const now = Date.now();
    const expiresAt = user.tempPremiumExpiresAt
      ? new Date(user.tempPremiumExpiresAt).getTime()
      : 0;

    // Still active — no re-claim
    if (expiresAt > now) {
      return res.json({
        success: true,
        tier: 'premium',
        tempPremium: true,
        expiresAt: user.tempPremiumExpiresAt,
        message: 'Temp premium still active',
      });
    }

    // Expired or never claimed → grant / refresh 7 days
    const newExpiry = new Date(now + TEMP_MS);
    user.tier = 'premium';
    user.tempPremiumExpiresAt = newExpiry;
    user.tempPremiumClaimedAt = new Date();
    await user.save();

    return res.json({
      success: true,
      tier: 'premium',
      tempPremium: true,
      expiresAt: newExpiry,
      message: 'Temp premium granted for 7 days',
    });
  } catch (e: any) {
    console.error(e);
    return res.status(500).json({ success: false, message: e.message });
  }
});

/** Optional: let client check status */
router.get('/status', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = await User.findById(req.user!.id).select(
      'tier tempPremiumExpiresAt stripeSubscriptionId'
    );
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    const now = Date.now();
    const exp = user.tempPremiumExpiresAt
      ? new Date(user.tempPremiumExpiresAt).getTime()
      : 0;
    const active = exp > now;

    // Auto-downgrade if temp expired and not on real Stripe
    if (!active && user.tier === 'premium' && !user.stripeSubscriptionId) {
      user.tier = 'free';
      await user.save();
    }

    return res.json({
      success: true,
      tier: active || user.stripeSubscriptionId ? user.tier : 'free',
      tempPremium: active,
      expiresAt: user.tempPremiumExpiresAt || null,
      canClaim: !active && !user.stripeSubscriptionId,
    });
  } catch (e: any) {
    return res.status(500).json({ success: false, message: e.message });
  }
});

export default router;