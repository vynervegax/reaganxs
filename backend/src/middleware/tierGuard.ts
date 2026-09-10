import { Response, NextFunction } from 'express';
import type { AuthRequest } from '../types/auth';
import type { UserTier } from '../config/tiers';

const TIER_ORDER: Record<UserTier, number> = {
  demo: 0,
  free: 1,
  premium: 2,
  desktop: 3,
};

/**
 * Allow request if user tier >= minTier.
 * Unauthenticated users are treated as 'demo'.
 */
export function tierGuard(minTier: UserTier = 'demo') {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    const userTier = ((req.user?.tier as UserTier) || 'demo') as UserTier;

    const userRank = TIER_ORDER[userTier] ?? 0;
    const minRank = TIER_ORDER[minTier] ?? 0;

    if (userRank < minRank) {
      return res.status(403).json({
        success: false,
        message: `Requires ${minTier} tier or higher. Current: ${userTier}`,
      });
    }

    // Attach resolved tier for downstream handlers
    (req as any).resolvedTier = userTier;
    next();
  };
}