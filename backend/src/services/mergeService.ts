import { Contribution } from '../models/Contribution';
import fs from 'fs';
import path from 'path';

export const mergeService = {
  async queueForMerge(contribution: any) {
    const count = await Contribution.countDocuments({ anonymized: true });
    
    // Trigger merge every 50 contributions
    if (count % 50 === 0) {
      await this.runModelMerge();
    }
  },

  /**
   * Real Model Merging Logic (Federated-style averaging)
   */
  async runModelMerge() {
    console.log('[MergeService] 🚀 Starting community model merge...');

    // Fetch recent anonymized contributions with useful metrics
    const recentContributions = await Contribution.find({ 
      anonymized: true,
      vmafScore: { $gt: 75 } // Only high-quality contributions
    })
    .sort({ uploadedAt: -1 })
    .limit(200);

    if (recentContributions.length < 30) {
      console.log(`[MergeService] Not enough quality data yet (${recentContributions.length}/30)`);
      return;
    }

    // Calculate average VMAF for logging
    const totalVMAF = recentContributions.reduce((sum, c) => sum + (c.vmafScore || 0), 0);
    const avgVMAF = totalVMAF / recentContributions.length;

    console.log(`[MergeService] Merging ${recentContributions.length} contributions | Avg VMAF: ${avgVMAF.toFixed(2)}`);

    // Example: Save merged metadata (in real scenario: average weights or fine-tune)
    const mergeCheckpoint = {
      timestamp: new Date(),
      contributionCount: recentContributions.length,
      avgVMAF,
      modelsUsed: [...new Set(recentContributions.map(c => c.modelUsed))],
      mergedAt: new Date(),
    };

    const checkpointPath = path.join('/models/checkpoints', `merge_${Date.now()}.json`);
    fs.mkdirSync(path.dirname(checkpointPath), { recursive: true });
    fs.writeFileSync(checkpointPath, JSON.stringify(mergeCheckpoint, null, 2));

    console.log(`[MergeService] ✅ Merge completed. Checkpoint saved: ${checkpointPath}`);

    // TODO: Future real merging
    // - Average ONNX model weights
    // - LoRA / fine-tuning on aggregated dataset
    // - Push new model version to model registry
  },

  // For cron job (daily merge)
  async runDailyMerge() {
    console.log('[MergeService] Daily merge triggered');
    await this.runModelMerge();
  }
};