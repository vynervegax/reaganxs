import mongoose, { Schema, Document } from 'mongoose';

export type JobStatus =
  | 'queued'
  | 'pending'
  | 'compressing'
  | 'compressed'
  | 'routing'
  | 'restoring'
  | 'uploading'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type MediaKind = 'video' | 'image' | 'audio' | 'text' | 'custom';

export interface IProcessingJob extends Document {
  userId?: mongoose.Types.ObjectId | string | null;
  tier?: string;
  originalFilename?: string;
  originalSize?: number;
  mediaKind?: MediaKind;
  mimeType?: string;
  filePath?: string;
  r2Key?: string;
  compressedKey?: string;
  compressedSize?: number;
  finalSize?: number;
  finalUrl?: string;
  codec?: string;
  modelUsed?: string;
  route?: string;
  savingsPercent?: number;
  vmafScore?: number | null;
  status: JobStatus;
  progress?: number;
  error?: string | null;
  restored?: boolean;
  restoreMode?: string;
  previewFrameUrls?: string[];
  previewClipUrl?: string | null;
  bullJobId?: string;
  preferredModel?: string;
  deviceProfile?: Record<string, unknown>;
  expiresAt?: Date | null;
  completedAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const ProcessingJobSchema = new Schema<IProcessingJob>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      default: null,
      index: true,
    },
    tier: { type: String, default: 'demo' },
    originalFilename: { type: String },
    originalSize: { type: Number },
    mediaKind: {
      type: String,
      enum: ['video', 'image', 'audio', 'text', 'custom'],
      default: 'video',
      index: true,
    },
    mimeType: { type: String },
    filePath: { type: String },
    r2Key: { type: String },
    compressedKey: { type: String },
    compressedSize: { type: Number },
    finalSize: { type: Number },
    finalUrl: { type: String },
    codec: { type: String },
    modelUsed: { type: String },
    route: { type: String },
    savingsPercent: { type: Number },
    vmafScore: { type: Number, default: null },
    status: {
      type: String,
      enum: [
        'queued',
        'pending',
        'compressing',
        'compressed',
        'routing',
        'restoring',
        'uploading',
        'completed',
        'failed',
        'cancelled',
      ],
      default: 'queued',
      index: true,
    },
    progress: { type: Number, default: 0 },
    error: { type: String, default: null },
    restored: { type: Boolean, default: false },
    restoreMode: { type: String, default: 'none' },
    previewFrameUrls: { type: [String], default: [] },
    previewClipUrl: { type: String, default: null },
    bullJobId: { type: String },
    preferredModel: { type: String },
    deviceProfile: { type: Schema.Types.Mixed },
    expiresAt: { type: Date, default: null },
    completedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

export const ProcessingJob =
  mongoose.models.ProcessingJob ||
  mongoose.model<IProcessingJob>('ProcessingJob', ProcessingJobSchema);