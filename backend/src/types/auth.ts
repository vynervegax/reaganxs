import type { Request } from 'express';
import type { UserTier } from '../config/tiers';

export type AuthUser = {
  id: string;
  email?: string;
  tier: UserTier;
};

export type AuthRequest = Request & {
  user?: AuthUser;
};