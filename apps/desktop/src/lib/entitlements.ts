/// <reference types="vite/client" />

const BACKEND_URL =
  (import.meta as any).env?.VITE_BACKEND_URL ||
  (import.meta as any).env?.VITE_API_URL ||
  'https://api.reaganxs.com';

export interface Entitlements {
  tier: 'free' | 'premium' | 'desktop';
  allowRealModel: boolean;
  desktopRealModels: boolean;
  features: string[];
}

const CACHE_KEY = 'reaganxs_entitlement';
const CACHE_TTL_MS = 5 * 60 * 1000;

let cache: { data: Entitlements; ts: number } | null = null;

export async function fetchEntitlements(token?: string): Promise<Entitlements> {
  const now = Date.now();
  if (cache && now - cache.ts < CACHE_TTL_MS) {
    return cache.data;
  }

  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as { data: Entitlements; ts: number };
      if (now - parsed.ts < CACHE_TTL_MS) {
        cache = parsed;
        return parsed.data;
      }
    }
  } catch {
    // ignore
  }

  try {
    const headers: HeadersInit = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;

    const res = await fetch(`${BACKEND_URL}/api/entitlement`, {
      credentials: 'include',
      headers,
    });
    if (!res.ok) throw new Error('entitlement fetch failed');
    const data = (await res.json()) as Entitlements;

    // Ensure desktopRealModels is always present
    if (data.desktopRealModels == null) {
      data.desktopRealModels =
        data.allowRealModel || data.tier === 'premium' || data.tier === 'desktop';
    }

    cache = { data, ts: now };
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(cache));
    } catch {
      // ignore
    }
    return data;
  } catch {
    return {
      tier: 'free',
      allowRealModel: false,
      desktopRealModels: false,
      features: [],
    };
  }
}

export function readCachedEntitlements(): Entitlements | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { data: Entitlements; ts: number };
    if (Date.now() - parsed.ts < CACHE_TTL_MS) {
      return parsed.data;
    }
  } catch {
    // ignore
  }
  return null;
}

export function canUseDesktopModel(
  modelId: string,
  ent: Entitlements | null
): boolean {
  if (!ent) return false;
  if (!ent.desktopRealModels && !ent.allowRealModel) return false;
  const real = [
    'rgt-webphoto',
    'atd-webphoto',
    'rgt-s',
    'atd-srx4',
    '4x-bhi',
  ];
  return real.includes(modelId);
}

export function clearEntitlementCache() {
  cache = null;
  try {
    localStorage.removeItem(CACHE_KEY);
  } catch {
    // ignore
  }
}

export const getEntitlement = fetchEntitlements;