import mongoose from 'mongoose';

const ProcessingJobSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: false,
    },

    originalFilename: {
      type: String,
      required: true,
    },

    originalSize: {
      type: Number,
      required: true,
    },

    compressedSize: {
      type: Number,
    },

    finalUrl: {
      type: String,
    },

    modelUsed: {
      type: String,
    },

    route: {
      type: String,
      enum: ['edge', 'cloud', 'local'],
    },

    savingsPercent: {
      type: Number,
    },

    vmafScore: {
      type: Number,
      default: null,
    },

    qualityMetrics: {
      vmaf: { type: Number, default: null },
      psnr: { type: Number, default: null },
      ssim: { type: Number, default: null },
    },

    status: {
      type: String,
      enum: [
        'queued',
        'pending',
        'compressing',
        'routing',
        'restoring',
        'uploading',
        'completed',
        'failed',
      ],
      default: 'queued',
    },

    progress: {
      type: Number,
      default: 0,
    },

    restored: {
      type: Boolean,
      default: false,
    },

    restoreMode: {
      type: String,
      enum: ['none', 'full', 'partial-frames'],
      default: 'none',
    },

    codec: {
      type: String,
    },

    error: {
      type: String,
    },

    previewFrameUrls: {
      type: [String],
      default: [],
    },

    previewClipUrl: {
      type: String,
    },

    tier: {
      type: String,
    },

    createdAt: {
      type: Date,
      default: Date.now,
    },

    completedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

export const ProcessingJob = mongoose.model('ProcessingJob', ProcessingJobSchema);