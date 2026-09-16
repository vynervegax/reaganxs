'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

type UserInfo = {
  id: string;
  email: string;
  name?: string;
  tier: string;
  tempPremiumExpiresAt?: string;
  premiumPaidAt?: string;
};

const API_BASE = (
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  'http://localhost:4000'
)
  .trim()
  .replace(/\/$/, '');

export default function SettingsPage() {
  const router = useRouter();
  const [user, setUser] = useState<UserInfo | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const token =
    typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const loadUser = async () => {
    if (!token) {
      setLoading(false);
      return;
    }
    try {
      const res = await fetch(`${API_BASE}/api/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to load profile');
      setUser(data.user);
    } catch (e: any) {
      setError(e.message || 'Could not load account');
    } finally {
      setLoading(false);
    }
  };

  // Load profile + handle Stripe return (?session_id=...)
  useEffect(() => {
    const run = async () => {
      const params = new URLSearchParams(window.location.search);
      const sessionId = params.get('session_id');

      if (sessionId && token) {
        setBusy(true);
        try {
          const res = await fetch(`${API_BASE}/api/stripe/confirm`, {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${token}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ sessionId }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.message || 'Payment confirm failed');
          if (data.token) localStorage.setItem('token', data.token);
          setMessage('Payment successful — Premium unlocked (Desktop + Community)');
          window.history.replaceState({}, '', '/settings');
        } catch (e: any) {
          setError(e.message || 'Could not confirm payment');
        } finally {
          setBusy(false);
        }
      }

      await loadUser();
    };
    run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const payPremium = async () => {
    if (!token) {
      router.push('/login');
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`${API_BASE}/api/stripe/create-checkout`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok || !data.url) {
        throw new Error(data.message || 'Could not start checkout');
      }
      window.location.href = data.url;
    } catch (e: any) {
      setError(e.message || 'Checkout failed');
      setBusy(false);
    }
  };

  /** TEMPORARY — remove before production */
  const claimTemp7Days = async () => {
    if (!token) {
      router.push('/login');
      return;
    }
    setBusy(true);
    setError(null);
    setMessage(null);
    try {
      const res = await fetch(`${API_BASE}/api/stripe/claim-temp-premium`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Claim failed');
      if (data.token) localStorage.setItem('token', data.token);
      setMessage(data.message || 'Temp premium activated');
      await loadUser();
    } catch (e: any) {
      setError(e.message || 'Claim failed');
    } finally {
      setBusy(false);
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    router.push('/');
  };

  const isPremium =
    user?.tier === 'premium' || user?.tier === 'desktop';
  const tempActive =
    isPremium &&
    user?.tempPremiumExpiresAt &&
    !user?.premiumPaidAt &&
    new Date(user.tempPremiumExpiresAt).getTime() > Date.now();

  if (loading) {
    return (
      <main className="min-h-screen bg-[#1c140f] text-white flex items-center justify-center">
        <p className="text-white/50">Loading account…</p>
      </main>
    );
  }

  if (!token || !user) {
    return (
      <main className="min-h-screen bg-[#1c140f] text-white p-8">
        <div className="max-w-lg mx-auto rounded-3xl border border-white/10 bg-white/5 p-8 space-y-4">
          <h1 className="text-2xl font-bold">Account Settings</h1>
          <p className="text-white/60">Please log in to manage your plan.</p>
          <Link
            href="/login"
            className="inline-flex px-6 py-3 rounded-2xl font-semibold text-black bg-gradient-to-r from-[#f97316] to-[#c084fc]"
          >
            Log in
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#1c140f] text-white p-8">
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="flex items-center justify-between gap-4">
          <h1 className="text-3xl font-bold bg-gradient-to-r from-[#f97316] to-[#c084fc] bg-clip-text text-transparent">
            Account Settings
          </h1>
          <Link href="/process" className="text-sm text-white/50 hover:text-white">
            ← Process
          </Link>
        </div>

        {/* Profile */}
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 space-y-3">
          <p className="text-xs text-white/40 uppercase tracking-wide">Profile</p>
          <p className="text-lg font-medium">{user.name || '—'}</p>
          <p className="text-white/70">{user.email}</p>
          <p className="text-sm">
            Plan:{' '}
            <span className="font-semibold text-[#c084fc]">{user.tier}</span>
            {tempActive && user.tempPremiumExpiresAt && (
              <span className="text-white/40 text-xs ml-2">
                (temp until{' '}
                {new Date(user.tempPremiumExpiresAt).toLocaleString()})
              </span>
            )}
            {user.premiumPaidAt && (
              <span className="text-emerald-400/80 text-xs ml-2">Paid</span>
            )}
          </p>
        </div>

        {/* Premium */}
        <div className="rounded-3xl border border-white/10 bg-white/5 p-6 space-y-4">
          <h2 className="text-xl font-semibold">Premium — $2.99</h2>
          <p className="text-sm text-white/60 leading-relaxed">
            One payment unlocks the <strong className="text-white">Desktop app</strong> and
            the <strong className="text-white">Community models</strong> page
            (contribute & access custom models).
          </p>

          {isPremium && user.premiumPaidAt ? (
            <div className="space-y-3">
              <p className="text-sm text-emerald-300">Premium active</p>
              <div className="flex flex-wrap gap-3">
                <Link
                  href="/community-models"
                  className="px-5 py-2.5 rounded-2xl bg-white/10 border border-white/15 text-sm"
                >
                  Community models
                </Link>
                <a
                  href="#desktop"
                  className="px-5 py-2.5 rounded-2xl border border-white/15 text-sm text-white/70"
                >
                  Desktop download (link your build)
                </a>
              </div>
            </div>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={payPremium}
              className="px-6 py-3 rounded-2xl font-semibold text-black bg-gradient-to-r from-[#f97316] to-[#c084fc] disabled:opacity-50"
            >
              {busy ? 'Please wait…' : 'Pay $2.99 — Desktop + Community'}
            </button>
          )}

          {/* TEMPORARY testing button — remove before production */}
          {!user.premiumPaidAt && (
            <div className="pt-4 border-t border-white/10 space-y-2">
              <p className="text-xs text-amber-200/80">
                Testing only — free 7-day Premium (once per account)
              </p>
              <button
                type="button"
                disabled={Boolean(busy || tempActive)}
                onClick={claimTemp7Days}
                className="px-5 py-2.5 rounded-2xl border border-amber-500/40 text-amber-100 text-sm hover:bg-amber-500/10 disabled:opacity-40"
              >
                {tempActive
                  ? 'Temp Premium active'
                  : 'Claim 7-day Premium (test)'}
              </button>
            </div>
          )}
        </div>

        {message && (
          <div className="text-sm text-emerald-300 bg-emerald-900/20 border border-emerald-700/40 rounded-2xl p-4">
            {message}
          </div>
        )}
        {error && (
          <div className="text-sm text-red-300 bg-red-900/20 border border-red-700/40 rounded-2xl p-4">
            {error}
          </div>
        )}

        <button
          type="button"
          onClick={logout}
          className="text-sm text-white/40 hover:text-white underline"
        >
          Log out
        </button>
      </div>
    </main>
  );
}
