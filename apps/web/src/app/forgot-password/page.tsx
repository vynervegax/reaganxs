'use client';

import { useState } from 'react';

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await fetch(`${process.env.NEXT_PUBLIC_BACKEND_URL}/api/auth/forgot-password`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();
      if (data.success) {
        setSent(true);
      } else {
        alert(data.message);
      }
    } catch (err) {
      alert('Failed to send reset email');
    } finally {
      setLoading(false);
    }
  };

  if (sent) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="max-w-md text-center p-8">
          <h2 className="text-3xl font-bold mb-4">Check Your Email</h2>
          <p className="text-gray-400">If an account exists with that email, we’ve sent password reset instructions.</p>
          <a href="/login" className="text-[#00ff9f] mt-8 inline-block">← Back to Login</a>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-black">
      <div className="w-full max-w-md p-8">
        <h2 className="text-3xl font-bold text-center mb-8">Forgot Password</h2>
        <p className="text-gray-400 text-center mb-8">Enter your email and we’ll send you a reset link.</p>

        <form onSubmit={handleSubmit}>
          <input
            type="email"
            placeholder="Your Email Address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full p-4 bg-zinc-900 rounded-xl border border-gray-700 focus:border-[#00ff9f] mb-6"
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-[#00ff9f] text-black py-4 rounded-xl font-medium disabled:opacity-50"
          >
            {loading ? 'Sending...' : 'Send Reset Link'}
          </button>
        </form>

        <div className="text-center mt-6">
          <a href="/login" className="text-[#00ff9f]">← Back to Login</a>
        </div>
      </div>
    </div>
  );
}