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
  createdAt?: string | Date | null;
  completedAt?: string | Date | null;
  startedAt?: string | Date | null;
  finishedAt?: string | Date | null;
  processingTimeMs?: number;
  durationMs?: number;
  platform?: string;
};

function formatBytes(n?: number) {
  if (!n || n <= 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(2)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

function formatDate(d?: string | Date | null) {
  if (!d) return '—';
  try {
    return new Date(d).toLocaleString(undefined, {
      dateStyle: 'medium',
      timeStyle: 'short',
    });
  } catch {
    return '—';
  }
}

function formatDuration(ms?: number) {
  if (!ms || ms <= 0) return '—';
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return rem ? `${m}m ${rem}s` : `${m}m`;
}

function expiryLabel(expiresAt?: string | Date | null, isLoggedIn?: boolean) {
  if (expiresAt) {
    try {
      const d = new Date(expiresAt);
      const hours = Math.round((d.getTime() - Date.now()) / 36e5);
      if (hours > 0 && hours < 120) return `${hours} hours left`;
      return d.toLocaleDateString();
    } catch {
      /* fall through */
    }
  }
  return isLoggedIn ? 'Per plan' : 'Demo window';
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

  const started = job.createdAt || job.startedAt || null;
  const finished = job.completedAt || job.finishedAt || null;
  let durationMs = job.processingTimeMs || job.durationMs || undefined;
  if (!durationMs && started && finished) {
    const a = new Date(started).getTime();
    const b = new Date(finished).getTime();
    if (Number.isFinite(a) && Number.isFinite(b) && b > a) durationMs = b - a;
  }

  const compressLine = [
    job.codec ? job.codec.toUpperCase() : 'SVT-AV1 / VP9',
    job.crf != null ? `CRF ${job.crf}` : null,
    job.preset != null ? `Preset ${job.preset}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  /** Caption for the CARD report (not the video) */
  const cardCaption = [
    'ReaganXS Processing Report',
    `Saved ${Math.round(savings)}% · ${formatBytes(orig)} → ${formatBytes(fin)}`,
    restored ? `Model: ${label}` : 'Compression only',
    vmaf != null ? `VMAF ${vmaf.toFixed(1)}` : null,
    job.platform ? `Platform: ${job.platform}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  const shareTitle = `ReaganXS — ${Math.round(savings)}% bandwidth saved`;

  const captureCardPng = async (): Promise<File | null> => {
    const el = cardRef.current;
    if (!el) return null;
    const { default: html2canvas } = await import('html2canvas');
    const canvas = await html2canvas(el, {
  backgroundColor: '#1c140f',
  scale: 3,              // was 2 — sharper export
  useCORS: true,
  allowTaint: false,
  logging: false,
  imageTimeout: 8000,
  foreignObjectRendering: false, // often more reliable than true
});
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/png')
    );
    if (!blob) return null;
    return new File([blob], `reaganxs-savings-${Date.now()}.png`, {
      type: 'image/png',
    });
  };

  const downloadFile = (file: File) => {
    const url = URL.createObjectURL(file);
    const a = document.createElement('a');
    a.href = url;
    a.download = file.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  /**
   * Share the savings CARD image + caption.
   * Does not share the processed video as the primary asset.
   */
  const shareCardTo = async (
    platform: 'reddit' | 'linkedin' | 'instagram' | 'native'
  ) => {
    setShareMsg('');
    setBusy(true);
    try {
      const file = await captureCardPng();
      if (!file) {
        setShareMsg('Could not capture savings card');
        return;
      }

      // Mobile / supporting browsers: share the card PNG itself
      if (
        typeof navigator !== 'undefined' &&
        navigator.share &&
        navigator.canShare?.({ files: [file] })
      ) {
        await navigator.share({
          title: shareTitle,
          text: cardCaption,
          files: [file],
        });
        setShareMsg('Shared savings card');
        return;
      }

      // Desktop fallback: download card image + copy caption + open network
      downloadFile(file);
      try {
        await navigator.clipboard.writeText(cardCaption);
      } catch {
        /* ignore */
      }

      if (platform === 'reddit') {
        window.open(
          'https://www.reddit.com/submit?selftext=true',
          '_blank',
          'noopener,noreferrer'
        );
        setShareMsg(
          'Card image saved · caption copied — attach the PNG on Reddit'
        );
      } else if (platform === 'linkedin') {
        window.open(
          'https://www.linkedin.com/feed/',
          '_blank',
          'noopener,noreferrer'
        );
        setShareMsg(
          'Card image saved · caption copied — attach the PNG on LinkedIn'
        );
      } else if (platform === 'instagram') {
        const mobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        if (mobile) {
          window.location.href = 'instagram://app';
        } else {
          window.open(
            'https://www.instagram.com/',
            '_blank',
            'noopener,noreferrer'
          );
        }
        setShareMsg(
          'Card image saved · caption copied — post the PNG to Instagram'
        );
      } else {
        setShareMsg('Card image saved · caption copied');
      }
    } catch {
      setShareMsg('Share cancelled');
    } finally {
      setBusy(false);
    }
  };

  /** Processed media only — separate from card share */
  const onDownloadVideo = () => {
    if (!job.url) return;
    const a = document.createElement('a');
    a.href = job.url;
    a.download = '';
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    a.click();
  };

  const InfoRow = ({
    label,
    value,
  }: {
    label: string;
    value: React.ReactNode;
  }) => (
    <div className="flex justify-between gap-4 py-1.5 border-b border-white/5 last:border-0">
      <span className="text-white/45 text-xs shrink-0">{label}</span>
      <span className="text-white/90 text-xs text-right break-words max-w-[65%]">
        {value}
      </span>
    </div>
  );

  return (
    <div className="space-y-3">
      {/* Exportable report only — buttons stay outside */}
      <div
        ref={cardRef}
        className="rounded-3xl border border-white/10 bg-[#1c140f] p-6 text-white"
        style={{ fontFamily: 'system-ui, sans-serif' }}
      >
        <div className="text-center mb-6">
          <p
            className="text-3xl font-bold tracking-tight"
            style={{
              background: 'linear-gradient(90deg, #f97316, #c084fc)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            ReaganXS
          </p>
          <p className="text-sm text-white/50 mt-1">Processing Report</p>
        </div>

        <div className="flex justify-center mb-6">
          <div
            className="relative flex items-center justify-center"
            style={{
              width: 148,
              height: 148,
              borderRadius: '50%',
              background: `conic-gradient(from 200deg, #f97316 0deg, #fb923c ${savings * 1.6}deg, #c084fc ${savings * 3.6}deg, #3f3f46 ${savings * 3.6}deg)`,
            }}
          >
            <div
              className="flex flex-col items-center justify-center bg-[#1c140f]"
              style={{ width: 114, height: 114, borderRadius: '50%' }}
            >
              <span
                className="text-4xl font-bold leading-none"
                style={{
                  background: 'linear-gradient(90deg, #f97316, #c084fc)',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent',
                  backgroundClip: 'text',
                }}
              >
                {Math.round(savings)}%
              </span>
              <span className="text-[11px] text-white/50 mt-1">saved</span>
            </div>
          </div>
        </div>

        <div className="mb-6">
          <div className="flex justify-between text-xs text-white/40 mb-2">
            <span>Original</span>
            <span>After ReaganXS</span>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex-1">
              <div className="h-2.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${origPct}%`,
                    background: 'linear-gradient(90deg, #a855f7, #c084fc)',
                  }}
                />
              </div>
              <p className="text-xs text-white/70 mt-1 text-center">
                {formatBytes(orig)}
              </p>
            </div>
            <span className="text-white/30 text-xs">→</span>
            <div className="flex-1">
              <div className="h-2.5 rounded-full bg-white/10 overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{
                    width: `${finPct}%`,
                    background: 'linear-gradient(90deg, #f97316, #fb923c)',
                  }}
                />
              </div>
              <p className="text-xs text-white/70 mt-1 text-center">
                {formatBytes(fin)}
              </p>
            </div>
          </div>
        </div>

        <div className="rounded-2xl bg-white/[0.03] border border-white/10 px-4 py-2 mb-4">
          <InfoRow label="Compression" value={compressLine || '—'} />
          <InfoRow label="Model" value={restored ? label : 'None'} />
          <InfoRow
            label="Restore mode"
            value={job.restoreMode || (restored ? 'full' : 'none')}
          />
          <InfoRow
            label="VMAF"
            value={vmaf != null ? vmaf.toFixed(2) : 'Not measured'}
          />
          <InfoRow
            label="Tier"
            value={
              job.tier
                ? String(job.tier).toUpperCase()
                : isLoggedIn
                  ? 'ACCOUNT'
                  : 'DEMO'
            }
          />
          <InfoRow label="Platform" value={job.platform || 'Web'} />
          <InfoRow label="Started" value={formatDate(started)} />
          <InfoRow label="Completed" value={formatDate(finished)} />
          <InfoRow label="Processing time" value={formatDuration(durationMs)} />
          <InfoRow
            label="Expires"
            value={expiryLabel(job.expiresAt, isLoggedIn)}
          />
          {job.codec && (
            <InfoRow label="Codec" value={job.codec.toUpperCase()} />
          )}
          {job.restoreSkippedReason && (
            <InfoRow label="Restore note" value={job.restoreSkippedReason} />
          )}
        </div>

        {restored && (
          <p className="text-center text-xs text-emerald-400 mb-3">
            {job.restoreMode === 'partial-frames'
              ? `Partial frame restore · ${frames.length} samples`
              : 'Fully restored'}
          </p>
        )}

        {job.restoreMode === 'partial-frames' && frames.length > 0 && (
          <div className="flex justify-center gap-2 mt-2">
            {frames.slice(0, 4).map((src) => (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                key={src}
                src={src}
                alt=""
                className="h-16 w-auto rounded-lg border border-white/10 object-cover"
                crossOrigin="anonymous"
              />
            ))}
          </div>
        )}
      </div>

      {/* Actions — outside cardRef so they are not in the shared image */}
      <div className="flex flex-wrap gap-2.5">
        {job.url && (
          <button
            type="button"
            onClick={onDownloadVideo}
            className="px-4 py-2.5 rounded-2xl bg-gradient-to-r from-[#f97316] to-[#c084fc] text-black text-sm font-semibold"
          >
            Download video
          </button>
        )}

        <button
          type="button"
          disabled={busy}
          onClick={() => shareCardTo('reddit')}
          className="px-4 py-2.5 rounded-2xl border border-white/15 bg-white/5 hover:bg-white/10 text-sm font-medium disabled:opacity-50"
        >
          {busy ? '…' : 'Reddit'}
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={() => shareCardTo('linkedin')}
          className="px-4 py-2.5 rounded-2xl border border-white/15 bg-white/5 hover:bg-white/10 text-sm font-medium disabled:opacity-50"
        >
          LinkedIn
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={() => shareCardTo('instagram')}
          className="px-4 py-2.5 rounded-2xl border border-white/15 bg-white/5 hover:bg-white/10 text-sm font-medium disabled:opacity-50"
        >
          Instagram
        </button>

        <button
          type="button"
          disabled={busy}
          onClick={() => shareCardTo('native')}
          className="px-4 py-2.5 rounded-2xl border border-white/15 bg-white/5 hover:bg-white/10 text-sm font-medium disabled:opacity-50"
        >
          Share report
        </button>
      </div>

      {shareMsg && <p className="text-xs text-white/40">{shareMsg}</p>}
    </div>
  );
}