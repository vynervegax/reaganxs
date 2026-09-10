//landing
'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

export default function LandingPage() {
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [userName, setUserName] = useState('');
  const [userEmail, setUserEmail] = useState('');
  const [tier, setTier] = useState('demo');

  useEffect(() => {
    const token = localStorage.getItem('token');
    let name = localStorage.getItem('userName') || '';
    let email = localStorage.getItem('userEmail') || '';
    const storedTier =
      localStorage.getItem('tier') || localStorage.getItem('userTier') || 'free';

    // Fallback: parse user object if name/email keys missing
    try {
      const raw = localStorage.getItem('user');
      if (raw) {
        const u = JSON.parse(raw);
        if (!name) name = u.name || '';
        if (!email) email = u.email || '';
      }
    } catch {
      /* ignore */
    }

    setIsLoggedIn(!!token);
    setUserName(name);
    setUserEmail(email);
    setTier(token ? storedTier : 'demo');
  }, []);

  const displayName = userName || userEmail || 'there';

  return (
    <div className="min-h-screen bg-[#1c140f] text-white">
      {/* Navigation */}
      <nav className="flex justify-between items-center px-8 py-6 max-w-7xl mx-auto">
        <div className="text-2xl font-bold tracking-tight">
          Reagan<span className="text-[#c084fc]">XS</span>
        </div>

        <div className="flex items-center gap-6">
          {isLoggedIn ? (
            <>
              <Link
                href="/settings"
                className="text-gray-300 hover:text-white transition"
              >
                Account
              </Link>
              <Link
                href="/process"
                className="px-5 py-2.5 bg-gradient-to-r from-[#f97316] to-[#c084fc] text-black rounded-2xl font-medium hover:scale-105 transition"
              >
                Go to Studio
              </Link>
              <button
                type="button"
                onClick={() => {
                  localStorage.clear();
                  window.location.href = '/';
                }}
                className="px-5 py-2.5 bg-white/10 hover:bg-white/20 rounded-2xl font-medium transition text-sm"
              >
                Logout
              </button>
            </>
          ) : (
            <>
              <Link
                href="/login"
                className="text-gray-300 hover:text-white transition"
              >
                Login
              </Link>
              <Link
                href="/register"
                className="px-5 py-2.5 bg-white/10 hover:bg-white/20 rounded-2xl font-medium transition"
              >
                Register
              </Link>
            </>
          )}
        </div>
      </nav>

      {/* Hero */}
      <section className="max-w-5xl mx-auto px-6 pt-20 pb-32 text-center">
        <div className="inline-block px-5 py-2 mb-8 rounded-full bg-white/5 border border-white/10 text-sm">
          {isLoggedIn ? (
            <span className="text-gray-300">
              Welcome back,{' '}
              <span className="text-[#c084fc] font-medium">{displayName}</span>
              {tier !== 'demo' && (
                <span className="text-white/40"> · {tier}</span>
              )}
            </span>
          ) : (
            <span className="text-gray-300">Hybrid Edge-Cloud Video AI</span>
          )}
        </div>

        <h1 className="text-5xl md:text-7xl font-bold tracking-tighter leading-tight mb-6">
          Compress First.
          <br />
          <span className="bg-gradient-to-r from-[#f97316] to-[#c084fc] bg-clip-text text-transparent">
            Restore Intelligently.
          </span>
        </h1>

        <p className="text-xl text-gray-400 max-w-2xl mx-auto mb-12 leading-relaxed">
          Aggressive SVT-AV1 compression + selective AI restoration. Built for
          real-world bandwidth constraints and premium quality when it matters.
        </p>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link href="/process">
            <button
              type="button"
              className="w-full sm:w-auto px-10 py-5 bg-gradient-to-r from-[#f97316] to-[#c084fc] text-black text-lg font-semibold rounded-2xl hover:scale-105 transition shadow-lg shadow-[#f97316]/20"
            >
              {isLoggedIn ? 'Open Studio' : 'Try Demo Free'}
            </button>
          </Link>

          {!isLoggedIn && (
            <Link href="/register">
              <button
                type="button"
                className="w-full sm:w-auto px-10 py-5 bg-white/10 hover:bg-white/15 text-white text-lg font-medium rounded-2xl transition border border-white/10"
              >
                Create Account
              </button>
            </Link>
          )}
        </div>
      </section>

      {/* Feature cards — progressive models */}
      <section className="max-w-6xl mx-auto px-6 pb-32">
        <div className="grid md:grid-cols-3 gap-6">
          <div className="bg-white/5 border border-white/10 rounded-3xl p-8">
            <div className="text-[#f97316] text-sm font-medium mb-3">Demo</div>
            <h3 className="text-2xl font-semibold mb-3">RGT-S 4x</h3>
            <p className="text-gray-400 leading-relaxed">
              Instant processing. No login required. Perfect for quick tests and
              light use.
            </p>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-3xl p-8">
            <div className="text-[#c084fc] text-sm font-medium mb-3">
              Free Account
            </div>
            <h3 className="text-2xl font-semibold mb-3">
              ATD SR x 4 Finetune
            </h3>
            <p className="text-gray-400 leading-relaxed">
              Balanced quality restoration. Ideal for everyday use after signing
              up.
            </p>
          </div>

          <div className="bg-white/5 border border-white/10 rounded-3xl p-8 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-[#c084fc]/10 rounded-full blur-3xl" />
            <div className="text-[#c084fc] text-sm font-medium mb-3">
              Premium · $2.99/mo
            </div>
            <h3 className="text-2xl font-semibold mb-3">Dekstop</h3>
            <p className="text-gray-400 leading-relaxed">
              Better compression & restoration, more allocation & longer link expiry. 
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t border-white/10 py-10">
        <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row justify-between items-center gap-4">
          <div className="text-gray-500 text-sm">
            © 2026 ReaganXS. Use Chrome and VLC for the best experience.
          </div>
          <div className="flex gap-6 text-sm text-gray-400">
            <Link href="/process" className="hover:text-white transition">
              Studio
            </Link>
            <Link href="/settings" className="hover:text-white transition">
              Account
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}