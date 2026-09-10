import mongoose, { Schema, Document } from 'mongoose';
import type { UserTier } from '../config/tiers';

export interface IUser extends Document {
  email: string;
  password: string;
  name?: string;
  tier: UserTier;
  stripeCustomerId?: string;
  stripeSubscriptionId?: string;
  tempPremiumExpiresAt?: Date;
  tempPremiumClaimedAt?: Date;
  resetPasswordToken?: string;
  resetPasswordExpires?: Date;
  createdAt?: Date;
  updatedAt?: Date;
}

const UserSchema = new Schema<IUser>(
  {
    email: { type: String, required: true, unique: true, lowercase: true },
    password: { type: String, required: true },
    name: { type: String },
    tier: {
      type: String,
      enum: ['demo', 'free', 'premium', 'desktop'],
      default: 'free',
    },
    stripeCustomerId: { type: String },
    stripeSubscriptionId: { type: String },
    tempPremiumExpiresAt: { type: Date },
    tempPremiumClaimedAt: { type: Date },
    resetPasswordToken: { type: String },
    resetPasswordExpires: { type: Date },
  },
  { timestamps: true }
);

export const User = mongoose.model<IUser>('User', UserSchema);