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
  crf?: number | string;
  preset?: number | string;
  expiresAt?: string | Date | null;
  tier?: string;
};

function formatBytes(n?: number) {
  if (!n || n <= 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function expiryShort(expiresAt?: string | Date | null, isLoggedIn?: boolean) {
  if (expiresAt) {
    try {
      const hours = Math.round((new Date(expiresAt).getTime() - Date.now()) / 36e5);
      if (hours > 0 && hours < 96) return `${hours}h`;
    } catch {
      /* ignore */
    }
  }
  return isLoggedIn ? '48h' : '6h';
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

  const compressBits = [
    job.codec ? job.codec.toUpperCase() : 'SVT-AV1',
    job.crf != null ? `CRF ${job.crf}` : 'CRF 28',
    job.preset != null ? `P${job.preset}` : 'P6',
  ].join(' · ');

  const shareText = [
    `ReaganXS · saved ${savings}%`,
    vmaf != null ? `VMAF ${vmaf.toFixed(2)}` : null,
    `Model: ${label}`,
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

  const onDownloadCardImage = async (format: 'png' | 'jpeg' = 'png') => {
    const el = cardRef.current;
    if (!el) return;
    setBusy(true);
    setShareMsg('');
    try {
      const { default: html2canvas } = await import('html2canvas');
      const canvas = await html2canvas(el, {
        backgroundColor: '#1c140f',
        scale: 2,
        useCORS: true,
        allowTaint: false,
        logging: false,
        imageTimeout: 8000,
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
      {/* Compact captured card */}
      <div
        ref={cardRef}
        className="rounded-2xl border border-white/10 bg-[#1c140f] p-5 space-y-4 text-white"
      >
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo.png"
              alt=""
              width={28}
              height={28}
              className="h-7 w-7 rounded-md object-contain"
              crossOrigin="anonymous"
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
              }}
            />
            <div>
              <p className="text-sm font-semibold leading-none">
                <span className="bg-gradient-to-r from-[#f97316] to-[#c084fc] bg-clip-text text-transparent">
                  ReaganXS
                </span>
              </p>
              <p className="text-[10px] text-white/40 mt-0.5">Results</p>
            </div>
          </div>
          <span className="text-[11px] text-white/40">
            {isLoggedIn ? 'Account' : 'Demo'}
          </span>
        </div>

        {/* Compact metrics row */}
        <div className="grid grid-cols-3 gap-3">
          <div>
            <p className="text-[10px] text-white/40">Saved</p>
            <p className="text-2xl font-bold text-[#f97316] leading-tight">{savings}%</p>
          </div>
          <div>
            <p className="text-[10px] text-white/40">VMAF</p>
            <p className="text-sm text-white/80 pt-1">
              {vmaf != null ? vmaf.toFixed(1) : '—'}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-white/40">Model</p>
            <p className="text-xs font-medium truncate">{label}</p>
          </div>
        </div>

        {(job.originalSize || job.finalSize) && (
          <p className="text-[11px] text-white/45 -mt-1">
            {formatBytes(job.originalSize)} → {formatBytes(job.finalSize)}
          </p>
        )}

        {/* Compact pipeline summary (one line per step) */}
        <div className="rounded-xl bg-white/5 border border-white/10 px-3.5 py-3 space-y-1.5 text-[12px]">
          <div className="flex justify-between gap-3">
            <span className="text-white/70">Compression</span>
            <span className="text-white/45 text-right">{compressBits}</span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-white/70">Restore</span>
            <span className="text-white/45 text-right truncate max-w-[180px]">
              {restored ? label : 'None'}
            </span>
          </div>
          <div className="flex justify-between gap-3">
            <span className="text-white/70">R2 expiry</span>
            <span className="text-white/45">{expiryShort(job.expiresAt, isLoggedIn)}</span>
          </div>
        </div>

        {restored && (
          <p className="text-[11px] text-emerald-300">
            {job.restoreMode === 'partial-frames'
              ? `Partial · ${frames.length} samples`
              : `Restored`}
          </p>
        )}

        {job.restoreMode === 'partial-frames' && frames.length > 0 && (
          <div className="flex gap-1.5 overflow-x-auto">
            {frames.slice(0, 3).map((src) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={src}
                src={src}
                alt=""
                className="h-14 w-auto rounded-lg border border-white/10 object-cover"
                crossOrigin="anonymous"
              />
            ))}
          </div>
        )}
      </div>

      {/* Actions (not captured) */}
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
          className="px-5 py-2.5 rounded-2xl border border-white/15 bg-white/5 hover:bg-white/10 text-sm font-medium"
        >
          Share result
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onDownloadCardImage('png')}
          className="px-5 py-2.5 rounded-2xl border border-white/15 bg-white/5 hover:bg-white/10 text-sm font-medium disabled:opacity-50"
        >
          {busy ? 'Exporting…' : 'Download card PNG'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onDownloadCardImage('jpeg')}
          className="px-5 py-2.5 rounded-2xl border border-white/15 bg-white/5 hover:bg-white/10 text-sm font-medium disabled:opacity-50"
        >
          Download card JPG
        </button>
      </div>

      {shareMsg && <p className="text-xs text-white/40">{shareMsg}</p>}
    </div>
  );
}