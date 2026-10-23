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

/** Above this size: upload direct to R2 (avoid Railway body abort) */
const LARGE_UPLOAD_BYTES = 200 * 1024 * 1024; // 200 MB

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
  const abortRef = useRef<AbortController | XMLHttpRequest | null>(null);

  const authHeaders = useCallback((): Record<string, string> => {
    const token =
      typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    const h: Record<string, string> = {};
    if (token) h.Authorization = `Bearer ${token}`;
    return h;
  }, []);

  const pollUntilDone = useCallback(
    async (jobId: string, file: File): Promise<void> => {
      const poll = async (): Promise<void> => {
        const r = await fetch(`${API_BASE}/api/process/${jobId}`);
        if (r.status === 429) {
          setStatus('Checking status…');
          await new Promise((res) => setTimeout(res, 5000));
          return poll();
        }
        const d = await r.json().catch(() => ({} as any));
        if (!r.ok || !d.job) {
          if (r.status >= 500) {
            await new Promise((res) => setTimeout(res, 4000));
            return poll();
          }
          throw new Error(d.message || 'Status check failed');
        }

        const j = d.job;
        setProgress(Math.min(99, Math.max(25, j.progress || 25)));
        setStatus(j.status || 'Processing…');

        if (j.status === 'completed') {
          setProgress(100);
          setStatus('Done');
          onUploadComplete({
            url: j.finalUrl,
            savingsPercent: j.savingsPercent ?? 0,
            modelUsed: j.modelUsed,
            didRestore: Boolean(j.didRestore ?? j.restored),
            restored: Boolean(j.restored ?? j.didRestore),
            originalSize: j.originalSize ?? file.size,
            finalSize: j.finalSize,
            codec: j.codec,
            tier,
            isDemo: !isLoggedIn,
            vmafScore: j.vmafScore,
          });
          return;
        }
        if (j.status === 'failed') {
          throw new Error(j.error || 'Processing failed');
        }
        await new Promise((res) => setTimeout(res, 4000));
        return poll();
      };
      await poll();
    },
    [onUploadComplete, tier, isLoggedIn]
  );

  /** Classic path — small files through Railway */
  const uploadClassic = useCallback(
    async (file: File) => {
      setStatus('Uploading…');
      setProgress(5);

      const ac = new AbortController();
      abortRef.current = ac;

      const form = new FormData();
      form.append('video', file);
      if (deviceProfile) {
        form.append('deviceProfile', JSON.stringify(deviceProfile));
      }
      if (selectedModel) form.append('model', selectedModel);

      const res = await resilientFetch(`${API_BASE}/api/process`, {
        method: 'POST',
        headers: authHeaders(),
        body: form,
        signal: ac.signal,
        retries: 4,
        baseDelayMs: 1500,
        maxDelayMs: 10000,
        onRetry: ({ attempt, retriesLeft }) => {
          setStatus(`Retry ${attempt} (${retriesLeft} left)…`);
        },
      });

      const data = await res.json().catch(() => ({} as any));
      if (!res.ok || data.success === false) {
        throw new Error(data.message || `Upload failed (${res.status})`);
      }

      setStatus('Queued…');
      setProgress(20);
      await pollUntilDone(data.jobId, file);
    },
    [authHeaders, deviceProfile, selectedModel, pollUntilDone]
  );

  /** Large path — direct to R2, then cloud compress */
  const uploadLargeViaR2 = useCallback(
    async (file: File) => {
      setStatus('Large file — preparing direct upload…');
      setProgress(3);

      const headers = {
        ...authHeaders(),
        'Content-Type': 'application/json',
      };

      // 1) Presign
      const presignRes = await fetch(`${API_BASE}/api/upload/presign`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          filename: file.name,
          contentType: file.type || 'video/mp4',
        }),
      });
      const presignData = await presignRes.json().catch(() => ({} as any));
      if (!presignRes.ok || !presignData.uploadUrl) {
        throw new Error(
          presignData.message ||
            'Direct upload not available. Try a smaller file or check API routes.'
        );
      }
      const { uploadUrl, key } = presignData;

      // 2) PUT to R2 with progress
      setStatus('Uploading directly to storage…');
      setProgress(5);

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        abortRef.current = xhr;
        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Content-Type', file.type || 'video/mp4');

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            const pct = Math.round((e.loaded / e.total) * 100);
            // Map upload 0–100% → progress 5–55
            setProgress(5 + Math.round((e.loaded / e.total) * 50));
            setStatus(`Uploading… ${pct}%`);
          }
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`Storage upload failed (${xhr.status})`));
        };
        xhr.onerror = () =>
          reject(
            new Error(
              'Network error during direct upload (check R2 CORS for your site origin)'
            )
          );
        xhr.onabort = () => reject(new Error('Upload cancelled'));
        xhr.send(file);
      });

      // 3) Start job — cloud will compress (skipCompress: false)
      setStatus('Starting cloud processing…');
      setProgress(58);

      const completeRes = await fetch(`${API_BASE}/api/upload/complete`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          key,
          originalFilename: file.name,
          originalSize: file.size,
          skipCompress: false,
          model: selectedModel,
          deviceProfile,
        }),
      });
      const completeData = await completeRes.json().catch(() => ({} as any));
      if (!completeRes.ok || !completeData.success) {
        throw new Error(
          completeData.message || 'Failed to start processing after upload'
        );
      }

      setStatus('Queued…');
      setProgress(65);
      await pollUntilDone(completeData.jobId, file);
    },
    [authHeaders, deviceProfile, selectedModel, pollUntilDone]
  );

  const upload = useCallback(
    async (file: File) => {
      setError(null);
      setUploading(true);
      setProgress(1);

      try {
        if (file.size >= LARGE_UPLOAD_BYTES) {
          await uploadLargeViaR2(file);
        } else {
          await uploadClassic(file);
        }
      } catch (err: any) {
        if (err?.name === 'AbortError') setError('Cancelled');
        else {
          console.error(err);
          setError(err?.message || 'Processing failed');
        }
      } finally {
        setUploading(false);
        abortRef.current = null;
      }
    },
    [uploadClassic, uploadLargeViaR2]
  );

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragging(false);
    const f = e.dataTransfer.files?.[0];
    if (f) upload(f);
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
          Under 200 MB: standard upload · 200 MB+: direct storage upload
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
            {status && <p className="text-xs text-white/50">{status}</p>}
          </div>
        )}
      </div>

      {error && (
        <div className="text-sm text-red-300 bg-red-900/30 border border-red-700/40 rounded-2xl p-4">
          {error}
        </div>
      )}

      <p className="text-[11px] text-white/30 text-center">
        Restorative Encoder Applying Generative AI for Near-Lossless Sequences (REAGANXS)
      </p>
    </div>
  );
}