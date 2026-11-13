// package/ui/src/components/SavingsCard.tsx
import React, { useRef, useState } from 'react';

interface SavingsCardProps {
  bandwidthSavedPercent: number;
  vmaf?: number | null;
  modelName: string;
  codec?: string;
  originalSizeMb: number;
  finalSizeMb: number;
  restoredWith?: string; // e.g. "Real Web Photo ATD"
}

type ShareFormat = 'png' | 'jpeg';

export default function SavingsCard({
  bandwidthSavedPercent,
  vmaf,
  modelName,
  codec = 'libsvtav1',
  originalSizeMb,
  finalSizeMb,
  restoredWith,
}: SavingsCardProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [sharing, setSharing] = useState(false);

  const formatMb = (mb: number) => `${mb.toFixed(1)} MB`;

  const captureCard = async (format: ShareFormat): Promise<File | null> => {
    if (!cardRef.current) return null;

    const html2canvas = (await import('html2canvas')).default;
    const canvas = await html2canvas(cardRef.current, {
      backgroundColor: '#1a1614',
      scale: 2,
      useCORS: true,
      logging: false,
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

  const downloadCard = async (format: ShareFormat) => {
    setSharing(true);
    try {
      const file = await captureCard(format);
      if (!file) return;

      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Download card failed', err);
    } finally {
      setSharing(false);
    }
  };

  const shareCard = async () => {
    setSharing(true);
    try {
      const file = await captureCard('png');
      if (!file) return;

      const shareData = {
        files: [file],
        title: 'ReaganXS Results',
        text: `Saved ${bandwidthSavedPercent}% bandwidth with ReaganXS`,
      };

      if (navigator.canShare?.(shareData)) {
        await navigator.share(shareData);
      } else {
        await downloadCard('png');
      }
    } catch (err) {
      console.error('Share failed', err);
    } finally {
      setSharing(false);
    }
  };

  return (
    <div className="w-full">
      {/* Shareable card — wide horizontal layout matching summary */}
      <div
        ref={cardRef}
        className="bg-[#1a1614] rounded-2xl p-6 text-white border border-white/10"
      >
        {/* Header row */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-amber-800 to-amber-950 flex items-center justify-center border border-amber-600/40">
              <span className="text-amber-200 font-bold text-sm tracking-tight">RS</span>
            </div>
            <div className="w-24 h-6 rounded bg-gradient-to-r from-orange-500 to-purple-500" />
            <div className="text-xs text-gray-400">Results</div>
          </div>
          <span className="text-xs text-gray-500">Account</span>
        </div>

        {/* Metrics row */}
        <div className="grid grid-cols-3 gap-6 mb-4">
          <div>
            <div className="text-sm text-gray-400 mb-1">Bandwidth saved</div>
            <div className="text-4xl font-bold text-orange-500 leading-none">
              {bandwidthSavedPercent}%
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-400 mb-1">VMAF</div>
            <div className="text-lg font-medium text-gray-300">
              {vmaf != null ? vmaf.toFixed(1) : 'Not measured'}
            </div>
          </div>
          <div>
            <div className="text-sm text-gray-400 mb-1">Model</div>
            <div className="text-lg font-semibold">{modelName}</div>
            <div className="text-xs text-gray-500 mt-0.5">{codec}</div>
          </div>
        </div>

        {/* Size */}
        <div className="text-sm text-gray-300 mb-4">
          {formatMb(originalSizeMb)} → {formatMb(finalSizeMb)}
        </div>

        <div className="h-px bg-white/10 mb-3" />

        {/* Restoration line */}
        {restoredWith && (
          <div className="text-sm text-emerald-400 font-medium">
            Restored with {restoredWith}
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="mt-4 flex flex-wrap gap-2">
        <button
          onClick={shareCard}
          disabled={sharing}
          className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-sm font-medium transition-colors disabled:opacity-60"
        >
          {sharing ? 'Preparing…' : 'Share result'}
        </button>
        <button
          onClick={() => downloadCard('png')}
          disabled={sharing}
          className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-sm font-medium transition-colors disabled:opacity-60"
        >
          Download card PNG
        </button>
        <button
          onClick={() => downloadCard('jpeg')}
          disabled={sharing}
          className="px-4 py-2.5 rounded-xl bg-white/10 hover:bg-white/15 border border-white/10 text-sm font-medium transition-colors disabled:opacity-60"
        >
          Download card JPG
        </button>
      </div>
    </div>
  );
}