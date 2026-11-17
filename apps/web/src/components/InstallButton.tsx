'use client';

import { useEffect, useState } from 'react';

export default function InstallButton() {
  const [prompt, setPrompt] = useState<any>(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const tier = localStorage.getItem('tier') || localStorage.getItem('userTier') || 'free';
    const isPremium = !!token && (tier === 'premium' || tier === 'desktop');
    if (!isPremium) return;

    setShow(true);
    const handler = (e: Event) => {
      e.preventDefault();
      setPrompt(e);
    };
    window.addEventListener('beforeinstallprompt', handler as any);
    return () => window.removeEventListener('beforeinstallprompt', handler as any);
  }, []);

  if (!show || !prompt) return null;

  return (
    <button
      type="button"
      onClick={() => prompt.prompt()}
      className="px-4 py-2 rounded-xl bg-white/10 border border-white/20 text-sm hover:bg-white/15"
    >
      Install ReaganXS
    </button>
  );
}