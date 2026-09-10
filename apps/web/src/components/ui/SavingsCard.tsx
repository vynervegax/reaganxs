'use client';

import { useRef, useState } from 'react';
import { MODEL_LABELS } from '@/lib/clientRouter';

type Job = {
  url?: string;
  savingsPercent?: number;
  modelUsed?: string;
  restored?: boolean;
  didRestore?: boolean;
  restoreMode?: 'none' | 'full' | 'partial-frames' | string;
  restoreSkippedReason?: string | null;
  reason?: string;
  vmafScore?: number | null;
  originalSize?: number;
  finalSize?: number;
  codec?: string;
  stages?: string[];
  isDemo?: boolean;
  previewFrames?: string[];
  previewClipUrl?: string | null;
};

function formatBytes(n?: number) {
  if (!n || n <= 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export default function SavingsCard({
  job,
  isLoggedIn,
}: {
  job: Job | null | undefined;
  isLoggedIn?: boolean;
}) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [shareMsg, setShareMsg] = useState('');
  const [busy, setBusy] = useState(false);

  if (!job) return null;

  const model = job.modelUsed || 'compression-only';
  const label = MODEL_LABELS[model] || model;
  const savings = job.savingsPercent ?? 0;
  const restored = Boolean(job.restored ?? job.didRestore);
  const vmaf =
    typeof job.vmafScore === 'number' && !Number.isNaN(job.vmafScore)
      ? job.vmafScore
      : null;
  const frames = job.previewFrames || [];

  const shareText = [
    `ReaganXS · saved ${savings}%`,
    vmaf != null ? `VMAF ${vmaf.toFixed(2)}` : null,
    `Model: ${label}`,
    job.restoreMode ? `Restore: ${job.restoreMode}` : null,
    job.url ? `Download: ${job.url}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const onDownloadVideo = () => {
    if (!job.url) return;
    const a = document.createElement('a');
    a.href = job.url;
    a.download = '';
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.click();
  };

  const onShare = async () => {
    setShareMsg('');
    try {
      if (navigator.share) {
        await navigator.share({
          title: 'ReaganXS result',
          text: shareText,
          url: job.url,
        });
        setShareMsg('Shared');
        return;
      }
      await navigator.clipboard.writeText(shareText);
      setShareMsg('Copied to clipboard');
    } catch {
      setShareMsg('Share cancelled');
    }
  };

  /** Export card as PNG (JPEG if you prefer type 'image/jpeg') */
  const onDownloadCardImage = async (format: 'png' | 'jpeg' = 'png') => {
    const el = cardRef.current;
    if (!el) return;
    setBusy(true);
    setShareMsg('');
    try {
      // Dynamic import keeps bundle light
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(el, {
        backgroundColor: '#1c140f',
        scale: 2,
        useCORS: true,
        logging: false,
      });
      const mime = format === 'jpeg' ? 'image/jpeg' : 'image/png';
      const dataUrl = canvas.toDataURL(mime, format === 'jpeg' ? 0.92 : undefined);
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = `reaganxs-savings-${Date.now()}.${format === 'jpeg' ? 'jpg' : 'png'}`;
      a.click();
      setShareMsg(`Card saved as ${format.toUpperCase()}`);
    } catch (e: any) {
      console.error(e);
      setShareMsg(e?.message || 'Could not export card image');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      <div
        ref={cardRef}
        className="rounded-3xl border border-white/10 bg-[#1c140f] p-6 space-y-5 text-white"
      >
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-lg font-semibold bg-gradient-to-r from-[#f97316] to-[#c084fc] bg-clip-text text-transparent">
            ReaganXS Results
          </h3>
          <span className="text-xs text-white/40">
            {isLoggedIn ? 'Account' : 'Demo'}
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-white/40 mb-1">Bandwidth saved</p>
            <p className="text-3xl font-bold text-[#f97316]">{savings}%</p>
          </div>
          <div>
            <p className="text-xs text-white/40 mb-1">VMAF</p>
            {vmaf != null ? (
              <p className="text-3xl font-bold text-[#c084fc]">
                {vmaf.toFixed(2)}
              </p>
            ) : (
              <p className="text-sm text-white/40 pt-2">
                {isLoggedIn ? 'Not measured' : 'Premium metric'}
              </p>
            )}
          </div>
          <div className="col-span-2 sm:col-span-1">
            <p className="text-xs text-white/40 mb-1">Model</p>
            <p className="font-medium text-sm text-white">{label}</p>
            {job.codec && (
              <p className="text-[11px] text-white/35 mt-1">{job.codec}</p>
            )}
          </div>
        </div>

        {(job.originalSize || job.finalSize) && (
          <p className="text-xs text-white/45">
            {formatBytes(job.originalSize)} → {formatBytes(job.finalSize)}
          </p>
        )}

        {restored ? (
          <p className="text-xs text-emerald-300 border-t border-white/10 pt-3">
            {job.restoreMode === 'partial-frames'
              ? `Partial frame restore · ${frames.length} samples`
              : `Restored with ${label}`}
            {vmaf != null ? ` · VMAF ${vmaf.toFixed(2)}` : ''}
          </p>
        ) : (
          <p className="text-xs text-amber-200/80 border-t border-white/10 pt-3">
            Compression only
            {job.restoreSkippedReason || job.reason
              ? ` — ${job.restoreSkippedReason || job.reason}`
              : ''}
          </p>
        )}

        {job.restoreMode === 'partial-frames' && frames.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {frames.map((src) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={src}
                src={src}
                alt="Restored frame"
                className="h-24 w-auto rounded-xl border border-white/15 object-cover"
                crossOrigin="anonymous"
              />
            ))}
          </div>
        )}

        {job.previewClipUrl && (
          <a
            href={job.previewClipUrl}
            target="_blank"
            rel="noreferrer"
            className="inline-block text-sm text-[#c084fc] underline"
          >
            Open quality sample clip
          </a>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        {job.url && (
          <button
            type="button"
            onClick={onDownloadVideo}
            className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-[#f97316] to-[#c084fc] text-black text-sm font-semibold"
          >
            Download video
          </button>
        )}
        <button
          type="button"
          onClick={onShare}
          className="px-5 py-2.5 rounded-2xl border border-white/15 bg-white/5 hover:bg-white/10 text-sm font-medium text-white"
        >
          Share result
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onDownloadCardImage('png')}
          className="px-5 py-2.5 rounded-2xl border border-white/15 bg-white/5 hover:bg-white/10 text-sm font-medium text-white disabled:opacity-50"
        >
          {busy ? 'Exporting…' : 'Download card PNG'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onDownloadCardImage('jpeg')}
          className="px-5 py-2.5 rounded-2xl border border-white/15 bg-white/5 hover:bg-white/10 text-sm font-medium text-white disabled:opacity-50"
        >
          Download card JPG
        </button>
      </div>

      {shareMsg && <p className="text-xs text-white/40">{shareMsg}</p>}
    </div>
  );
}