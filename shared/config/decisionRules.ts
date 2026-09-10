import type { UserTier } from './tiers';
import { getDefaultModel, getModelsForTier } from './tiers';

export function decideRestore(opts: {
  tier: UserTier;
  savingsRatio: number;
  isLowPower?: boolean;
  batteryLevel?: number;
  preferredModel?: string;
}) {
  const allowed = getModelsForTier(opts.tier);
  let model = getDefaultModel(opts.tier);
  if (opts.preferredModel && allowed.includes(opts.preferredModel)) {
    model = opts.preferredModel;
  }

  if (opts.savingsRatio < 0.15) {
    return {
      shouldRestore: false,
      model,
      reason: 'Savings below 15% threshold',
    };
  }

  if (opts.isLowPower && opts.tier !== 'desktop') {
    return { shouldRestore: false, model, reason: 'Low power — compress only' };
  }

  return {
    shouldRestore: true,
    model,
    reason: `Restore with ${model}`,
  };
}