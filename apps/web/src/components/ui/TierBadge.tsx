// apps/web/src/components/ui/TierBadge.tsx

'use client';

type Props = {
  tier?: string | null;
  className?: string;
};

const LABELS: Record<string, string> = {
  demo: 'Demo',
  free: 'Free',
  premium: 'Premium',
  desktop: 'Desktop',
};

export default function TierBadge({ tier = 'demo', className = '' }: Props) {
  const key = (tier || 'demo').toLowerCase();
  const label = LABELS[key] || key;

  return (
    <span
      className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-gradient-to-r from-[#f97316]/20 to-[#c084fc]/20 text-[#c084fc] border border-[#c084fc]/30 ${className}`}
    >
      {label}
    </span>
  );
}