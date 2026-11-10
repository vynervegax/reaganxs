// backend/src/routes/entitlements.ts
import { Router, Request, Response } from 'express';
import { requireAuth } from '../middleware/auth'; // your JWT middleware

const router = Router();

router.get('/me/entitlements', requireAuth, async (req: Request, res: Response) => {
  const user = (req as any).user as {
    id?: string;
    tier?: string;
    premiumUntil?: string | Date | null;
  };

  const tier = (user.tier || 'free').toLowerCase();
  const premiumUntil = user.premiumUntil ? new Date(user.premiumUntil) : null;
  const premiumActive =
    tier === 'premium' ||
    tier === 'desktop' ||
    (premiumUntil != null && premiumUntil.getTime() > Date.now());

  return res.json({
    success: true,
    tier,
    premiumActive,
    desktopRealModels: premiumActive, // Real Web Photo RGT/ATD + heavy desktop weights
    allowedDesktopModels: premiumActive
      ? ['rgt-webphoto', 'atd-webphoto', 'rgt-s', 'atd-srx4', '4x-bhi']
      : [], // free desktop: no real inference
    checkedAt: new Date().toISOString(),
  });
});

export default router;