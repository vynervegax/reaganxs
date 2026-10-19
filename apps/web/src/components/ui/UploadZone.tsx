'use client';

import { useCallback, useRef, useState } from 'react';
import { compressInBrowser } from '@/lib/browserCompress';

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

/** Hybrid (browser compress) only below this size */
const HYBRID_MAX_BYTES = 500 * 1024 * 1024; // 500 MB

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
  const abortRef = useRef<XMLHttpRequest | null>(null);

  const pollUntilDone = useCallback(
    async (
      jobId: string,
      file: File,
      fallbackCodec?: string
    ): Promise<void> => {
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
          throw new Error(d.message || `Status check failed (${r.status})`);
        }

        const j = d.job;
        const mapped = 75 + Math.round((j.progress || 0) * 0.25);
        setProgress(Math.min(99, mapped));
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
            codec: j.codec || fallbackCodec,
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

  const uploadViaPresign = useCallback(
    async (
      blob: Blob,
      filename: string,
      contentType: string,
      onUploadProgress: (loaded: number, total: number) => void
    ): Promise<string> => {
      const token =
        typeof window !== 'undefined' ? localStorage.getItem('token') : null;
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
      };
      if (token) headers.Authorization = `Bearer ${token}`;

      const presignRes = await fetch(`${API_BASE}/api/upload/presign`, {
        method: 'POST',
        headers,
        body: JSON.stringify({ filename, contentType }),
      });
      const presignData = await presignRes.json();
      if (!presignRes.ok || !presignData.uploadUrl) {
        throw new Error(presignData.message || 'Failed to get upload URL');
      }
      const { uploadUrl, key } = presignData;

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        abortRef.current = xhr;
        xhr.open('PUT', uploadUrl);
        xhr.setRequestHeader('Content-Type', contentType);

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) onUploadProgress(e.loaded, e.total);
        };
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`Upload failed (${xhr.status})`));
        };
        xhr.onerror = () => reject(new Error('Network error during upload'));
        xhr.onabort = () => reject(new Error('Upload cancelled'));
        xhr.send(blob);
      });

      return key;
    },
    []
  );

  const upload = useCallback(
    async (file: File) => {
      setError(null);
      setUploading(true);
      setProgress(1);
      setStatus('Preparing…');

      try {
        const token =
          typeof window !== 'undefined' ? localStorage.getItem('token') : null;
        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (token) headers.Authorization = `Bearer ${token}`;

        const useHybrid = file.size < HYBRID_MAX_BYTES;

        let key: string;
        let completeBody: Record<string, unknown>;

        if (useHybrid) {
          // ── Hybrid: compress on device, upload small result ──────────
          setStatus('Compressing on your device…');
          const compressed = await compressInBrowser(
            file,
            (ratio) => setProgress(5 + Math.round(ratio * 45)),
            (msg) => setStatus(msg)
          );

          setStatus('Getting upload URL…');
          setProgress(52);

          key = await uploadViaPresign(
            compressed.blob,
            file.name.replace(/\.\w+$/, '') + '.webm',
            'video/webm',
            (loaded, total) => {
              setProgress(55 + Math.round((loaded / total) * 15));
              setStatus(`Uploading… ${Math.round((loaded / total) * 100)}%`);
            }
          );

          completeBody = {
            key,
            originalFilename: file.name,
            originalSize: file.size,
            compressedSize: compressed.compressedSize,
            codec: compressed.codec,
            skipCompress: true,
            model: selectedModel,
            deviceProfile,
          };
        } else {
          // ── Full cloud: upload original, server compresses ───────────
          setStatus(
            `Large file (${(file.size / 1024 / 1024).toFixed(0)} MB) — uploading to cloud…`
          );
          setProgress(10);

          key = await uploadViaPresign(
            file,
            file.name,
            file.type || 'video/mp4',
            (loaded, total) => {
              setProgress(10 + Math.round((loaded / total) * 55));
              setStatus(
                `Uploading original… ${Math.round((loaded / total) * 100)}%`
              );
            }
          );

          completeBody = {
            key,
            originalFilename: file.name,
            originalSize: file.size,
            skipCompress: false,
            model: selectedModel,
            deviceProfile,
          };
        }

        setStatus('Starting cloud processing…');
        setProgress(72);

        const completeRes = await fetch(`${API_BASE}/api/upload/complete`, {
          method: 'POST',
          headers,
          body: JSON.stringify(completeBody),
        });
        const completeData = await completeRes.json();
        if (!completeRes.ok || !completeData.success) {
          throw new Error(completeData.message || 'Failed to start processing');
        }

        setStatus('Queued…');
        setProgress(75);

        await pollUntilDone(
          completeData.jobId,
          file,
          useHybrid ? 'libvpx-vp9' : undefined
        );
      } catch (err: any) {
        console.error(err);
        setError(err?.message || 'Processing failed');
      } finally {
        setUploading(false);
        abortRef.current = null;
      }
    },
    [
      deviceProfile,
      selectedModel,
      uploadViaPresign,
      pollUntilDone,
    ]
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
          Under 500 MB: compress on your device · 500 MB+: full cloud processing
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