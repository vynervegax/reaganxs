'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000';

export default function RegisterPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, name }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Registration failed');
      }
      localStorage.setItem('token', data.token);
      localStorage.setItem('user', JSON.stringify(data.user));
      localStorage.setItem('tier', data.user.tier || 'free');
      localStorage.setItem('userTier', data.user.tier || 'free');
      router.push('/process');
    } catch (err: any) {
      setError(err.message || 'Registration failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#1c140f] text-white">
      {/* Top bar — matches process / settings */}
      <div className="border-b border-white/10">
        <div className="max-w-5xl mx-auto px-6 py-6 flex justify-between items-center">
          <Link
            href="/"
            className="text-2xl font-bold bg-gradient-to-r from-[#f97316] to-[#c084fc] bg-clip-text text-transparent"
          >
            ReaganXS
          </Link>
          <div className="flex items-center gap-3">
            <Link
              href="/"
              className="px-5 py-2.5 bg-white/5 border border-white/10 hover:border-[#c084fc]/50 rounded-2xl text-sm"
            >
              Home
            </Link>
            <Link
              href="/login"
              className="px-5 py-2.5 bg-gradient-to-r from-[#f97316] to-[#c084fc] text-black rounded-2xl text-sm font-semibold"
            >
              Log in
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-md mx-auto px-6 py-16">
        <div className="text-center mb-10">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-[#f97316] to-[#c084fc] bg-clip-text text-transparent mb-3">
            Create account
          </h1>
          <p className="text-white/50 text-sm">
            Free tier unlocks{' '}
            <span className="text-[#c084fc]">4x Pure Photo PLKSR </span>
          </p>
        </div>

        <form
          onSubmit={onSubmit}
          className="rounded-3xl border border-white/10 bg-white/5 backdrop-blur-xl p-8 space-y-5"
        >
          <div>
            <label className="block text-xs text-white/40 mb-2">Name</label>
            <input
              className="w-full rounded-2xl bg-black/40 border border-white/10 focus:border-[#c084fc]/50 outline-none px-4 py-3 text-white placeholder:text-white/30 transition"
              placeholder="Your name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoComplete="name"
            />
          </div>

          <div>
            <label className="block text-xs text-white/40 mb-2">Email</label>
            <input
              className="w-full rounded-2xl bg-black/40 border border-white/10 focus:border-[#c084fc]/50 outline-none px-4 py-3 text-white placeholder:text-white/30 transition"
              type="email"
              placeholder="you@example.com"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
            />
          </div>

          <div>
            <label className="block text-xs text-white/40 mb-2">Password</label>
            <input
              className="w-full rounded-2xl bg-black/40 border border-white/10 focus:border-[#c084fc]/50 outline-none px-4 py-3 text-white placeholder:text-white/30 transition"
              type="password"
              placeholder="Min 8 characters"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="new-password"
            />
          </div>

          {error && (
            <div className="text-sm text-red-300 bg-red-900/30 border border-red-700/40 rounded-2xl p-4">
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-2xl py-3.5 font-semibold text-black bg-gradient-to-r from-[#f97316] to-[#c084fc] hover:opacity-90 disabled:opacity-60 transition"
          >
            {loading ? 'Creating account…' : 'Create free account'}
          </button>

          <p className="text-sm text-white/40 text-center pt-2">
            Already have an account?{' '}
            <Link href="/login" className="text-[#c084fc] hover:underline">
              Log in
            </Link>
          </p>
        </form>

        <p className="text-center text-xs text-white/25 mt-8">
          Compress first · restore selectively · SVT-AV1 / VP9
        </p>
      </div>
    </div>
  );
}