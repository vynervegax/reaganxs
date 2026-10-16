//demo-history
'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api } from '@/lib/api';

interface DemoHistoryItem {
  _id: string;
  originalFilename: string;
  finalUrl?: string;
  savingsPercent?: number;
  modelUsed?: string;
  createdAt: string;
  status?: string;
  progress?: number;
  error?: string;
}

export default function DemoHistoryPage() {
  const [history, setHistory] = useState<DemoHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadDemoHistory();
  }, []);

  const loadDemoHistory = async () => {
    try {
      const data = await api.getDemoHistory();
      setHistory(Array.isArray(data) ? data : data.jobs || data.history || []);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to load demo history');
      setHistory([]);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-[#1c140f] text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin h-10 w-10 border-4 border-[#c084fc] border-t-transparent rounded-full mx-auto mb-4" />
          <p>Loading demo history...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1c140f] text-white p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex justify-between items-center mb-10">
          <div>
            <h1 className="text-4xl font-bold">Demo History</h1>
            <p className="text-gray-400 mt-1">
              Public proof of traction • Last 30 days
            </p>
          </div>
          <Link
            href="/process"
            className="px-6 py-3 bg-gradient-to-r from-[#f97316] to-[#c084fc] text-black rounded-2xl font-medium"
          >
            Try Demo Yourself
          </Link>
        </div>

        {error && (
          <div className="bg-red-900/40 border border-red-600/50 text-red-300 p-4 rounded-2xl mb-8">
            {error}
          </div>
        )}

        {history.length === 0 ? (
          <div className="text-center py-24 bg-white/5 border border-white/10 rounded-3xl">
            <p className="text-xl text-gray-400 mb-2">
              No demo videos processed yet
            </p>
            <p className="text-gray-500">Be the first to try the demo!</p>
          </div>
        ) : (
          <div className="space-y-4">
            {history.map((item) => {
              const isProcessing =
                item.status &&
                item.status !== 'completed' &&
                item.status !== 'failed';

              return (
                <div
                  key={item._id}
                  className="bg-white/5 border border-white/10 rounded-3xl p-6 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4"
                >
                  <div>
                    <p className="font-medium">{item.originalFilename}</p>
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

                  <div className="flex items-center gap-3">
                    {isProcessing ? (
                      <span className="text-[#c084fc] text-sm px-4 py-2 bg-[#c084fc]/10 rounded-xl">
                        {item.status}
                      </span>
                    ) : item.finalUrl ? (
                      <a
                        href={item.finalUrl}
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