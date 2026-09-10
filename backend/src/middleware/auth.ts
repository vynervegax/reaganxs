import { Response, NextFunction } from 'express';
import { authService } from '../services/authService';
import type { AuthRequest } from '../types/auth';
import type { UserTier } from '../config/tiers';
export type { UserTier };

/** Required auth */
export function authenticate(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization;
    if (!header?.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, message: 'Authentication required' });
    }
    const token = header.slice(7);
    const payload = authService.verifyToken(token);
    req.user = {
      id: payload.id,
      email: payload.email,
      tier: (payload.tier || 'free') as UserTier,
    };
    next();
  } catch {
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }
}

/** Optional auth — demo continues with no user */
export function optionalAuthenticate(
  req: AuthRequest,
  _res: Response,
  next: NextFunction
) {
  try {
    const header = req.headers.authorization;
    if (header?.startsWith('Bearer ')) {
      const token = header.slice(7);
      const payload = authService.verifyToken(token);
      req.user = {
        id: payload.id,
        email: payload.email,
        tier: (payload.tier || 'free') as UserTier,
      };
    }
  } catch {
    // ignore invalid token for demo path
    req.user = undefined;
  }
  next();
}