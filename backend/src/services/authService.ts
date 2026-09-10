import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { User, IUser } from '../models/User';
import { JWT_SECRET, JWT_EXPIRES_IN } from '../config/constants';
import type { UserTier } from '../config/tiers';

export type AuthTokenPayload = {
  id: string;
  email: string;
  tier: UserTier;
};

function signToken(payload: AuthTokenPayload): string {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured');
  }
  return jwt.sign(payload, JWT_SECRET, {
    expiresIn: JWT_EXPIRES_IN || '7d',
  } as jwt.SignOptions);
}

function verifyToken(token: string): AuthTokenPayload {
  if (!JWT_SECRET) {
    throw new Error('JWT_SECRET is not configured');
  }
  return jwt.verify(token, JWT_SECRET) as AuthTokenPayload;
}

/** Demote expired temp premium → free (unless real payment recorded) */
async function applyTempPremiumExpiry(user: IUser): Promise<IUser> {
  const now = Date.now();
  const expired =
    user.tempPremiumExpiresAt &&
    user.tempPremiumExpiresAt.getTime() < now &&
    !!user.tempPremiumClaimedAt;

  const paid = !!(user as any).premiumPaidAt;

  if (expired && !paid && (user.tier === 'premium' || user.tier === 'desktop')) {
    user.tier = 'free';
    await user.save();
  }

  return user;
}

export const authService = {
  signToken,
  verifyToken,

  async register(email: string, password: string, name?: string) {
    const existing = await User.findOne({ email: email.toLowerCase().trim() });
    if (existing) {
      throw new Error('Email already registered');
    }

    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({
      email: email.toLowerCase().trim(),
      password: hashed,
      name: name?.trim(),
      tier: 'free', // never auto-premium
    });

    const token = signToken({
      id: String(user._id),
      email: user.email,
      tier: user.tier,
    });

    return {
      token,
      user: {
        id: String(user._id),
        email: user.email,
        name: user.name,
        tier: user.tier,
      },
    };
  },

  async login(email: string, password: string) {
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    if (!user) {
      throw new Error('Invalid email or password');
    }

    const ok = await bcrypt.compare(password, user.password);
    if (!ok) {
      throw new Error('Invalid email or password');
    }

    await applyTempPremiumExpiry(user);

    const token = signToken({
      id: String(user._id),
      email: user.email,
      tier: user.tier,
    });

    return {
      token,
      user: {
        id: String(user._id),
        email: user.email,
        name: user.name,
        tier: user.tier,
        tempPremiumExpiresAt: user.tempPremiumExpiresAt,
      },
    };
  },

  async forgotPassword(email: string) {
    const user = await User.findOne({ email: email.toLowerCase().trim() });
    // Always same shape (no email enumeration)
    if (!user) {
      return {
        success: true,
        message: 'If that email exists, a reset link was sent',
      };
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const hashed = crypto.createHash('sha256').update(rawToken).digest('hex');
    user.resetPasswordToken = hashed;
    user.resetPasswordExpires = new Date(Date.now() + 60 * 60 * 1000); // 1h
    await user.save();

    // TODO: send email via Resend with rawToken
    return {
      success: true,
      message: 'If that email exists, a reset link was sent',
      ...(process.env.NODE_ENV !== 'production' ? { resetToken: rawToken } : {}),
    };
  },

  async resetPassword(token: string, newPassword: string) {
    const hashed = crypto.createHash('sha256').update(token).digest('hex');
    const user = await User.findOne({
      resetPasswordToken: hashed,
      resetPasswordExpires: { $gt: new Date() },
    });
    if (!user) {
      throw new Error('Invalid or expired reset token');
    }

    user.password = await bcrypt.hash(newPassword, 10);
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();

    return { success: true, message: 'Password updated' };
  },

  async getUserById(userId: string) {
    const user = await User.findById(userId).select('-password');
    if (!user) {
      throw new Error('User not found');
    }

    await applyTempPremiumExpiry(user);

    return {
      id: String(user._id),
      email: user.email,
      name: user.name,
      tier: user.tier,
      tempPremiumExpiresAt: user.tempPremiumExpiresAt,
      tempPremiumClaimedAt: user.tempPremiumClaimedAt,
      premiumPaidAt: (user as any).premiumPaidAt,
      createdAt: user.createdAt,
    };
  },

  async setTier(userId: string, tier: UserTier) {
    const user = await User.findById(userId);
    if (!user) throw new Error('User not found');
    user.tier = tier;
    await user.save();
    return {
      id: String(user._id),
      email: user.email,
      tier: user.tier,
    };
  },
};