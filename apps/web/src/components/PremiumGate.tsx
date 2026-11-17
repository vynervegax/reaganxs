'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function PremiumGate({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [allowed, setAllowed] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const tier = localStorage.getItem('tier') || localStorage.getItem('userTier') || 'free';
    const isPremium = !!token && (tier === 'premium' || tier === 'desktop');

    if (!token) {
      router.replace('/login');
      return;
    }
    if (!isPremium) {
      router.replace('/pricing');
      return;
    }
    setAllowed(true);
    setReady(true);
  }, [router]);

  if (!ready || !allowed) return null;
  return <>{children}</>;
}