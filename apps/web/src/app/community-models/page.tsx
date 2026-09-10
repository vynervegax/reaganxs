'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type User = {
  tier?: string;
  email?: string;
  name?: string;
};

export default function CommunityModelsPage() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const token =
      typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    if (!token) {
      setLoading(false);
      return;
    }
    const API =
      (process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000').replace(
        /\/$/,
        ''
      );
    fetch(`${API}/api/auth/me`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((d) => {
        if (d?.user) setUser(d.user);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  const tier = (user?.tier || 'demo') as string;
  const allowed = tier === 'premium' || tier === 'desktop';

  if (loading) {
    return (
      <main className="min-h-screen bg-[#1c140f] text-white flex items-center justify-center">
        <p className="text-white/50">Loading…</p>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#1c140f] text-white p-8">
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-[#f97316] to-[#c084fc] bg-clip-text text-transparent">
            Community models
          </h1>
          <Link href="/process" className="text-sm text-white/50 hover:text-white">
            ← Process
          </Link>
        </div>

        {!user && (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-8 space-y-4">
            <p className="text-white/70">
              Sign in with a Premium account to access community-hosted models.
            </p>
            <Link
              href="/login"
              className="inline-flex px-6 py-3 rounded-2xl font-semibold text-black bg-gradient-to-r from-[#f97316] to-[#c084fc]"
            >
              Log in
            </Link>
          </div>
        )}

        {user && !allowed && (
          <div className="rounded-3xl border border-[#f97316]/30 bg-[#f97316]/10 p-8 space-y-4">
            <p className="text-lg font-medium">Premium required</p>
            <p className="text-sm text-white/60">
              Community models are for Premium members. Premium also unlocks the
              Desktop app for local GPU processing.
            </p>
            <Link
              href="/settings"
              className="inline-flex px-6 py-3 rounded-2xl font-semibold text-black bg-gradient-to-r from-[#f97316] to-[#c084fc]"
            >
              Upgrade in Settings
            </Link>
          </div>
        )}

        {user && allowed && (
          <div className="rounded-3xl border border-white/10 bg-white/5 p-8 space-y-4">
            <p className="text-sm text-[#c084fc] font-medium">Premium access</p>
            <h2 className="text-xl font-semibold">Coming soon</h2>
            <p className="text-white/60 text-sm leading-relaxed">
              Paying community members will be able to publish custom restore
              models here. The smart router will optionally route Premium and
              Desktop jobs to curated community hosts — without breaking
              compress-first or the size gate.
            </p>
            <ul className="text-sm text-white/45 list-disc pl-5 space-y-1">
              <li>Curated hosts only (not open marketplace yet)</li>
              <li>Your cloud remains the fallback</li>
              <li>Desktop still prefers local weights</li>
            </ul>
            <div className="pt-4 flex flex-wrap gap-3">
              <Link
                href="/process"
                className="px-5 py-2.5 rounded-2xl bg-white/10 border border-white/15 text-sm"
              >
                Back to processing
              </Link>
              <Link
                href="/settings"
                className="px-5 py-2.5 rounded-2xl border border-white/15 text-sm text-white/70"
              >
                Account settings
              </Link>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}