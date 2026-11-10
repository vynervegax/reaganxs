import { Router, Request, Response, NextFunction } from 'express';

/**
 * Prefer your real auth middleware. This wrapper avoids TS2305 if the
 * project exports `authMiddleware` / `authenticate` instead of `requireAuth`.
 */
let auth: (req: Request, res: Response, next: NextFunction) => void;

try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const m = require('../middleware/auth');
  auth =
    m.requireAuth ||
    m.authMiddleware ||
    m.authenticate ||
    m.default ||
    ((_req: Request, res: Response) =>
      res.status(501).json({ success: false, message: 'Auth not configured' }));
} catch {
  auth = (_req, res) =>
    res.status(501).json({ success: false, message: 'Auth module missing' });
}

const router = Router();

router.get('/me/entitlements', auth, async (req: Request, res: Response) => {
  const user = (req as any).user as {
    id?: string;
    tier?: string;
    premiumUntil?: string | Date | null;
  };

  const tier = (user?.tier || 'free').toLowerCase();
  const premiumUntil = user?.premiumUntil ? new Date(user.premiumUntil) : null;
  const premiumActive =
    tier === 'premium' ||
    tier === 'desktop' ||
    (premiumUntil != null && premiumUntil.getTime() > Date.now());

  return res.json({
    success: true,
    tier,
    premiumActive,
    desktopRealModels: premiumActive,
    allowedDesktopModels: premiumActive
      ? [
          'rgt-webphoto',
          'atd-webphoto',
          'rgt-s',
          'atd-srx4',
          '4x-bhi',
        ]
      : [],
    checkedAt: new Date().toISOString(),
  });
});

export default router;