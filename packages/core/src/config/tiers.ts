// packages/core/src/config/tiers.ts

// backend/src/config/tiers.ts

export type UserTier = 'demo' | 'free' | 'premium' | 'desktop';

/** Only these three restoration models remain. */
export type RestorationModel =
  | 'none'
  | 'bhi'
  | 'real-web-photo-rgt-s'
  | 'dat2';

export interface TierOffering {
  label: string;
  codecs: Array<'vp9' | 'av1'>;
  models: RestorationModel[];
  defaultModel: RestorationModel | null;
  vp9OnSlowOrWeak: boolean;
  maxWidth: number;
  /** Completed result + savings card lifetime (hours). 0 = keep until managed. */
  expiryHours: number;
  /** Intermediate stages (upload, compressed, samples) lifetime. */
  stageExpiryHours: number;
  maxFileSizeMB: number;
  canUseVMAF: boolean;
  enforceSizeGate: true;
}

export const PROGRESSIVE_OFFERINGS: Record<UserTier, TierOffering> = {
  demo: {
    label: 'Demo',
    codecs: ['vp9'],
    models: [],
    defaultModel: null,
    vp9OnSlowOrWeak: true,
    maxWidth: 960,
    expiryHours: 24,
    stageExpiryHours: 9,
    maxFileSizeMB: 100,
    canUseVMAF: false,
    enforceSizeGate: true,
  },
  free: {
    label: 'Free',
    codecs: ['av1', 'vp9'],
    models: ['real-web-photo-rgt-s'],
    defaultModel: 'real-web-photo-rgt-s',
    vp9OnSlowOrWeak: true,
    maxWidth: 1280,
    expiryHours: 72,
    stageExpiryHours: 9,
    maxFileSizeMB: 500,
    canUseVMAF: false,
    enforceSizeGate: true,
  },
  premium: {
    label: 'Premium',
    codecs: ['av1', 'vp9'],
    models: ['bhi', 'real-web-photo-rgt-s'],
    defaultModel: 'bhi',
    vp9OnSlowOrWeak: true,
    maxWidth: 1920,
    expiryHours: 168,
    stageExpiryHours: 9,
    maxFileSizeMB: 2000,
    canUseVMAF: true,
    enforceSizeGate: true,
  },
  desktop: {
    label: 'Desktop',
    codecs: ['av1', 'vp9'],
    models: ['bhi', 'real-web-photo-rgt-s', 'dat2'],
    defaultModel: 'dat2',
    vp9OnSlowOrWeak: true,
    maxWidth: 3840,
    expiryHours: 0,
    stageExpiryHours: 9,
    maxFileSizeMB: 8000,
    canUseVMAF: true,
    enforceSizeGate: true,
  },
};

export function codecForTier(
  tier: UserTier,
  opts: { forceVp9?: boolean; slowOrWeak?: boolean }
): 'vp9' | 'av1' {
  const o = PROGRESSIVE_OFFERINGS[tier];
  if (!o.codecs.includes('av1')) return 'vp9';
  if (opts.forceVp9 || (o.vp9OnSlowOrWeak && opts.slowOrWeak)) return 'vp9';
  return 'av1';
}

export function modelAllowed(
  tier: UserTier,
  model: string | null | undefined
): boolean {
  if (!model || model === 'none') return true;
  return PROGRESSIVE_OFFERINGS[tier].models.includes(model as RestorationModel);
}

/** Alias used by routingService. */
export function canAccessModel(tier: UserTier, model: string | null | undefined): boolean {
  return modelAllowed(tier, model);
}

export function getDefaultModel(tier: UserTier): RestorationModel | null {
  return PROGRESSIVE_OFFERINGS[tier]?.defaultModel ?? null;
}

export function hasDesktopAccess(tier: UserTier): boolean {
  return tier === 'desktop';
}