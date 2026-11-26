import mongoose, { Schema, Document } from 'mongoose';

export interface IJob extends Document {
  userId?: string;
  tier: 'demo' | 'free' | 'premium' | 'desktop';
  forceVp9: boolean;
  usedVp9BecauseSlow?: boolean;
  status: 'queued' | 'uploading' | 'compressing' | 'restoring' | 'done' | 'failed';
  inputPath?: string;
  compressedPath?: string;
  restoredPath?: string;
  savingsPercent?: number;
  codec?: string;
  error?: string;
  createdAt: Date;
  updatedAt: Date;
}

const JobSchema = new Schema<IJob>(
  {
    userId: { type: String },
    tier: { type: String, enum: ['demo', 'free', 'premium', 'desktop'], required: true },
    forceVp9: { type: Boolean, default: false },
    usedVp9BecauseSlow: { type: Boolean },
    status: {
      type: String,
      enum: ['queued', 'uploading', 'compressing', 'restoring', 'done', 'failed'],
      default: 'queued',
    },
    inputPath: String,
    compressedPath: String,
    restoredPath: String,
    savingsPercent: Number,
    codec: String,
    error: String,
  },
  { timestamps: true }
);

export const Job = mongoose.model<IJob>('Job', JobSchema);