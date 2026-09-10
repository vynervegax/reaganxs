import {
  UserTier,
  PROGRESSIVE_OFFERINGS,
  getDefaultModel,
  canAccessModel,
} from '../config/tiers';
import { MIN_SAVINGS_FOR_RESTORE } from '../config/constants';

// If ModelId lives in tiers/types:
type ModelId = string; // or: import type { ModelId } from '../types';

export interface ProcessingDecision {
  route: 'edge' | 'cloud';
  model: ModelId;
  shouldRestore: boolean;
  reason: string;
  expiryHours: number;
}

export const routingService = {
  async decide(
    compressed: { originalSize: number; size: number },
    deviceProfile: any,
    user: any
  ): Promise<ProcessingDecision> {
    const tier = ((user?.tier as UserTier) || 'demo') as UserTier;
    const offering = PROGRESSIVE_OFFERINGS[tier] || PROGRESSIVE_OFFERINGS.demo;

    const original = compressed.originalSize || 1;
    const savings = Math.max(0, (original - compressed.size) / original);

    let model: ModelId = getDefaultModel(tier) as ModelId;

    const preferred = deviceProfile?.preferredModel || user?.preferredModel;
    if (preferred && canAccessModel(tier, String(preferred))) {
      model = String(preferred) as ModelId; // ← fix
    }

    const lowPower = !!deviceProfile?.isLowPower;
    const battery = deviceProfile?.batteryLevel ?? 100;

    const shouldRestore =
      savings >= MIN_SAVINGS_FOR_RESTORE && !lowPower && battery > 20;

    return {
      route: lowPower ? 'edge' : 'cloud',
      model,
      shouldRestore,
      reason: shouldRestore
        ? `Restore with ${model} (tier=${tier})`
        : savings < MIN_SAVINGS_FOR_RESTORE
        ? `Savings ${(savings * 100).toFixed(1)}% < ${MIN_SAVINGS_FOR_RESTORE * 100}% — compress only`
        : 'Device constraints — compress only',
      expiryHours: offering.expiryHours,
    };
  },
};