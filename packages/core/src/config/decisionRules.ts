import type { UserTier, ModelId } from './tiers';
import { getDefaultModel, getModelsForTier } from './tiers';

export interface DeviceProfile {
  vram?: number;
  batteryLevel?: number;
  isLowPower?: boolean;
  platform?: string;
}

export interface DecisionInput {
  tier: UserTier;
  savingsRatio: number; // 0..1
  device: DeviceProfile;
  preferredModel?: string;
}

export interface DecisionResult {
  shouldRestore: boolean;
  model: ModelId;
  reason: string;
  route: 'edge' | 'cloud';
}

const MIN_SAVINGS_FOR_RESTORE = 0.15;

export function decideRestore(input: DecisionInput): DecisionResult {
  const { tier, savingsRatio, device, preferredModel } = input;
  const allowed = getModelsForTier(tier);
  let model: ModelId = getDefaultModel(tier);

  if (preferredModel && (allowed as string[]).includes(preferredModel)) {
    model = preferredModel as ModelId;
  }

  if (savingsRatio < MIN_SAVINGS_FOR_RESTORE) {
    return {
      shouldRestore: false,
      model,
      reason: `Savings ${(savingsRatio * 100).toFixed(1)}% below ${MIN_SAVINGS_FOR_RESTORE * 100}% threshold`,
      route: device.isLowPower ? 'edge' : 'cloud',
    };
  }

  if (device.isLowPower && tier !== 'desktop') {
    return {
      shouldRestore: false,
      model,
      reason: 'Low power device — compress only',
      route: 'edge',
    };
  }

  if ((device.batteryLevel ?? 100) < 20 && tier !== 'desktop') {
    return {
      shouldRestore: false,
      model,
      reason: 'Battery too low for restoration',
      route: 'edge',
    };
  }

  return {
    shouldRestore: true,
    model,
    reason: `Restore with ${model} for tier ${tier}`,
    route: device.isLowPower ? 'edge' : 'cloud',
  };
}