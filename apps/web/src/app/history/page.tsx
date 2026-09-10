//history

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

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
}

export default function HistoryPage() {
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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

              return (
                <div
                  key={item._id}
                  className={`bg-white/5 border rounded-3xl p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 transition ${
                    expired
                      ? 'opacity-60 border-red-500/30'
                      : 'border-white/10 hover:border-white/20'
                  }`}
                >
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
                    </p>
                  </div>

                  <div className="flex items-center gap-3">
                    {expired ? (
                      <span className="text-red-400 text-sm font-medium px-4 py-2 bg-red-500/10 rounded-xl">
                        Expired
                      </span>
                    ) : downloadUrl ? (
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
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}