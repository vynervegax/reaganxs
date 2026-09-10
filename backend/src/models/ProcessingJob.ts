import mongoose from 'mongoose';

const ProcessingJobSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: 'User', 
    required: false   // ← Changed to false for demo users
  },
  
  originalFilename: { 
    type: String, 
    required: true 
  },
  
  originalSize: { 
    type: Number, 
    required: true 
  },
  
  compressedSize: { 
    type: Number 
  },
  
  finalUrl: { 
    type: String 
  },
  
  modelUsed: { 
    type: String 
  },
  
  route: { 
    type: String, 
    enum: ['edge', 'cloud'] 
  },
  
  savingsPercent: { 
    type: Number 
  },
  
  // === QUALITY METRICS ===
  vmafScore: { 
    type: Number, 
    default: null 
  },
  
  qualityMetrics: {
    vmaf: { type: Number, default: null },
    psnr: { type: Number, default: null },
    ssim: { type: Number, default: null },
  },

  status: { 
    type: String, 
    enum: ['pending', 'compressing', 'routing', 'restoring', 'completed', 'failed'],
    default: 'pending' 
  },
  
  createdAt: { 
    type: Date, 
    default: Date.now 
  },
  
  completedAt: { 
    type: Date 
  },
});

export const ProcessingJob = mongoose.model('ProcessingJob', ProcessingJobSchema);