'use client';

import { useEffect } from 'react';

export default function RegisterSW() {
  useEffect(() => {
    const token = localStorage.getItem('token');
    const tier = localStorage.getItem('tier') || localStorage.getItem('userTier') || 'free';
    const isPremium = !!token && (tier === 'premium' || tier === 'desktop');

    if (!isPremium || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, []);

  return null;
}