'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const data = await api.login(email, password);

      localStorage.setItem('token', data.token);
      localStorage.setItem('tier', data.user?.tier || 'free');
      localStorage.setItem('userTier', data.user?.tier || 'free');
      localStorage.setItem('userEmail', data.user?.email || email);
      localStorage.setItem('userName', data.user?.name || '');

      router.push('/process');
    } catch (err: any) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#1c140f] text-white flex items-center justify-center p-6">
      <div className="w-full max-w-md">
        <div className="mb-8">
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-gray-400 hover:text-white transition text-sm"
          >
            ← Back to Home
          </Link>
        </div>

        <h1 className="text-4xl font-bold mb-2 text-center">Welcome Back</h1>
        <p className="text-gray-400 text-center mb-10">Login to ReaganXS</p>

        <form onSubmit={handleLogin} className="space-y-6">
          {error && (
            <div className="bg-red-900/50 border border-red-600 text-red-400 p-4 rounded-xl text-sm">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm text-gray-400 mb-2">Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white outline-none focus:border-[#c084fc] transition"
              placeholder="you@example.com"
            />
          </div>

          <div>
            <label className="block text-sm text-gray-400 mb-2">Password</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              className="w-full bg-white/5 border border-white/10 rounded-2xl px-5 py-4 text-white outline-none focus:border-[#c084fc] transition"
              placeholder="••••••••"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-4 bg-gradient-to-r from-[#f97316] to-[#c084fc] text-black rounded-2xl font-semibold text-lg disabled:opacity-70 hover:scale-[1.02] transition"
          >
            {loading ? 'Logging in...' : 'Login'}
          </button>
        </form>

        <p className="text-center text-gray-400 mt-8">
          Don&apos;t have an account?{' '}
          <Link href="/register" className="text-[#c084fc] hover:underline">
            Register
          </Link>
        </p>

        <p className="text-center mt-4">
          <Link
            href="/forgot-password"
            className="text-sm text-gray-500 hover:text-white transition"
          >
            Forgot password?
          </Link>
        </p>
      </div>
    </div>
  );
}