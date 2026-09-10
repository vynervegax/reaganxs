'use client';

import { useEffect, useState } from 'react';

const API = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function TempPremiumButton() {
  const [status, setStatus] = useState<{
    canClaim?: boolean;
    tempPremium?: boolean;
    expiresAt?: string | null;
    tier?: string;
  } | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState('');

  const token =
    typeof window !== 'undefined' ? localStorage.getItem('token') : null;

  const refresh = async () => {
    if (!token) return;
    const res = await fetch(`${API}/api/temp-premium/status`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    const data = await res.json();
    if (data.success) {
      setStatus(data);
      if (data.tier) localStorage.setItem('tier', data.tier);
    }
  };

  useEffect(() => {
    refresh().catch(console.error);
  }, [token]);

  const claim = async () => {
    if (!token) {
      window.location.href = '/login';
      return;
    }
    setLoading(true);
    setMsg('');
    try {
      const res = await fetch(`${API}/api/temp-premium/claim`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json();
      setMsg(data.message || '');
      if (data.success && data.tier) {
        localStorage.setItem('tier', data.tier);
        await refresh();
      }
    } catch (e: any) {
      setMsg(e.message || 'Failed');
    } finally {
      setLoading(false);
    }
  };

  if (!token) return null;

  // Hide if real paid or still in temp window without claim needed
  if (status?.tempPremium && status.expiresAt) {
    const days = Math.max(
      0,
      Math.ceil(
        (new Date(status.expiresAt).getTime() - Date.now()) /
          (24 * 60 * 60 * 1000)
      )
    );
    return (
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm">
        <p className="text-amber-200 font-medium">Temp Premium active</p>
        <p className="text-xs text-white/50 mt-1">
          ~{days} day(s) left · testing only
        </p>
      </div>
    );
  }

  if (status && status.canClaim === false) return null;

  return (
    <div className="rounded-2xl border border-dashed border-[#c084fc]/40 bg-white/5 p-4 space-y-2">
      <p className="text-xs text-white/40 uppercase tracking-wide">
        Temporary testing
      </p>
      <button
        type="button"
        onClick={claim}
        disabled={loading}
        className="w-full px-4 py-3 rounded-2xl bg-white/10 hover:bg-white/15 border border-white/15 text-sm font-medium transition disabled:opacity-50"
      >
        {loading ? 'Granting…' : 'Free Premium · 7 days (temp)'}
      </button>
      {msg && <p className="text-xs text-white/50">{msg}</p>}
      <p className="text-[11px] text-white/30">
        Does not replace paid checkout. Will be removed later.
      </p>
    </div>
  );
}