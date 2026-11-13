// package/ui/src/components/SavingsCard.tsx
import React, { useRef, useState } from 'react';

interface SavingsCardProps {
  bandwidthSavedPercent: number;
  vmaf?: number | null;
  modelName: string;
  codec?: string;
  originalSizeMb: number;
  finalSizeMb: number;
}

type ShareFormat = 'png' | 'jpeg';

export default function SavingsCard({
  bandwidthSavedPercent,
  vmaf,
  modelName,
  codec = 'libsvtav1',
  originalSizeMb,
  finalSizeMb,
}: SavingsCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [sharing, setSharing] = useState(false);

  const formatMb = (mb: number) => `${mb.toFixed(1)} MB`;

  const captureCard = async (format: ShareFormat): Promise<File | null> => {
    if (!cardRef.current) return null;

    const html2canvas = (await import('html2canvas')).default;
    const canvas = await html2canvas(cardRef.current, {
      backgroundColor: null,
      scale: 2,
      useCORS: true,
    });

    const mime = format === 'png' ? 'image/png' : 'image/jpeg';
    const quality = format === 'jpeg' ? 0.92 : undefined;

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, mime, quality)
    );

    if (!blob) return null;

    const ext = format === 'png' ? 'png' : 'jpg';
    return new File([blob], `reaganxs-results.${ext}`, { type: mime });
  };

  const shareOrDownload = async (format: ShareFormat) => {
    setSharing(true);
    setMenuOpen(false);

    try {
      const file = await captureCard(format);
      if (!file) throw new Error('Could not create image');

      const shareData = {
        files: [file],
        title: 'ReaganXS Results',
        text: `Saved ${bandwidthSavedPercent}% bandwidth with ReaganXS`,
      };

      if (navigator.canShare?.(shareData)) {
        await navigator.share(shareData);
      } else {
        // Fallback: download so user can upload manually to IG / LinkedIn
        const url = URL.createObjectURL(file);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        a.click();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      console.error('Share failed', err);
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="w-full max-w-sm mx-auto relative">
      {/* Shareable card */}
      <div
        ref={cardRef}
        className="bg-[#1a1614] rounded-2xl p-5 text-white shadow-xl border border-white/10"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-700 to-amber-900 flex items-center justify-center border border-amber-500/40">
              <span className="text-amber-200 font-bold text-lg tracking-tight">RS</span>
            </div>
            <div>
              <div className="text-xl font-bold bg-gradient-to-r from-orange-500 to-purple-500 bg-clip-text text-transparent">
                ReaganXS
              </div>
              <div className="text-xs text-gray-400 -mt-0.5">Results</div>
            </div>
          </div>
          <span className="text-xs text-gray-500">Account</span>
        </div>

        {/* Main metrics */}
        <div className="flex items-end justify-between mb-5">
          <div>
            <div className="text-sm text-gray-400 mb-1">Bandwidth saved</div>
            <div className="text-5xl font-bold text-orange-500 leading-none">
              {bandwidthSavedPercent}%
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm text-gray-400 mb-1">VMAF</div>
            <div className="text-lg font-medium">
              {vmaf != null ? vmaf.toFixed(1) : 'Not measured'}
            </div>
          </div>
        </div>

        <div className="h-px bg-white/10 my-4" />

        {/* Model */}
        <div className="mb-4">
          <div className="text-sm text-gray-400 mb-1">Model</div>
          <div className="text-lg font-semibold">{modelName}</div>
          <div className="text-xs text-gray-500 mt-0.5">{codec}</div>
        </div>

        <div className="h-px bg-white/10 my-4" />

        {/* Size */}
        <div className="text-lg font-semibold tracking-wide">
          {formatMb(originalSizeMb)} → {formatMb(finalSizeMb)}
        </div>
      </div>

      {/* Share button + menu */}
      <div className="mt-4 relative">
        <button
          onClick={() => setMenuOpen((v) => !v)}
          disabled={sharing}
          className="w-full py-3 px-4 rounded-xl bg-white/10 hover:bg-white/15 active:bg-white/20 border border-white/10 text-sm font-medium transition-colors disabled:opacity-60 flex items-center justify-center gap-2"
        >
          {sharing ? 'Preparing…' : 'Share Results'}
          <svg
            className={`w-4 h-4 transition-transform ${menuOpen ? 'rotate-180' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </button>

        {menuOpen && (
          <div className="absolute bottom-full left-0 right-0 mb-2 bg-[#2a2420] border border-white/10 rounded-xl overflow-hidden shadow-lg z-10">
            <button
              onClick={() => shareOrDownload('png')}
              className="w-full px-4 py-3 text-left text-sm hover:bg-white/10 flex items-center justify-between"
            >
              <span>Share as PNG</span>
              <span className="text-xs text-gray-400">Best quality</span>
            </button>
            <div className="h-px bg-white/10" />
            <button
              onClick={() => shareOrDownload('jpeg')}
              className="w-full px-4 py-3 text-left text-sm hover:bg-white/10 flex items-center justify-between"
            >
              <span>Share as JPEG</span>
              <span className="text-xs text-gray-400">Smaller file</span>
            </button>
            <div className="h-px bg-white/10" />
            <div className="px-4 py-2 text-xs text-gray-500">
              Opens share sheet (Instagram, LinkedIn, etc.) or downloads the image
            </div>
          </div>
        )}
      </div>
    </div>
  );
}