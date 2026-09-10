'use client';

import { useCallback, useRef, useState } from 'react';
import { resilientFetch } from '@/lib/resilientFetch';

export type ProcessJobResult = {
  url: string;
  savingsPercent?: number;
  modelUsed?: string;
  didRestore?: boolean;
  restored?: boolean;
  shouldRestore?: boolean;
  restoreSkippedReason?: string | null;
  reason?: string;
  originalSize?: number;
  finalSize?: number;
  compressedSize?: number;
  codec?: string;
  tier?: string;
  isDemo?: boolean;
  vmafScore?: number | null;
  expiryHours?: number;
  stages?: string[];
};

type Props = {
  onUploadComplete: (job: ProcessJobResult) => void;
  deviceProfile?: any;
  isLoggedIn?: boolean;
  tier?: string;
  selectedModel?: string;
};

const API_BASE = (
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  'http://localhost:4000'
)
  .trim()
  .replace(/\/$/, '')
  .replace(/\s+/g, '');

export default function UploadZone({
  onUploadComplete,
  deviceProfile,
  isLoggedIn = false,
  tier = 'demo',
  selectedModel,
}: Props) {
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [status, setStatus] = useState('');
  const abortRef = useRef<AbortController | null>(null);

  const upload = useCallback(
    async (file: File) => {
      setError(null);
      setUploading(true);
      setProgress(10);
      setStatus('Preparing…');

      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      try {
        const form = new FormData();
        form.append('video', file);
        if (deviceProfile) {
          form.append('deviceProfile', JSON.stringify(deviceProfile));
        }
        if (selectedModel) {
          form.append('model', selectedModel);
        }

        const token =
          typeof window !== 'undefined' ? localStorage.getItem('token') : null;

        const headers: HeadersInit = {};
        if (token) {
          headers.Authorization = `Bearer ${token}`;
        }

        setProgress(25);
        setStatus('Uploading…');

        const res = await resilientFetch(`${API_BASE}/api/process`, {
          method: 'POST',
          headers,
          body: form,
          signal: ac.signal,
          retries: 6,
          baseDelayMs: 1500,
          maxDelayMs: 15000,
          onRetry: ({ attempt, retriesLeft, waitingForOnline }) => {
            setProgress((p) => Math.min(70, p + 5));
            setStatus(
              waitingForOnline
                ? 'Network offline — waiting to reconnect…'
                : `Connection issue — retry ${attempt} (${retriesLeft} left)…`
            );
          },
        });

        setProgress(85);
        setStatus('Finishing…');

        const data = await res.json().catch(() => ({} as any));

        if (!res.ok || data.success === false) {
          throw new Error(
            data.message || `Upload failed (${res.status} ${res.statusText})`
          );
        }

        setProgress(100);
        setStatus('Done');

        const restored = Boolean(data.restored ?? data.didRestore);

        onUploadComplete({
          url: data.url,
          savingsPercent: data.savingsPercent ?? 0,
          modelUsed: data.modelUsed,
          didRestore: restored,
          restored,
          shouldRestore: data.shouldRestore,
          restoreSkippedReason: data.restoreSkippedReason ?? data.reason,
          reason: data.reason,
          originalSize: data.originalSize ?? file.size,
          finalSize: data.finalSize,
          compressedSize: data.compressedSize,
          codec: data.codec,
          tier: data.tier || tier,
          isDemo: data.isDemo ?? !isLoggedIn,
          vmafScore: data.vmafScore,
          expiryHours: data.expiryHours,
          stages: data.stages,
        });
      } catch (err: any) {
        if (err?.name === 'AbortError') {
          setError('Cancelled');
        } else {
          console.error(err);
          setError(err?.message || 'Processing failed');
        }
      } finally {
        setUploading(false);
      }
    },
    [deviceProfile, selectedModel, onUploadComplete, tier, isLoggedIn]
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) upload(file);
  };

  return (
    <div className="space-y-4">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={onDrop}
        className={`rounded-3xl border-2 border-dashed p-10 text-center transition ${
          dragging
            ? 'border-[#f97316] bg-[#f97316]/10'
            : 'border-white/15 bg-white/5 hover:border-[#c084fc]/40'
        }`}
      >
        <p className="text-lg font-medium text-white mb-2">Drop a video here</p>
        <p className="text-sm text-white/50 mb-6">
          Compress first (SVT-AV1 → VP9) · restore only when beneficial
        </p>

        <label className="inline-flex cursor-pointer px-6 py-3 rounded-2xl font-semibold text-black bg-gradient-to-r from-[#f97316] to-[#c084fc]">
          {uploading ? 'Processing…' : 'Choose file'}
          <input
            type="file"
            accept="video/*"
            className="hidden"
            disabled={uploading}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) upload(f);
            }}
          />
        </label>

        {uploading && (
          <div className="mt-6 space-y-2">
            <div className="h-2 rounded-full bg-white/10 overflow-hidden">
              <div
                className="h-full bg-gradient-to-r from-[#f97316] to-[#c084fc] transition-all"
                style={{ width: `${progress}%` }}
              />
            </div>
            {status && (
              <p className="text-xs text-white/50">{status}</p>
            )}
          </div>
        )}
      </div>

      {error && (
        <div className="text-sm text-red-300 bg-red-900/30 border border-red-700/40 rounded-2xl p-4">
          {error}
        </div>
      )}

      <p className="text-[11px] text-white/30 text-center">Restorative Encoder Applying Generative AI for Near-Lossless Sequences (REAGANXS)</p>
    </div>
  );
}