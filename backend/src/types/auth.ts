import type { Request } from 'express';
import type { UserTier } from '../models/User';

export type AuthUser = {
  id: string;
  email?: string;
  tier: UserTier;
};

export interface AuthRequest extends Request {
  user?: AuthUser;
}