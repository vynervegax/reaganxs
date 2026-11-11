export type Entitlements = {
  tier?: string;
  desktopRealModels?: boolean;
  communityModels?: boolean;
  desktopAccess?: boolean;
  expiresAt?: string | null;
};

const CACHE_KEY = 'reaganxs_entitlements';

export function readCachedEntitlements(): Entitlements | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as Entitlements;
  } catch {
    return null;
  }
}

export function writeCachedEntitlements(ent: Entitlements | null) {
  try {
    if (!ent) {
      localStorage.removeItem(CACHE_KEY);
      return;
    }
    localStorage.setItem(CACHE_KEY, JSON.stringify(ent));
  } catch {
    /* ignore */
  }
}

export async function fetchEntitlements(token: string): Promise<Entitlements> {
  const API_BASE = (
    import.meta.env.VITE_BACKEND_URL ||
    import.meta.env.VITE_API_URL ||
    'http://localhost:3001'
  )
    .trim()
    .replace(/\/$/, '');

  const res = await fetch(`${API_BASE}/api/auth/me`, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    throw new Error(`Entitlements failed (${res.status})`);
  }

  const data = await res.json().catch(() => ({} as any));
  const user = data.user || data;

  const tier = String(user.tier || 'free').toLowerCase();
  const isPremium = tier === 'premium' || tier === 'desktop';

  const ent: Entitlements = {
    tier,
    desktopRealModels: isPremium,
    desktopAccess: Boolean(user.desktopAccess ?? isPremium),
    communityModels: Boolean(user.communityModels ?? isPremium),
    expiresAt: user.tempPremiumExpiresAt || user.expiresAt || null,
  };

  writeCachedEntitlements(ent);
  return ent;
}

export function canUseDesktopModel(
  modelId: string,
  ent: Entitlements | null
): boolean {
  if (!ent?.desktopRealModels) return false;

  // All real models require Premium/Desktop for now
  const premiumModels = [
    'rgt-webphoto',
    'atd-webphoto',
    'rgt-s',
    'atd-srx4',
    '4x-bhi',
  ];

  return premiumModels.includes(modelId);
}