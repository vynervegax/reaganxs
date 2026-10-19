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
}

export default function HistoryPage() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    setIsLoggedIn(!!localStorage.getItem('token'));
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

  const getDownloadUrl = (item: HistoryItem) => item.finalUrl || item.url || '';

  const isExpired = (expiresAt?: string) =>
    expiresAt ? new Date(expiresAt) < new Date() : false;

  const isOld = (createdAt: string) => {
    const daysOld =
      (Date.now() - new Date(createdAt).getTime()) / (1000 * 60 * 60 * 24);
    return daysOld > 30;
  };

  const filteredHistory = history.filter((item) => !isOld(item.createdAt));

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
    <div className="min-h-screen bg-[#1c140f] text-white">
      {/* Top bar — same pattern as Process */}
      <div className="border-b border-white/10">
        <div className="max-w-5xl mx-auto px-6 py-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link href="/" className="text-2xl font-bold tracking-tight hover:opacity-90">
              Reagan<span className="text-[#c084fc]">XS</span>
            </Link>
            <p className="text-xs text-white/40 mt-1">Processing history</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Link
              href="/process"
              className="px-4 py-2 rounded-2xl bg-gradient-to-r from-[#f97316] to-[#c084fc] text-black text-sm font-semibold"
            >
              New Processing
            </Link>
            <Link
              href="/"
              className="px-4 py-2 rounded-2xl bg-white/5 border border-white/10 text-sm hover:border-white/25 transition"
            >
              Home
            </Link>
          </div>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-6 sm:p-8">
        <div className="mb-10">
          <h1 className="text-4xl font-bold">Processing History</h1>
          <p className="text-gray-400 mt-1">
            Your past videos and download links (last 30 days)
          </p>
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
                item.status &&
                item.status !== 'completed' &&
                item.status !== 'failed';
              const isCompleted = item.status === 'completed' || !!downloadUrl;
              const isExpanded = expandedId === item._id;

              return (
                <div
                  key={item._id}
                  className={`bg-white/5 border rounded-3xl overflow-hidden transition ${
                    expired
                      ? 'opacity-60 border-red-500/30'
                      : 'border-white/10 hover:border-white/20'
                  }`}
                >
                  <div className="p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-lg truncate">
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
                            {item.progress != null ? ` (${item.progress}%)` : ''}
                          </span>
                        )}
                      </p>
                      {item.error && (
                        <p className="text-xs text-red-400 mt-1">{item.error}</p>
                      )}
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {expired ? (
                        <span className="text-red-400 text-sm font-medium px-4 py-2 bg-red-500/10 rounded-xl">
                          Expired
                        </span>
                      ) : isProcessing ? (
                        <span className="text-[#c084fc] text-sm px-4 py-2 bg-[#c084fc]/10 rounded-xl">
                          {item.status}
                        </span>
                      ) : (
                        <>
                          {isCompleted && (
                            <button
                              type="button"
                              onClick={() =>
                                setExpandedId(isExpanded ? null : item._id)
                              }
                              className="px-4 py-2.5 rounded-2xl bg-white/5 border border-white/10 text-sm hover:border-[#c084fc]/40 transition"
                            >
                              {isExpanded ? 'Hide card' : 'Results'}
                            </button>
                          )}
                          {downloadUrl ? (
                            <a
                              href={downloadUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="px-6 py-2.5 bg-[#f97316] hover:bg-[#fb923c] text-black rounded-2xl text-sm font-medium transition"
                            >
                              Download
                            </a>
                          ) : (
                            <span className="text-gray-500 text-sm">
                              No link available
                            </span>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {isExpanded && isCompleted && !expired && (
                    <div className="px-6 pb-6 border-t border-white/10 pt-4">
                      <SavingsCard
                        job={{
                          url: downloadUrl,
                          savingsPercent: item.savingsPercent,
                          modelUsed: item.modelUsed,
                          restored: item.restored,
                          restoreMode: item.restoreMode,
                          originalSize: item.originalSize,
                          finalSize:
                            item.finalSize ?? item.compressedSize ?? undefined,
                          codec: item.codec,
                          vmafScore: item.vmafScore,
                          previewFrames: item.previewFrameUrls,
                          previewClipUrl: item.previewClipUrl,
                        }}
                        isLoggedIn={isLoggedIn}
                      />
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