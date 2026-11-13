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
  vmafScore?: number | null;
  originalSize?: number;
  finalSize?: number;
  codec?: string;
  previewFrames?: string[];
  crf?: number | string;
  preset?: number | string;
  expiresAt?: string | Date | null;
  tier?: string;
};

function formatBytes(n?: number) {
  if (!n || n <= 0) return '—';
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function expiryShort(expiresAt?: string | Date | null, isLoggedIn?: boolean) {
  if (expiresAt) {
    try {
      const hours = Math.round((new Date(expiresAt).getTime() - Date.now()) / 36e5);
      if (hours > 0 && hours < 96) return `${hours}h`;
    } catch { /* ignore */ }
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
  const savings = Math.min(100, Math.max(0, job.savingsPercent ?? 0));
  const restored = Boolean(job.restored ?? job.didRestore);
  const vmaf =
    typeof job.vmafScore === 'number' && !Number.isNaN(job.vmafScore)
      ? job.vmafScore
      : null;
  const frames = job.previewFrames || [];

  const orig = job.originalSize || 0;
  const fin = job.finalSize || 0;
  const maxSize = Math.max(orig, fin, 1);
  const origPct = (orig / maxSize) * 100;
  const finPct = (fin / maxSize) * 100;

  const compressLine = [
    job.codec ? job.codec.toUpperCase() : 'SVT-AV1',
    job.crf != null ? `CRF ${job.crf}` : 'CRF 28',
    job.preset != null ? `Preset ${job.preset}` : 'Preset 6',
  ].join(' · ');

  const shareText = [
    `ReaganXS · saved ${savings}%`,
    vmaf != null ? `VMAF ${vmaf.toFixed(1)}` : null,
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
      <div
        ref={cardRef}
        className="rounded-3xl border border-white/10 bg-[#1c140f] p-6 text-white"
        style={{ fontFamily: 'system-ui, sans-serif' }}
      >
        {/* Brand — solid colours so html2canvas captures them cleanly */}
        <div className="text-center mb-5">
          <p className="text-3xl font-bold tracking-tight">
            <span style={{ color: '#f97316' }}>Reagan</span>
            <span style={{ color: '#c084fc' }}>XS</span>
          </p>
          <p className="text-sm text-white/50 mt-1">Bandwidth Savings Report</p>
        </div>

        {/* Percentage — large solid number (no conic-gradient) */}
        <div className="flex justify-center mb-6">
          <div
            className="flex flex-col items-center justify-center rounded-full"
            style={{
              width: 140,
              height: 140,
              background: 'linear-gradient(135deg, #f97316 0%, #c084fc 100%)',
              padding: 4,
            }}
          >
            <div
              className="flex flex-col items-center justify-center bg-[#1c140f] rounded-full"
              style={{ width: '100%', height: '100%' }}
            >
              <span className="text-4xl font-bold" style={{ color: '#f97316' }}>
                {Math.round(savings)}%
              </span>
              <span className="text-[11px] text-white/50 mt-0.5">saved</span>
            </div>
          </div>
        </div>

        {/* Size comparison bars (these already export well) */}
        <div className="space-y-3.5 mb-6">
          <div>
            <div className="flex justify-between text-xs text-white/50 mb-1.5">
              <span>Original</span>
              <span>{formatBytes(orig)}</span>
            </div>
            <div className="h-3.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${origPct}%`,
                  background: 'linear-gradient(90deg, #a855f7, #c084fc)',
                }}
              />
            </div>
          </div>
          <div>
            <div className="flex justify-between text-xs text-white/50 mb-1.5">
              <span>After ReaganXS</span>
              <span>{formatBytes(fin)}</span>
            </div>
            <div className="h-3.5 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${finPct}%`,
                  background: 'linear-gradient(90deg, #f97316, #fb923c)',
                }}
              />
            </div>
          </div>
        </div>

        {/* Facts */}
        <div className="grid grid-cols-2 gap-3 text-sm">
          <div className="rounded-xl bg-white/5 border border-white/10 px-3.5 py-3">
            <p className="text-[10px] text-white/40 uppercase tracking-wide">Compression</p>
            <p className="text-white/90 mt-1 text-xs leading-snug break-words">
              {compressLine}
            </p>
          </div>
          <div className="rounded-xl bg-white/5 border border-white/10 px-3.5 py-3">
            <p className="text-[10px] text-white/40 uppercase tracking-wide">Model</p>
            <p className="text-white/90 mt-1 text-xs leading-snug break-words">
              {restored ? label : 'None'}
            </p>
          </div>
          <div className="rounded-xl bg-white/5 border border-white/10 px-3.5 py-3">
            <p className="text-[10px] text-white/40 uppercase tracking-wide">VMAF</p>
            <p className="text-white/90 mt-1">
              {vmaf != null ? vmaf.toFixed(1) : '—'}
            </p>
          </div>
          <div className="rounded-xl bg-white/5 border border-white/10 px-3.5 py-3">
            <p className="text-[10px] text-white/40 uppercase tracking-wide">Expires</p>
            <p className="text-white/90 mt-1">
              {expiryShort(job.expiresAt, isLoggedIn)}
            </p>
          </div>
        </div>

        {restored && (
          <p className="text-center text-xs text-emerald-400 mt-5">
            {job.restoreMode === 'partial-frames'
              ? `Partial restore · ${frames.length} frames`
              : 'Restored'}
          </p>
        )}

        {job.restoreMode === 'partial-frames' && frames.length > 0 && (
          <div className="flex justify-center gap-2 mt-3">
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

      {/* Actions */}
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