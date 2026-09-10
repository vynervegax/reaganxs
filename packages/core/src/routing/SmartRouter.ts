import type { UserTier } from '../config/tiers';
import { decideRestore, type DeviceProfile } from '../config/decisionRules';
import { PROGRESSIVE_OFFERINGS, getDefaultModel } from '../config/tiers';

export class SmartRouter {
  static decide(params: {
    tier: UserTier;
    originalSize: number;
    compressedSize: number;
    device?: DeviceProfile;
    preferredModel?: string;
  }) {
    const savingsRatio =
      params.originalSize > 0
        ? 1 - params.compressedSize / params.originalSize
        : 0;

    const decision = decideRestore({
      tier: params.tier,
      savingsRatio,
      device: params.device || { vram: 4, batteryLevel: 100, isLowPower: false },
      preferredModel: params.preferredModel,
    });

    const offering = PROGRESSIVE_OFFERINGS[params.tier] || PROGRESSIVE_OFFERINGS.demo;

    return {
      ...decision,
      model: decision.model || getDefaultModel(params.tier),
      expiryHours: offering.expiryHours,
      maxFileSizeMB: offering.maxFileSizeMB,
      savingsPercent: Math.round(savingsRatio * 1000) / 10,
    };
  }
}