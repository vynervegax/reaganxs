'use client';

import { useEffect, useState } from 'react';
import { tauriApi } from '../lib/tauriApi';
import {
  canUseDesktopModel,
  fetchEntitlements,
  readCachedEntitlements,
  type Entitlements,
} from '../lib/entitlements';

const MODELS = [
  {
    id: 'rgt-webphoto',
    displayName: 'Real Web Photo RGT',
    powerLevel: 'Premium · real inference',
    file: '4xRealWebPhoto_v2_rtg_s.pth',
    real: true,
  },
  {
    id: 'atd-webphoto',
    displayName: 'Real Web Photo ATD',
    powerLevel: 'Premium · real inference',
    file: '4xRealWebPhoto_v3_atd.safetensors',
    real: true,
    isBest: true,
  },
  {
    id: 'rgt-s',
    displayName: 'RGT-S x4',
    powerLevel: 'Premium · real inference',
    file: 'RGT_S_x4.pth',
    real: true,
  },
  {
    id: 'atd-srx4',
    displayName: 'ATD SRx4 Finetune',
    powerLevel: 'Premium · real inference',
    file: '003_ATD_SRx4_finetune.pth',
    real: true,
  },
  {
    id: '4x-bhi',
    displayName: '4x BHI RealPLKSR',
    powerLevel: 'Premium · real inference',
    file: '4xBHI_realplksr_dysample_real.safetensors',
    real: true,
  },
] as const;

export default function ModelSelector({
  defaultModel = 'atd-webphoto',
  onModelChange,
  onEntitlements,
}: {
  defaultModel?: string;
  onModelChange?: (id: string, allowRealModel: boolean) => void;
  onEntitlements?: (ent: Entitlements | null) => void;
}) {
  const [selected, setSelected] = useState(defaultModel);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ent, setEnt] = useState<Entitlements | null>(null);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setChecking(true);
      const cached = readCachedEntitlements();
      if (cached && !cancelled) {
        setEnt(cached);
        onEntitlements?.(cached);
      }
      const token =
        typeof localStorage !== 'undefined'
          ? localStorage.getItem('token')
          : null;
      if (!token) {
        if (!cancelled) {
          setEnt(null);
          onEntitlements?.(null);
          setChecking(false);
        }
        return;
      }
      try {
        const fresh = await fetchEntitlements(token);
        if (!cancelled) {
          setEnt(fresh);
          onEntitlements?.(fresh);
        }
      } catch {
        if (!cancelled && !cached) {
          setEnt(null);
          onEntitlements?.(null);
        }
      } finally {
        if (!cancelled) setChecking(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [onEntitlements]);

  const premium = Boolean(ent?.desktopRealModels);

  const handle = async (id: string) => {
    setError(null);
    setLoading(true);
    setSelected(id);

    const token = localStorage.getItem('token');
    if (!token) {
      setError('Log in with a Premium account to load real restoration models.');
      setLoading(false);
      onModelChange?.(id, false);
      return;
    }

    let current = ent;
    try {
      current = await fetchEntitlements(token);
      setEnt(current);
      onEntitlements?.(current);
    } catch {
      setError('Could not verify Premium. Check network and login.');
      setLoading(false);
      onModelChange?.(id, false);
      return;
    }

    const allow = canUseDesktopModel(id, current);
    if (!allow) {
      setError('Real Web Photo RGT/ATD requires an active Premium plan.');
      setLoading(false);
      onModelChange?.(id, false);
      return;
    }

    try {
      await tauriApi.loadModel(id, true);
      onModelChange?.(id, true);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      setError(msg || 'Failed to load model');
      onModelChange?.(id, false);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="backdrop-blur-2xl bg-white/5 border border-white/10 rounded-3xl p-8 space-y-4">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <h3 className="text-xl font-semibold">Restoration model</h3>
        <div className="flex items-center gap-2">
          <span className="text-xs px-3 py-1 rounded-full bg-gradient-to-r from-[#f97316] to-[#c084fc] text-black font-medium">
            DESKTOP
          </span>
          <span
            className={`text-xs px-3 py-1 rounded-full border ${
              premium
                ? 'border-emerald-500/40 text-emerald-300 bg-emerald-500/10'
                : 'border-amber-500/40 text-amber-200 bg-amber-500/10'
            }`}
          >
            {checking
              ? 'Checking…'
              : premium
                ? 'Premium · real models'
                : 'Compress only'}
          </span>
        </div>
      </div>

      {!premium && (
        <p className="text-xs text-amber-200/90 leading-relaxed">
          Real inference (Real Web Photo RGT/ATD and desktop weights) requires
          Premium. Compression still works without loading a model.
        </p>
      )}

      <div className="grid gap-3">
        {MODELS.map((m) => {
          const locked = m.real && !premium;
          return (
            <button
              key={m.id}
              type="button"
              disabled={loading || checking}
              onClick={() => handle(m.id)}
              className={`p-5 rounded-2xl border text-left flex justify-between items-center transition ${
                selected === m.id && !locked
                  ? 'border-[#f97316] bg-white/10 shadow-lg shadow-[#f97316]/15'
                  : locked
                    ? 'border-white/5 opacity-55'
                    : 'border-white/10 hover:border-white/30'
              }`}
            >
              <div>
                <div className="font-semibold flex items-center gap-2">
                  {m.displayName}
                  {locked && (
                    <span className="text-[10px] uppercase tracking-wide text-amber-200/80">
                      Premium
                    </span>
                  )}
                </div>
                <div className="text-xs text-white/40 mt-1">
                  {m.powerLevel} · {m.file}
                </div>
              </div>
              {m.isBest && !locked && (
                <span className="text-xs bg-[#c084fc] text-black px-2 py-0.5 rounded-full">
                  BEST
                </span>
              )}
            </button>
          );
        })}
      </div>

      {loading && (
        <p className="text-center text-sm text-[#f97316]">Loading model…</p>
      )}
      {error && (
        <p className="text-sm text-red-300 bg-red-500/10 border border-red-500/30 rounded-xl px-3 py-2">
          {error}
        </p>
      )}
    </div>
  );
}