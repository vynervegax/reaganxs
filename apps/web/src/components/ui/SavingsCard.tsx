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
  createdAt?: string | Date | null;
  completedAt?: string | Date | null;
  durationMs?: number | null;
};

function formatBytes(n?: number) {
  if (!n || n <= 0) return '—';
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function formatTimestamp(d?: string | Date | null) {
  if (!d) return '—';
  try {
    const date = new Date(d);
    return date.toLocaleString(undefined, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '—';
  }
}

function SavingsDonut({ percent }: { percent: number }) {
  const size = 160;
  const stroke = 16;
  const r = (size - stroke) / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (percent / 100) * circ;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <linearGradient id="donutGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#f97316" />
            <stop offset="100%" stopColor="#c084fc" />
          </linearGradient>
        </defs>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="#3f3f46"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="url(#donutGrad)"
          strokeWidth={stroke}
          strokeDasharray={circ}
          strokeDashoffset={offset}
          strokeLinecap="round"
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <div
        className="absolute inset-0 flex flex-col items-center justify-center"
        style={{ fontFamily: 'system-ui, sans-serif' }}
      >
        <span style={{ fontSize: 42, fontWeight: 700, color: '#f97316', lineHeight: 1 }}>
          {Math.round(percent)}%
        </span>
        <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>
          saved
        </span>
      </div>
    </div>
  );
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

  // Real job timestamp only — never "now"
  const stamp = job.completedAt || job.createdAt;

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

  const facts = [
    { label: 'COMPRESSION', value: compressLine },
    { label: 'MODEL', value: restored ? label : 'None' },
    { label: 'PROCESSED', value: formatTimestamp(stamp) },
    { label: 'SIZE', value: `${formatBytes(orig)} → ${formatBytes(fin)}` },
    ...(vmaf != null ? [{ label: 'VMAF', value: vmaf.toFixed(1) }] : []),
  ];

  return (
    <div className="space-y-3">
      <div
        ref={cardRef}
        className="rounded-3xl border border-white/10 bg-[#1c140f] text-white"
        style={{
          fontFamily: 'system-ui, sans-serif',
          padding: 28,
          maxWidth: 520,
          margin: '0 auto',
        }}
      >
        {/* Brand */}
        <div style={{ textAlign: 'center', marginBottom: 24 }}>
          <p style={{ fontSize: 32, fontWeight: 700, letterSpacing: -0.5, margin: 0 }}>
            <span style={{ color: '#f97316' }}>Reagan</span>
            <span style={{ color: '#c084fc' }}>XS</span>
          </p>
          <p style={{ fontSize: 15, color: 'rgba(255,255,255,0.5)', marginTop: 6 }}>
            Bandwidth Savings Report
          </p>
        </div>

        {/* Donut */}
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 28 }}>
          <SavingsDonut percent={savings} />
        </div>

        {/* Bars */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ marginBottom: 16 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>
              <span>Original</span>
              <span>{formatBytes(orig)}</span>
            </div>
            <div style={{ height: 14, borderRadius: 999, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${origPct}%`,
                  height: '100%',
                  borderRadius: 999,
                  background: 'linear-gradient(90deg, #a855f7, #c084fc)',
                }}
              />
            </div>
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'rgba(255,255,255,0.5)', marginBottom: 6 }}>
              <span>After ReaganXS</span>
              <span>{formatBytes(fin)}</span>
            </div>
            <div style={{ height: 14, borderRadius: 999, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${finPct}%`,
                  height: '100%',
                  borderRadius: 999,
                  background: 'linear-gradient(90deg, #f97316, #fb923c)',
                }}
              />
            </div>
          </div>
        </div>

        {/* Facts */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {facts.map((item) => (
            <div
              key={item.label}
              style={{
                borderRadius: 12,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                padding: '14px 16px',
              }}
            >
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: 0.5, margin: 0 }}>
                {item.label}
              </p>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.9)', margin: '6px 0 0', lineHeight: 1.35, wordBreak: 'break-word' }}>
                {item.value}
              </p>
            </div>
          ))}
        </div>

        {restored && (
          <p style={{ textAlign: 'center', fontSize: 13, color: '#34d399', marginTop: 20 }}>
            {job.restoreMode === 'partial-frames'
              ? `Partial restore · ${frames.length} frames`
              : 'Restored'}
          </p>
        )}

        {job.restoreMode === 'partial-frames' && frames.length > 0 && (
          <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginTop: 12 }}>
            {frames.slice(0, 3).map((src) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={src}
                src={src}
                alt=""
                style={{ height: 56, width: 'auto', borderRadius: 8, border: '1px solid rgba(255,255,255,0.1)', objectFit: 'cover' }}
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