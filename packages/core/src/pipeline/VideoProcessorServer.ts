import { CompressionService } from '../compression/CompressionService';
import { RestorationService } from '../restoration/RestorationService';
import { SmartRouter } from '../routing/SmartRouter';
import { UserTier } from '../config/tiers';

export class VideoProcessorServer {
  private compressor = new CompressionService();
  private restorer = new RestorationService();
  private router = new SmartRouter();

  async process(
    inputPath: string,
    deviceProfile: any,
    userTier: UserTier   // ← Fixed type
  ) {
    // 1. Compress Aggressively First
    const compressed = await this.compressor.compress(inputPath, `/tmp/compressed_${Date.now()}.mp4`);

    // 2. Smart Routing
    const decision = this.router.decide({
      fileSize: compressed.size,
      deviceProfile,
      userTier,   // ← Now matches
    });

    // 3. Selective Restoration
    let finalPath = compressed.outputPath;
    if (decision.shouldRestore) {
      const restoreResult = await this.restorer.restore(
        compressed.outputPath,
        `/tmp/restored_${Date.now()}.mp4`,
        decision.model
      );
      finalPath = restoreResult.outputPath;   // ← Fixed return type
    }

    return {
      outputPath: finalPath,
      modelUsed: decision.model,
      savings: Math.round((1 - compressed.size / 1000000) * 100) / 100,
    };
  }
}