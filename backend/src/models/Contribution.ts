import mongoose from 'mongoose';

const ContributionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  anonymized: { type: Boolean, default: true },
  vmafScore: Number,
  modelUsed: String,
  savingsPercent: Number,
  uploadedAt: { type: Date, default: Date.now },
});

export const Contribution = mongoose.model('Contribution', ContributionSchema);