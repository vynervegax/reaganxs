import { invoke } from '@tauri-apps/api/core';

const API_BASE = (
  import.meta.env.VITE_API_URL ||
  import.meta.env.VITE_BACKEND_URL ||
  ''
).replace(/\/$/, '');

export type Entitlements = {
  tier: string;
  premiumActive: boolean;
  desktopRealModels: boolean;
  allowedDesktopModels: string[];
  checkedAt?: string;
};

const CACHE_KEY = 'reaganxs_entitlements';
const CACHE_MS = 15 * 60 * 1000; // 15 min

export async function fetchEntitlements(token: string): Promise<Entitlements> {
  const res = await fetch(`${API_BASE}/api/me/entitlements`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.success) {
    throw new Error(data.message || 'Could not verify Premium');
  }
  const ent: Entitlements = {
    tier: data.tier || 'free',
    premiumActive: Boolean(data.premiumActive),
    desktopRealModels: Boolean(data.desktopRealModels),
    allowedDesktopModels: data.allowedDesktopModels || [],
    checkedAt: data.checkedAt,
  };
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify({ ...ent, cachedAt: Date.now() })
    );
  } catch {
    /* ignore */
  }
  return ent;
}

export function readCachedEntitlements(): Entitlements | null {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const o = JSON.parse(raw);
    if (!o.cachedAt || Date.now() - o.cachedAt > CACHE_MS) return null;
    return o as Entitlements;
  } catch {
    return null;
  }
}

export function canUseDesktopModel(
  modelId: string,
  ent: Entitlements | null
): boolean {
  if (!ent?.desktopRealModels) return false;
  return ent.allowedDesktopModels.includes(modelId);
}