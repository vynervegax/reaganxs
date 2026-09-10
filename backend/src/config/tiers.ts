
// backend/src/config/tiers.ts

export type UserTier = 'demo' | 'free' | 'premium' | 'desktop';

export type ModelId = string;

export const TIER_ORDER: Record<UserTier, number> = {
  demo: 0,
  free: 1,
  premium: 2,
  desktop: 3,
};

export type TierOffering = {
  models: string[];
  maxFileSizeMB: number;
  dailyUploads: number;
  expiryHours: number;
  canUseVMAF: boolean;
  label: string;
  desktopAccess?: boolean;
  communityModels?: boolean;
};

export const PROGRESSIVE_OFFERINGS: Record<UserTier, TierOffering> = {
  demo: {
    models: ['rgt-webphoto'],
    maxFileSizeMB: 500,
    dailyUploads: 5,
    expiryHours: 24,
    canUseVMAF: false,
    label: 'Demo',
    desktopAccess: false,
    communityModels: false,
  },
  free: {
    models: ['atd-webphoto'],
    maxFileSizeMB: 5000,
    dailyUploads: 20,
    expiryHours: 72,
    canUseVMAF: false,
    label: 'Free',
    desktopAccess: false,
    communityModels: false,
  },
  premium: {
    models: ['rgt-webphoto', 'atd-webphoto'],
    maxFileSizeMB: 30000,
    dailyUploads: 100,
    expiryHours: 168,
    canUseVMAF: true,
    label: 'Premium',
    desktopAccess: true,
    communityModels: true,
  },
  desktop: {
    models: ['rgt-s', 'atd-srx4'],
    maxFileSizeMB: 100000,
    dailyUploads: Infinity,
    expiryHours: 0,
    canUseVMAF: true,
    label: 'Desktop',
    desktopAccess: true,
    communityModels: true,
  },
};

export function getModelsForTier(tier: UserTier): string[] {
  return PROGRESSIVE_OFFERINGS[tier]?.models ?? PROGRESSIVE_OFFERINGS.demo.models;
}

export function getDefaultModel(tier: UserTier): string {
  return getModelsForTier(tier)[0] || 'rgt-webphoto';
}

export function canAccessModel(tier: UserTier, modelId: string): boolean {
  return getModelsForTier(tier).includes(modelId);
}

export function hasDesktopAccess(tier: UserTier): boolean {
  return Boolean(PROGRESSIVE_OFFERINGS[tier]?.desktopAccess);
}

export function hasCommunityModels(tier: UserTier): boolean {
  return Boolean(PROGRESSIVE_OFFERINGS[tier]?.communityModels);
}