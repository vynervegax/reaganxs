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
  completedAt?: string | Date | null;
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
  finishedAt?: string | Date | null;
  processedAt?: string | Date | null;
  completed_at?: string | Date | null;
  created_at?: string | Date | null;
  updated_at?: string | Date | null;
  [key: string]: unknown;
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
    if (Number.isNaN(date.getTime())) return '—';
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

function pickTimestamp(job: Job): string | Date | null | undefined {
  return (
    job.completedAt ||
    job.updatedAt ||
    job.finishedAt ||
    job.processedAt ||
    job.completed_at ||
    job.updated_at ||
    job.createdAt ||
    job.created_at ||
    null
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

  const stamp = pickTimestamp(job);

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
          text: `ReaganXS · saved ${Math.round(savings)}%`,
          url: job.url,
        });
        setShareMsg('Shared');
        return;
      }
      await navigator.clipboard.writeText(
        `ReaganXS · saved ${Math.round(savings)}%\n${job.url || ''}`
      );
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
        imageTimeout: 10000,
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

  const circumference = 2 * Math.PI * 58;
  const dash = (savings / 100) * circumference;

  return (
    <div className="space-y-4">
      <div
        ref={cardRef}
        style={{
          fontFamily: 'system-ui, -apple-system, sans-serif',
          background: '#1c140f',
          color: 'white',
          borderRadius: 28,
          border: '1px solid rgba(255,255,255,0.1)',
          padding: '36px 32px 40px',
          maxWidth: 540,
          margin: '0 auto',
          boxSizing: 'border-box',
        }}
      >
        {/* Title */}
        <div style={{ textAlign: 'center', marginBottom: 8 }}>
          <p style={{ fontSize: 36, fontWeight: 800, letterSpacing: -0.5, margin: 0, lineHeight: 1.1 }}>
            <span style={{ color: '#f97316' }}>Reagan</span>
            <span style={{ color: '#c084fc' }}>XS</span>
          </p>
          <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.5)', marginTop: 8, marginBottom: 0 }}>
            Bandwidth Savings Report
          </p>
        </div>

        {/* Donut */}
        <div style={{ display: 'flex', justifyContent: 'center', margin: '28px 0 32px' }}>
          <svg width={180} height={180} viewBox="0 0 180 180">
            <defs>
              <linearGradient id="donutGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stopColor="#f97316" />
                <stop offset="50%" stopColor="#fb923c" />
                <stop offset="100%" stopColor="#c084fc" />
              </linearGradient>
            </defs>
            <circle
              cx={90}
              cy={90}
              r={58}
              fill="none"
              stroke="#3f3f46"
              strokeWidth={16}
            />
            <circle
              cx={90}
              cy={90}
              r={58}
              fill="none"
              stroke="url(#donutGrad)"
              strokeWidth={16}
              strokeDasharray={`${dash} ${circumference}`}
              strokeLinecap="round"
              transform="rotate(-90 90 90)"
            />
            <text
              x={90}
              y={84}
              textAnchor="middle"
              fill="#f97316"
              fontSize={42}
              fontWeight={800}
              fontFamily="system-ui, sans-serif"
            >
              {Math.round(savings)}%
            </text>
            <text
              x={90}
              y={106}
              textAnchor="middle"
              fill="rgba(255,255,255,0.55)"
              fontSize={13}
              fontFamily="system-ui, sans-serif"
            >
              saved
            </text>
          </svg>
        </div>

        {/* Size bars */}
        <div style={{ marginBottom: 28 }}>
          <div style={{ marginBottom: 18 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'rgba(255,255,255,0.55)', marginBottom: 6 }}>
              <span>Original</span>
              <span>{formatBytes(orig)}</span>
            </div>
            <div style={{ height: 12, borderRadius: 999, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
              <div style={{ width: `${origPct}%`, height: '100%', borderRadius: 999, background: 'linear-gradient(90deg, #a855f7, #c084fc)' }} />
            </div>
          </div>
          <div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: 'rgba(255,255,255,0.55)', marginBottom: 6 }}>
              <span>After ReaganXS</span>
              <span>{formatBytes(fin)}</span>
            </div>
            <div style={{ height: 12, borderRadius: 999, background: 'rgba(255,255,255,0.08)', overflow: 'hidden' }}>
              <div style={{ width: `${finPct}%`, height: '100%', borderRadius: 999, background: 'linear-gradient(90deg, #f97316, #fb923c)' }} />
            </div>
          </div>
        </div>

        {/* Facts */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          {[
            { label: 'COMPRESSION', value: compressLine },
            { label: 'MODEL', value: restored ? label : 'None' },
            { label: 'PROCESSED', value: formatTimestamp(stamp) },
            { label: 'SIZE', value: `${formatBytes(orig)} → ${formatBytes(fin)}` },
            ...(vmaf != null ? [{ label: 'VMAF', value: vmaf.toFixed(1) }] : []),
          ].map((item) => (
            <div
              key={item.label}
              style={{
                borderRadius: 14,
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.1)',
                padding: '14px 16px',
                minHeight: 72,
              }}
            >
              <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: 0.6, margin: 0, fontWeight: 500 }}>
                {item.label}
              </p>
              <p style={{ fontSize: 14, color: 'rgba(255,255,255,0.92)', margin: '6px 0 0', lineHeight: 1.4, wordBreak: 'break-word' }}>
                {item.value}
              </p>
            </div>
          ))}
        </div>

        {restored && (
          <p style={{ textAlign: 'center', fontSize: 13, color: '#34d399', marginTop: 22, marginBottom: 0, fontWeight: 500 }}>
            {job.restoreMode === 'partial-frames'
              ? `Partial restore · ${frames.length} frames`
              : 'Restored'}
          </p>
        )}
      </div>

      {/* Actions */}
      <div className="flex flex-wrap gap-3 justify-center">
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

      {shareMsg && <p className="text-xs text-white/40 text-center">{shareMsg}</p>}
    </div>
  );
}