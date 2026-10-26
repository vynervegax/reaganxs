//history
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';
import SavingsCard from '@/components/ui/SavingsCard';

interface HistoryItem {
  _id: string;
  originalFilename: string;
  finalUrl?: string;
  url?: string;
  savingsPercent?: number;
  modelUsed?: string;
  createdAt: string;
  expiresAt?: string;
  status?: string;
  progress?: number;
  error?: string;
  originalSize?: number;
  compressedSize?: number;
  finalSize?: number;
  codec?: string;
  restored?: boolean;
  restoreMode?: string;
  vmafScore?: number | null;
  previewFrameUrls?: string[];
  previewClipUrl?: string | null;
  compressedKey?: string;
}

const API_BASE = (
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  'http://localhost:4000'
)
  .trim()
  .replace(/\/$/, '');

const ACTIVE_JOB_KEY = 'reaganxs_active_job';

const IN_PROGRESS = new Set([
  'queued',
  'pending',
  'compressing',
  'compressed',
  'routing',
  'restoring',
  'uploading',
]);

export default function HistoryPage() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  useEffect(() => {
    loadHistory();
  }, []);

  const loadHistory = async () => {
    try {
      const token = localStorage.getItem('token');
      if (!token) {
        setError('Please log in to view your history');
        setLoading(false);
        return;
      }
      const data = await api.getHistory(token);
      setHistory(Array.isArray(data) ? data : data.jobs || data.history || []);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to load history');
      setHistory([]);
    } finally {
      setLoading(false);
    }
  };

  const resumeWatch = (jobId: string) => {
    try {
      sessionStorage.setItem(ACTIVE_JOB_KEY, jobId);
    } catch {
      /* ignore */
    }
    window.location.href = `/process?jobId=${encodeURIComponent(jobId)}`;
  };

  const retryRestore = async (jobId: string, promote = false) => {
    const token = localStorage.getItem('token');
    try {
      const res = await fetch(`${API_BASE}/api/process/${jobId}/retry`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ promote }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        alert(data.message || 'Retry failed');
        return;
      }
      try {
        sessionStorage.setItem(ACTIVE_JOB_KEY, jobId);
      } catch {
        /* ignore */
      }
      window.location.href = `/process?jobId=${encodeURIComponent(jobId)}`;
    } catch (e: any) {
      alert(e?.message || 'Retry failed');
    }
  };

  const deleteJob = async (id: string) => {
    const token = localStorage.getItem('token');
    if (!token) return;
    if (
      !confirm(
        'Remove this job from history? If queued, it will leave the queue.'
      )
    ) {
      return;
    }
    setDeletingId(id);
    try {
      const res = await fetch(`${API_BASE}/api/history/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.message || 'Delete failed');
      setHistory((prev) => prev.filter((h) => h._id !== id));
      if (expandedId === id) setExpandedId(null);
    } catch (e: any) {
      alert(e?.message || 'Delete failed');
    } finally {
      setDeletingId(null);
    }
  };

  const getDownloadUrl = (item: HistoryItem) => item.finalUrl || item.url || '';

  const isExpired = (expiresAt?: string) =>
    expiresAt ? new Date(expiresAt) < new Date() : false;

  const isOld = (createdAt: string) => {
    const daysOld =
      (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24);
    return daysOld > 30;
  };

  const filteredHistory = history.filter((item) => !isOld(item.createdAt));

  const toCardJob = (item: HistoryItem) => ({
    url: getDownloadUrl(item),
    savingsPercent: item.savingsPercent ?? 0,
    modelUsed: item.modelUsed,
    restored: Boolean(item.restored),
    didRestore: Boolean(item.restored),
    restoreMode: item.restoreMode,
    originalSize: item.originalSize,
    finalSize: item.finalSize ?? item.compressedSize,
    codec: item.codec,
    vmafScore: item.vmafScore ?? null,
    previewFrames: item.previewFrameUrls || [],
    previewClipUrl: item.previewClipUrl || null,
  });

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1c140f] text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-10 w-10 border-4 border-[#c084fc] border-t-transparent rounded-full mx-auto mb-4" />
          <p>Loading your history...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1c140f] text-white p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-10">
          <div>
            <h1 className="text-4xl font-bold">Processing History</h1>
            <p className="text-gray-400 mt-1">
              Your past videos and download links (last 30 days)
            </p>
          </div>
          <div className="flex gap-3">
            <Link
              href="/process"
              className="px-6 py-3 bg-gradient-to-r from-[#f97316] to-[#c084fc] text-black rounded-2xl font-medium"
            >
              New Processing
            </Link>
            <Link
              href="/"
              className="px-6 py-3 bg-white/10 hover:bg-white/20 rounded-2xl"
            >
              Home
            </Link>
          </div>
        </div>

        {error && (
          <div className="bg-red-900/40 border border-red-600/50 text-red-300 p-4 rounded-2xl mb-8">
            {error}
          </div>
        )}

        {filteredHistory.length === 0 ? (
          <div className="text-center py-24 bg-white/5 border border-white/10 rounded-3xl">
            <p className="text-xl text-gray-400 mb-2">
              No processed videos in the last 30 days
            </p>
            <p className="text-gray-500 mb-8">
              Process a video to see it appear here
            </p>
            <Link
              href="/process"
              className="inline-block px-8 py-3 bg-gradient-to-r from-[#f97316] to-[#c084fc] text-black rounded-2xl font-medium"
            >
              Process Your First Video
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {filteredHistory.map((item) => {
              const downloadUrl = getDownloadUrl(item);
              const expired = isExpired(item.expiresAt);
              const isProcessing =
                !!item.status && IN_PROGRESS.has(item.status);
              const isExpanded = expandedId === item._id;
              const canShowCard =
                item.status === 'completed' || (!item.status && !!downloadUrl);
              const canRetry =
                item.status === 'failed' && Boolean(item.compressedKey);

              return (
                <div
                  key={item._id}
                  className={`bg-white/5 border rounded-3xl transition ${
                    expired
                      ? 'opacity-60 border-red-500/30'
                      : 'border-white/10 hover:border-white/20'
                  }`}
                >
                  <div className="p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div className="flex-1">
                      <p className="font-medium text-lg">
                        {item.originalFilename || 'Untitled Video'}
                      </p>
                      <p className="text-sm text-gray-400 mt-1">
                        {item.modelUsed || 'Unknown model'}
                        {item.savingsPercent != null &&
                          ` • Saved ${item.savingsPercent}%`}
                      </p>
                      <p className="text-xs text-gray-500 mt-1">
                        {new Date(item.createdAt).toLocaleString()}
                        {item.status && item.status !== 'completed' && (
                          <span className="ml-2 text-[#c084fc]">
                            · {item.status}
                            {item.progress != null
                              ? ` (${item.progress}%)`
                              : ''}
                          </span>
                        )}
                      </p>
                      {item.error && (
                        <p className="text-xs text-red-400 mt-1">
                          {item.error}
                        </p>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      {expired ? (
                        <span className="text-red-400 text-sm font-medium px-4 py-2 bg-red-500/10 rounded-xl">
                          Expired
                        </span>
                      ) : isProcessing ? (
                        <>
                          <span className="text-[#c084fc] text-sm px-4 py-2 bg-[#c084fc]/10 rounded-xl">
                            {item.status}
                          </span>
                          <button
                            type="button"
                            onClick={() => resumeWatch(item._id)}
                            className="px-4 py-2.5 rounded-2xl border border-[#c084fc]/40 text-[#c084fc] hover:bg-[#c084fc]/10 text-sm"
                          >
                            Resume
                          </button>
                        </>
                      ) : (
                        <>
                          {downloadUrl && (
                            <a
                              href={downloadUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-6 py-2.5 bg-[#f97316] hover:bg-[#fb923c] text-black rounded-2xl text-sm font-medium transition"
                            >
                              Download
                            </a>
                          )}
                          {canShowCard && (
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedId(isExpanded ? null : item._id)
                              }
                              className="px-4 py-2.5 rounded-2xl border border-white/15 bg-white/5 hover:bg-white/10 text-sm transition"
                            >
                              {isExpanded ? 'Hide card' : 'Savings card'}
                            </button>
                          )}
                          {canRetry && (
                            <button
                              type="button"
                              onClick={() => retryRestore(item._id, false)}
                              className="px-4 py-2.5 rounded-2xl border border-amber-500/40 text-amber-200 hover:bg-amber-900/20 text-sm"
                            >
                              Retry restore
                            </button>
                          )}
                          {!downloadUrl && !canShowCard && !canRetry && (
                            <span className="text-gray-500 text-sm">
                              No link available
                            </span>
                          )}
                        </>
                      )}

                      <button
                        type="button"
                        disabled={deletingId === item._id}
                        onClick={() => deleteJob(item._id)}
                        className="px-4 py-2.5 rounded-2xl border border-red-500/30 text-red-300 hover:bg-red-900/20 text-sm transition disabled:opacity-50"
                      >
                        {deletingId === item._id ? 'Removing…' : 'Delete'}
                      </button>
                    </div>
                  </div>

                  {isExpanded && canShowCard && (
                    <div className="px-6 pb-6 border-t border-white/10 pt-4">
                      <SavingsCard job={toCardJob(item)} isLoggedIn />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}