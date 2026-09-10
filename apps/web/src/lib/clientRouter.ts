export type UserTier = 'demo' | 'free' | 'premium' | 'desktop';

export const MODEL_LABELS: Record<string, string> = {
  'rgt-webphoto': 'Real Web Photo RGT',
  'atd-webphoto': 'Real Web Photo ATD',
  'rgt-s': 'RGT-S x4',
  'atd-srx4': 'ATD SRx4 Finetune',
  'compression-only': 'Compression only',
};

export const TIER_MODELS: Record<UserTier, string[]> = {
  demo: ['rgt-webphoto'],
  free: ['atd-webphoto'],
  premium: ['rgt-webphoto', 'atd-webphoto'],
  desktop: ['rgt-s', 'atd-srx4'],
};

export function getDefaultModel(tier: UserTier = 'demo'): string {
  return TIER_MODELS[tier]?.[0] || 'rgt-webphoto';
}

export function canUseModel(tier: UserTier, modelId: string): boolean {
  return (TIER_MODELS[tier] || TIER_MODELS.demo).includes(modelId);
}

export function hasDesktopAccess(tier: UserTier): boolean {
  return tier === 'premium' || tier === 'desktop';
}

export function hasCommunityModels(tier: UserTier): boolean {
  return tier === 'premium' || tier === 'desktop';
}

export function getModelLabel(modelId?: string): string {
  if (!modelId) return MODEL_LABELS['compression-only'];
  return MODEL_LABELS[modelId] || modelId;
}