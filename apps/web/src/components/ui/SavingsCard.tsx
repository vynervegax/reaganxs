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

type ShareOrientation = 'portrait' | 'landscape';

/** 4:5 feed · 16:9 landscape */
const ORIENT = {
  portrait: { width: 1080, height: 1350, label: '4:5' },
  landscape: { width: 1920, height: 1080, label: '16:9' },
} as const;

const FONT =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';
const FONT_MONO =
  'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

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
      return d.toLocaleDateString(undefined, { dateStyle: 'medium' });
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
  const portraitRef = useRef<HTMLDivElement>(null);
  const landscapeRef = useRef<HTMLDivElement>(null);
  const [orientation, setOrientation] = useState<ShareOrientation>('portrait');
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

  const tierLabel = job.tier
    ? String(job.tier).toUpperCase()
    : isLoggedIn
      ? 'ACCOUNT'
      : 'DEMO';

  const restoreModeLabel = job.restoreMode || (restored ? 'full' : 'none');

  const exportRows: { label: string; value: string }[] = [
    { label: 'Compression', value: compressLine || '—' },
    { label: 'Model', value: restored ? label : 'None' },
    { label: 'Restore mode', value: String(restoreModeLabel) },
    {
      label: 'VMAF',
      value: vmaf != null ? vmaf.toFixed(2) : 'Not measured',
    },
    { label: 'Tier', value: tierLabel },
    { label: 'Platform', value: job.platform || 'Web' },
    { label: 'Started', value: formatDate(started) },
    { label: 'Completed', value: formatDate(finished) },
    { label: 'Processing time', value: formatDuration(durationMs) },
    { label: 'Expires', value: expiryLabel(job.expiresAt, isLoggedIn) },
  ];
  if (job.codec) {
    exportRows.push({ label: 'Codec', value: job.codec.toUpperCase() });
  }
  if (job.crf != null) {
    exportRows.push({ label: 'CRF', value: String(job.crf) });
  }
  if (job.preset != null) {
    exportRows.push({ label: 'Preset', value: String(job.preset) });
  }
  if (job.restoreSkippedReason || job.reason) {
    exportRows.push({
      label: 'Restore note',
      value: String(job.restoreSkippedReason || job.reason),
    });
  }

  const shareTitle = `ReaganXS — ${Math.round(savings)}% bandwidth saved`;
  const cardCaption = [
    'ReaganXS Processing Report',
    `Saved ${Math.round(savings)}% · ${formatBytes(orig)} → ${formatBytes(fin)}`,
    restored ? `Model: ${label}` : 'Compression only',
    vmaf != null ? `VMAF ${vmaf.toFixed(1)}` : null,
    `Platform: ${job.platform || 'Web'}`,
  ]
    .filter(Boolean)
    .join('\n');

  const captureCardPng = async (): Promise<File | null> => {
    const el =
      orientation === 'portrait' ? portraitRef.current : landscapeRef.current;
    if (!el) return null;
    const { width } = ORIENT[orientation];
    const { default: html2canvas } = await import('html2canvas');
    const canvas = await html2canvas(el, {
      backgroundColor: '#1c140f',
      scale: 2,
      width,
      windowWidth: width,
      useCORS: true,
      allowTaint: false,
      logging: false,
      foreignObjectRendering: false,
      imageTimeout: 8000,
    });
    const blob: Blob | null = await new Promise((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/png')
    );
    if (!blob) return null;
    const suffix = orientation === 'portrait' ? '4x5' : '16x9';
    return new File([blob], `reaganxs-report-${suffix}-${Date.now()}.png`, {
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

      try {
        if (
          typeof navigator !== 'undefined' &&
          typeof navigator.share === 'function' &&
          navigator.canShare?.({
            files: [file],
            title: shareTitle,
            text: cardCaption,
          })
        ) {
          await navigator.share({
            title: shareTitle,
            text: cardCaption,
            files: [file],
          });
          setShareMsg(`Shared savings card (${ORIENT[orientation].label})`);
          return;
        }
      } catch {
        /* fall through */
      }

      downloadFile(file);
      try {
        await navigator.clipboard.writeText(cardCaption);
      } catch {
        /* ignore */
      }

      if (platform === 'reddit') {
        const redditUrl =
          `https://www.reddit.com/submit?selftext=true` +
          `&title=${encodeURIComponent(shareTitle)}` +
          `&text=${encodeURIComponent(cardCaption)}`;
        window.open(redditUrl, '_blank', 'noopener,noreferrer');
        setShareMsg(
          `Card ${ORIENT[orientation].label} saved · attach the PNG on Reddit`
        );
        return;
      }

      if (platform === 'linkedin') {
        window.open(
          'https://www.linkedin.com/feed/?shareActive=true',
          '_blank',
          'noopener,noreferrer'
        );
        setShareMsg(
          `Card ${ORIENT[orientation].label} saved · caption copied — attach on LinkedIn`
        );
        return;
      }

      if (platform === 'instagram') {
        const mobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        if (mobile) {
          try {
            if (navigator.share) {
              await navigator.share({
                title: shareTitle,
                text: cardCaption,
                files: [file],
              });
              setShareMsg('Shared savings card');
              return;
            }
          } catch {
            /* ignore */
          }
          window.location.href = 'instagram://app';
        } else {
          window.open(
            'https://www.instagram.com/',
            '_blank',
            'noopener,noreferrer'
          );
        }
        setShareMsg(
          `Card ${ORIENT[orientation].label} saved · post the PNG on Instagram`
        );
        return;
      }

      setShareMsg(`Card ${ORIENT[orientation].label} saved · caption copied`);
    } catch (e: any) {
      console.error(e);
      setShareMsg(e?.message || 'Share failed');
    } finally {
      setBusy(false);
    }
  };

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

  /** Shared poster body — used by both orientations */
  const PosterBody = ({
    mode,
  }: {
    mode: ShareOrientation;
  }) => {
    const isPortrait = mode === 'portrait';
    return (
      <>
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: 16,
            marginBottom: isPortrait ? 18 : 14,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 12 }}>
            <span
              style={{
                fontSize: isPortrait ? 26 : 24,
                fontWeight: 800,
                letterSpacing: 3,
                textTransform: 'uppercase',
                color: '#c084fc',
              }}
            >
              ReaganXS
            </span>
            <span
              style={{
                fontSize: isPortrait ? 20 : 18,
                fontWeight: 600,
                color: 'rgba(255,255,255,0.5)',
              }}
            >
              Processing Report
            </span>
          </div>
          <span
            style={{
              padding: '5px 12px',
              borderRadius: 999,
              background: 'rgba(192,132,252,0.18)',
              border: '1px solid rgba(192,132,252,0.4)',
              fontSize: 15,
              fontWeight: 700,
              color: '#e9d5ff',
            }}
          >
            {tierLabel}
          </span>
        </div>

        <div
          style={{
            height: 5,
            borderRadius: 999,
            background: 'linear-gradient(90deg, #f97316, #c084fc)',
            marginBottom: isPortrait ? 24 : 18,
          }}
        />

        <div
          style={{
            display: 'flex',
            flexDirection: isPortrait ? 'column' : 'row',
            alignItems: isPortrait ? 'stretch' : 'center',
            gap: isPortrait ? 20 : 28,
            marginBottom: isPortrait ? 20 : 16,
          }}
        >
          <div
            style={{
              flexShrink: 0,
              textAlign: isPortrait ? 'center' : 'left',
              minWidth: isPortrait ? undefined : 200,
            }}
          >
            <p
              style={{
                margin: 0,
                fontSize: isPortrait ? 100 : 88,
                fontWeight: 900,
                lineHeight: 1,
                letterSpacing: -3,
                color: '#f97316',
              }}
            >
              {Math.round(savings)}%
            </p>
            <p
              style={{
                margin: '6px 0 0',
                fontSize: 16,
                fontWeight: 600,
                letterSpacing: 1.5,
                textTransform: 'uppercase',
                color: '#c084fc',
              }}
            >
              bandwidth saved
            </p>
          </div>

          <div style={{ flex: 1, display: 'flex', gap: 10 }}>
            <div
              style={{
                flex: 1,
                background: '#2a211c',
                borderRadius: 14,
                padding: isPortrait ? '14px 12px' : '12px 14px',
                border: '1px solid rgba(255,255,255,0.1)',
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                  color: 'rgba(255,255,255,0.4)',
                }}
              >
                Original
              </p>
              <p
                style={{
                  margin: '4px 0 0',
                  fontSize: isPortrait ? 24 : 22,
                  fontWeight: 700,
                  color: '#e9d5ff',
                  fontFamily: FONT_MONO,
                }}
              >
                {formatBytes(orig)}
              </p>
            </div>
            <div
              style={{
                flex: 1,
                background: '#2a211c',
                borderRadius: 14,
                padding: isPortrait ? '14px 12px' : '12px 14px',
                border: '1px solid rgba(249,115,22,0.45)',
              }}
            >
              <p
                style={{
                  margin: 0,
                  fontSize: 13,
                  textTransform: 'uppercase',
                  letterSpacing: 1,
                  color: 'rgba(255,255,255,0.4)',
                }}
              >
                After
              </p>
              <p
                style={{
                  margin: '4px 0 0',
                  fontSize: isPortrait ? 24 : 22,
                  fontWeight: 700,
                  color: '#fdba74',
                  fontFamily: FONT_MONO,
                }}
              >
                {formatBytes(fin)}
              </p>
            </div>
          </div>
        </div>

        <div
          style={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: '0 20px',
            background: '#241c18',
            borderRadius: 14,
            padding: isPortrait ? '4px 18px' : '2px 20px',
            border: '1px solid rgba(255,255,255,0.1)',
            flex: isPortrait ? undefined : 1,
          }}
        >
          {exportRows.map((row, i) => (
            <div
              key={row.label}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                gap: 10,
                padding: isPortrait ? '10px 0' : '8px 0',
                borderBottom:
                  i < exportRows.length - 2
                    ? '1px solid rgba(255,255,255,0.07)'
                    : 'none',
                gridColumn:
                  exportRows.length % 2 === 1 && i === exportRows.length - 1
                    ? '1 / -1'
                    : undefined,
              }}
            >
              <span
                style={{
                  fontSize: isPortrait ? 15 : 14,
                  color: 'rgba(255,255,255,0.42)',
                  fontWeight: 500,
                  flexShrink: 0,
                }}
              >
                {row.label}
              </span>
              <span
                style={{
                  fontSize: isPortrait ? 15 : 14,
                  color: '#f0f0f0',
                  fontWeight: 600,
                  textAlign: 'right',
                  wordBreak: 'break-word',
                }}
              >
                {row.value}
              </span>
            </div>
          ))}
        </div>

        {restored && (
          <p
            style={{
              margin: isPortrait ? '14px 0 0' : '10px 0 0',
              textAlign: 'center',
              fontSize: 14,
              fontWeight: 600,
              color: '#6ee7b7',
            }}
          >
            {job.restoreMode === 'partial-frames'
              ? `Partial frame restore · ${frames.length} samples`
              : 'Fully restored'}
          </p>
        )}

        <p
          style={{
            margin: isPortrait ? '12px 0 0' : '8px 0 0',
            textAlign: 'center',
            fontSize: 13,
            letterSpacing: 1,
            color: 'rgba(255,255,255,0.32)',
          }}
        >
          compress first · restore selectively · reaganxs.com
        </p>
      </>
    );
  };

  return (
    <div className="space-y-3">
      {/* Live web card */}
      <div
        className="rounded-3xl border border-white/10 bg-[#1c140f] p-6 text-white"
        style={{ fontFamily: FONT }}
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
          <p className="text-sm text-white/50 mt-1 tracking-wide">
            Processing Report
          </p>
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
          {exportRows.map((row) => (
            <InfoRow key={row.label} label={row.label} value={row.value} />
          ))}
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

      {/* Share orientation */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-white/40 mr-1">Share size</span>
        <button
          type="button"
          onClick={() => setOrientation('portrait')}
          className={`px-3 py-1.5 rounded-xl text-xs border transition ${
            orientation === 'portrait'
              ? 'border-[#c084fc]/50 bg-[#c084fc]/15 text-[#c084fc]'
              : 'border-white/15 bg-white/5 text-white/60 hover:border-white/25'
          }`}
        >
          Vertical 4:5
        </button>
        <button
          type="button"
          onClick={() => setOrientation('landscape')}
          className={`px-3 py-1.5 rounded-xl text-xs border transition ${
            orientation === 'landscape'
              ? 'border-[#c084fc]/50 bg-[#c084fc]/15 text-[#c084fc]'
              : 'border-white/15 bg-white/5 text-white/60 hover:border-white/25'
          }`}
        >
          Horizontal 16:9
        </button>
      </div>

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

      {/* Portrait 4:5 — 1080×1350 */}
      <div
        ref={portraitRef}
        aria-hidden
        style={{
          position: 'fixed',
          left: -10000,
          top: 0,
          width: ORIENT.portrait.width,
          height: ORIENT.portrait.height,
          padding: '36px 40px',
          boxSizing: 'border-box',
          background: '#1c140f',
          color: '#ffffff',
          fontFamily: FONT,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <PosterBody mode="portrait" />
      </div>

      {/* Landscape 16:9 — 1920×1080 */}
      <div
        ref={landscapeRef}
        aria-hidden
        style={{
          position: 'fixed',
          left: -10000,
          top: 0,
          width: ORIENT.landscape.width,
          height: ORIENT.landscape.height,
          padding: '32px 48px',
          boxSizing: 'border-box',
          background: '#1c140f',
          color: '#ffffff',
          fontFamily: FONT,
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <PosterBody mode="landscape" />
      </div>
    </div>
  );
}