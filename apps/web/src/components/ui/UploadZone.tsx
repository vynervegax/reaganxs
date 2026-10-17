'use client';

import { useCallback, useRef, useState } from 'react';

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
  const abortRef = useRef<XMLHttpRequest | null>(null);

  const upload = useCallback(
    async (file: File) => {
      setError(null);
      setUploading(true);
      setProgress(2);
      setStatus('Getting upload URL…');

      try {
        const token =
          typeof window !== 'undefined' ? localStorage.getItem('token') : null;

        const headers: Record<string, string> = {
          'Content-Type': 'application/json',
        };
        if (token) {
          headers.Authorization = `Bearer ${token}`;
        }

        // 1. Get presigned URL
        const presignRes = await fetch(`${API_BASE}/api/upload/presign`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            filename: file.name,
            contentType: file.type || 'video/mp4',
          }),
        });

        const presignData = await presignRes.json();
        if (!presignRes.ok || !presignData.uploadUrl) {
          throw new Error(presignData.message || 'Failed to get upload URL');
        }

        const { uploadUrl, key } = presignData;

        // 2. Upload directly to R2 with progress
        setStatus('Uploading to storage…');
        setProgress(5);

        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          abortRef.current = xhr;

          xhr.open('PUT', uploadUrl);
          xhr.setRequestHeader('Content-Type', file.type || 'video/mp4');

          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              // Map 0–100% of the R2 upload into 5–55% of the overall bar
              const uploadPercent = Math.round((e.loaded / e.total) * 50) + 5;
              setProgress(uploadPercent);
              setStatus(`Uploading… ${Math.round((e.loaded / e.total) * 100)}%`);
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve();
            else reject(new Error(`Upload failed (${xhr.status})`));
          };

          xhr.onerror = () => reject(new Error('Network error during upload'));
          xhr.onabort = () => reject(new Error('Upload cancelled'));

          xhr.send(file);
        });

        // 3. Tell backend the upload finished
        setStatus('Starting processing…');
        setProgress(58);

        const completeRes = await fetch(`${API_BASE}/api/upload/complete`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            key,
            originalFilename: file.name,
            originalSize: file.size,
            model: selectedModel,
            deviceProfile,
          }),
        });

        const completeData = await completeRes.json();
        if (!completeRes.ok || !completeData.success) {
          throw new Error(completeData.message || 'Failed to start processing');
        }

        const jobId = completeData.jobId;
        setStatus('Queued…');
        setProgress(60);

        // 4. Poll job status
        const poll = async (): Promise<void> => {
          const r = await fetch(`${API_BASE}/api/process/${jobId}`);
          const d = await r.json();
          if (!r.ok || !d.job) {
            throw new Error(d.message || 'Status check failed');
          }

          const j = d.job;
          // Map job progress (0–100) into 60–100 of the overall bar
          const mapped = 60 + Math.round((j.progress || 0) * 0.4);
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

          await new Promise((resolve) => setTimeout(resolve, 2500));
          return poll();
        };

        await poll();
      } catch (err: any) {
        console.error(err);
        setError(err?.message || 'Processing failed');
      } finally {
        setUploading(false);
        abortRef.current = null;
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