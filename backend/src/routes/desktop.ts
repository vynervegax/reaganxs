import { Router, Response } from 'express';
import { authenticate } from '../middleware/auth';
import { hasDesktopAccess } from '../config/tiers';

const router = Router();

function linksFromEnv() {
  return {
    'mac-arm64': process.env.DESKTOP_URL_MAC_ARM64 || null,
    'mac-x64': process.env.DESKTOP_URL_MAC_X64 || null,
    'win-x64': process.env.DESKTOP_URL_WIN || null,
  };
}

router.get('/download-links', authenticate, (req, res: Response) => {
  const tier = (req as any).user?.tier || 'free';

  if (!hasDesktopAccess(tier)) {
    return res.status(403).json({
      success: false,
      message: 'Premium required for the desktop download',
    });
  }

  const links = linksFromEnv();
  const available = Object.values(links).some(Boolean);

  return res.json({
    success: true,
    version: process.env.DESKTOP_VERSION || '0.1.0',
    links,
    available,
  });
});

export default router;