import { UserTier } from '../config/tiers';

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email?: string;
        tier: UserTier;
      };
    }
  }
}

export {};