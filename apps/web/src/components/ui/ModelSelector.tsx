// apps/web/src/components/ui/ModelSelector.tsx

'use client';

import Link from 'next/link';
import {
  MODEL_LABELS,
  TIER_MODELS,
  type UserTier,
  hasDesktopAccess,
  hasCommunityModels,
} from '@/lib/clientRouter';

type Props = {
  tier?: UserTier;
  selectedModel?: string;
  onChange?: (modelId: string) => void;
  isLoggedIn?: boolean;
};

const META: Record<
  string,
  { blurb: string; badge?: string }
> = {
  'rgt-s': {
    blurb: 'Demo / balanced 4× restore',
    badge: 'Demo',
  },
  'atd-srx4': {
    blurb: 'Highest web quality · ATD SRx4 Finetune',
    badge: 'Logged-in',
  },
};

export default function ModelSelector({
  tier = 'demo',
  selectedModel,
  onChange,
  isLoggedIn = false,
}: Props) {
  const models = TIER_MODELS[tier] || TIER_MODELS.demo;
  const active = selectedModel || models[0];

  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-6 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-lg font-semibold text-white">Restoration model</h3>
        <span className="text-xs px-3 py-1 rounded-full bg-white/10 text-white/70">
          {tier}
        </span>
      </div>

      <div className="grid gap-3">
        {models.map((id) => {
          const selected = active === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => onChange?.(id)}
              className={`text-left p-4 rounded-2xl border transition ${
                selected
                  ? 'border-[#f97316] bg-white/10 shadow-lg shadow-[#f97316]/15'
                  : 'border-white/10 hover:border-white/25'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-white">
                  {MODEL_LABELS[id] || id}
                </span>
                {META[id]?.badge && (
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#c084fc]/20 text-[#c084fc]">
                    {META[id].badge}
                  </span>
                )}
              </div>
              <p className="text-xs text-white/45 mt-1">{META[id]?.blurb}</p>
            </button>
          );
        })}
      </div>

      {!isLoggedIn && (
        <p className="text-xs text-white/40">
          Sign in for ATD SRx4 Finetune on web.{' '}
          <Link href="/register" className="text-[#c084fc] underline">
            Create account
          </Link>
        </p>
      )}

      {isLoggedIn && !hasDesktopAccess(tier) && (
        <div className="rounded-2xl border border-[#f97316]/30 bg-[#f97316]/10 p-4 space-y-2">
          <p className="text-sm text-white font-medium">Want maximum quality?</p>
          <p className="text-xs text-white/60">
            Premium unlocks the Desktop app (local GPU) and community models.
          </p>
          <Link
            href="/settings"
            className="inline-flex text-sm font-semibold text-black px-4 py-2 rounded-xl bg-gradient-to-r from-[#f97316] to-[#c084fc]"
          >
            Upgrade to Premium
          </Link>
        </div>
      )}

      {hasCommunityModels(tier) && (
        <Link
          href="/community-models"
          className="block text-center text-sm text-[#c084fc] underline"
        >
          Community models (premium)
        </Link>
      )}
    </div>
  );
}