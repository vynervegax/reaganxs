import { useRef, useState } from 'react';

const LABELS: Record<string, string> = {
  '4x-bhi': '4x BHI RealPLKSR',
  '4x-purephoto': '4x PurePhoto RealPLSKR',
  'rgt-s': 'RGT-S x4',
  'atd-srx4': 'ATD SRx4 Finetune',
  'compression-only': 'Compression only',
};

type Result = {
  output_path?: string;
  url?: string;
  savings_percent?: number;
  savingsPercent?: number;
  model_used?: string;
  modelUsed?: string;
  restored?: boolean;
  restore_mode?: string;
  restoreMode?: string;
  vmaf_score?: number | null;
  vmafScore?: number | null;
  original_size?: number;
  final_size?: number;
  codec?: string;
  restore_skipped_reason?: string;
  preview_frames?: string[];
  previewFrames?: string[];
  preview_clip_url?: string | null;
  previewClipUrl?: string | null;
};

function formatBytes(n?: number) {
  if (!n || n <= 0) return '—';
  if (n < 1024 ** 2) return `${(n / 1024).toFixed(1)} KB`;
  if (n < 1024 ** 3) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  return `${(n / 1024 ** 3).toFixed(2)} GB`;
}

export default function SavingsCard({ result }: { result: Result | null }) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  if (!result) return null;

  const savings = result.savings_percent ?? result.savingsPercent ?? 0;
  const model = result.model_used || result.modelUsed || 'compression-only';
  const label = LABELS[model] || model;
  const path = result.output_path || result.url || '';
  const vmafRaw = result.vmaf_score ?? result.vmafScore;
  const vmaf =
    typeof vmafRaw === 'number' && !Number.isNaN(vmafRaw) ? vmafRaw : null;
  const restoreMode = result.restore_mode || result.restoreMode || 'none';
  const frames = result.preview_frames || result.previewFrames || [];
  const previewClip =
    result.preview_clip_url || result.previewClipUrl || null;

  const onDownloadCardImage = async (format: 'png' | 'jpeg' = 'png') => {
    const el = cardRef.current;
    if (!el) return;
    setBusy(true);
    setMsg('');
    try {
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
      setMsg(`Card saved as ${format.toUpperCase()}`);
    } catch (e: any) {
      setMsg(e?.message || 'Export failed');
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
        <h3 className="text-lg font-semibold bg-gradient-to-r from-[#f97316] to-[#c084fc] bg-clip-text text-transparent">
          ReaganXS Results
        </h3>

        <div className="grid grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-white/40 mb-1">Savings</p>
            <p className="text-3xl font-bold text-[#f97316]">{savings}%</p>
          </div>
          <div>
            <p className="text-xs text-white/40 mb-1">VMAF</p>
            {vmaf != null ? (
              <p className="text-3xl font-bold text-[#c084fc]">
                {vmaf.toFixed(2)}
              </p>
            ) : (
              <p className="text-sm text-white/40 pt-2">—</p>
            )}
          </div>
          <div>
            <p className="text-xs text-white/40 mb-1">Model</p>
            <p className="font-medium text-sm">{label}</p>
          </div>
        </div>

        {(result.original_size || result.final_size) && (
          <p className="text-xs text-white/45">
            {formatBytes(result.original_size)} →{' '}
            {formatBytes(result.final_size)}
          </p>
        )}

        {result.restored === false && result.restore_skipped_reason && (
          <p className="text-xs text-amber-200/80">
            {result.restore_skipped_reason}
          </p>
        )}

        {restoreMode === 'partial-frames' && frames.length > 0 && (
          <div className="flex gap-2 overflow-x-auto">
            {frames.map((src) => (
              <img
                key={src}
                src={src}
                alt="frame"
                className="h-24 rounded-xl border border-white/15"
                crossOrigin="anonymous"
              />
            ))}
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        {path && (
          <a
            href={path.startsWith('http') ? path : undefined}
            onClick={(e) => {
              if (!path.startsWith('http')) {
                e.preventDefault();
                // Tauri: open(path) via tauriApi if you prefer
              }
            }}
            className="px-5 py-2.5 rounded-2xl bg-gradient-to-r from-[#f97316] to-[#c084fc] text-black text-sm font-semibold"
          >
            Open / download video
          </a>
        )}
        <button
          type="button"
          disabled={busy}
          onClick={() => onDownloadCardImage('png')}
          className="px-5 py-2.5 rounded-2xl border border-white/15 bg-white/5 text-sm text-white"
        >
          Download card PNG
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => onDownloadCardImage('jpeg')}
          className="px-5 py-2.5 rounded-2xl border border-white/15 bg-white/5 text-sm text-white"
        >
          Download card JPG
        </button>
      </div>
      {previewClip && (
        <a
          href={previewClip}
          target="_blank"
          rel="noreferrer"
          className="text-sm text-[#c084fc] underline"
        >
          Quality sample clip
        </a>
      )}
      {msg && <p className="text-xs text-white/40">{msg}</p>}
    </div>
  );
}