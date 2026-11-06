'use client';

import { useEffect, useState } from 'react';

const TICKS = [
  'Download before your plan’s storage window ends.',
  'History → Resume if you leave this page.',
  'Register free · longer links & higher limits.',
  'Demo 24h · Free 72h · Premium 168h storage.',
  'Free: 5 GB · 20/day · 72h downloads.',
  'Premium: 30 GB · 100/day · 7-day downloads.',
  'Desktop ~50% faster on big files.',
] as const;

const INTERVAL_MS = 7000;

type Props = {
  className?: string;
};

export default function ProcessingTicker({ className = '' }: Props) {
  const [index, setIndex] = useState(0);
  const [fade, setFade] = useState(true);

  useEffect(() => {
    const id = setInterval(() => {
      setFade(false);
      window.setTimeout(() => {
        setIndex((i) => (i + 1) % TICKS.length);
        setFade(true);
      }, 200);
    }, INTERVAL_MS);
    return () => clearInterval(id);
  }, []);

  return (
    <div
      className={`rounded-2xl border border-white/10 bg-white/5 px-4 py-3 overflow-hidden ${className}`}
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3 min-h-[1.25rem]">
        <span className="shrink-0 text-[10px] uppercase tracking-wider text-[#c084fc]/80 font-semibold">
          Tip
        </span>
        <p
          className={`text-sm text-white/70 transition-opacity duration-200 ${
            fade ? 'opacity-100' : 'opacity-0'
          }`}
        >
          {TICKS[index]}
        </p>
      </div>
      <div className="mt-2 flex gap-1">
        {TICKS.map((_, i) => (
          <span
            key={i}
            className={`h-0.5 flex-1 rounded-full transition-colors ${
              i === index ? 'bg-[#c084fc]/70' : 'bg-white/10'
            }`}
          />
        ))}
      </div>
    </div>
  );
}