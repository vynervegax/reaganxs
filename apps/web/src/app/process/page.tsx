//process

'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import UploadZone from '@/components/ui/UploadZone';
import ProcessPipeline from '@/components/ProcessPipeline';
import SavingsCard from '@/components/ui/SavingsCard';
import DeviceStatus from '@/components/ui/DeviceStatus';
import RestoreStatus from '@/components/ui/RestoreStatus';
import { getDeviceProfile } from '@/lib/deviceProfile';

type JobResult = {
  success?: boolean;
  url?: string;
  savingsPercent?: number;
  vmafScore?: number | null;
  modelUsed?: string;
  expiryHours?: number;
  isDemo?: boolean;
  restored?: boolean;
  shouldRestore?: boolean;
  restoreSkippedReason?: string | null;
  stages?: string[];
  originalSize?: number;
  finalSize?: number;
  codec?: string;
  [key: string]: unknown;
};

const API_BASE = (
  process.env.NEXT_PUBLIC_API_URL ||
  process.env.NEXT_PUBLIC_BACKEND_URL ||
  'http://localhost:4000'
)
  .trim()
  .replace(/\/$/, '');

const ACTIVE_JOB_KEY = 'reaganxs_active_job';

export default function ProcessPage() {
  const searchParams = useSearchParams();
  const [job, setJob] = useState<JobResult | null>(null);
  const [deviceProfile, setDeviceProfile] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [tier, setTier] = useState('demo');
  const [userLabel, setUserLabel] = useState('');
  const [watchingJobId, setWatchingJobId] = useState<string | null>(null);
  const [liveStatus, setLiveStatus] = useState('');
  const [liveProgress, setLiveProgress] = useState(0);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const storedTier =
      localStorage.getItem('tier') || localStorage.getItem('userTier') || 'free';
    let name = localStorage.getItem('userName') || '';
    let email = localStorage.getItem('userEmail') || '';

    try {
      const raw = localStorage.getItem('user');
      if (raw) {
        const u = JSON.parse(raw);
        if (!name) name = u.name || '';
        if (!email) email = u.email || '';
        if (u.tier) localStorage.setItem('tier', u.tier);
      }
    } catch {
      /* ignore */
    }

    setIsLoggedIn(!!token);
    setTier(token ? storedTier : 'demo');
    setUserLabel(name || email || '');

    const initDevice = async () => {
      try {
        const profile = await getDeviceProfile();
        setDeviceProfile(profile);
      } catch (err) {
        console.error('Device detection failed', err);
        setError('Could not detect device. Using default profile.');
        setDeviceProfile({
          vram: 4,
          batteryLevel: 100,
          isLowPower: false,
          platform: 'web',
        });
      } finally {
        setLoading(false);
      }
    };

    initDevice();
  }, []);

  const handleUploadComplete = useCallback((newJob: JobResult) => {
    setJob(newJob);
    setWatchingJobId(null);
    setLiveStatus('');
    setLiveProgress(0);
    try {
      sessionStorage.removeItem(ACTIVE_JOB_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const pollJob = useCallback(
    async (jobId: string) => {
      try {
        const r = await fetch(`${API_BASE}/api/process/${jobId}`);
        const d = await r.json().catch(() => ({}));
        if (!r.ok || !d.job) {
          setTimeout(() => pollJob(jobId), 5000);
          return;
        }

        const j = d.job;
        setLiveStatus(j.status || '');
        setLiveProgress(j.progress || 0);
        try {
          sessionStorage.setItem(ACTIVE_JOB_KEY, jobId);
        } catch {
          /* ignore */
        }

        if (j.status === 'completed' && j.finalUrl) {
          handleUploadComplete({
            url: j.finalUrl,
            savingsPercent: j.savingsPercent ?? 0,
            modelUsed: j.modelUsed,
            didRestore: Boolean(j.didRestore ?? j.restored),
            restored: Boolean(j.restored ?? j.didRestore),
            originalSize: j.originalSize,
            finalSize: j.finalSize,
            codec: j.codec,
            vmafScore: j.vmafScore,
          });
          return;
        }

        if (j.status === 'failed' || j.status === 'cancelled') {
          setWatchingJobId(null);
          setError(j.error || j.status);
          try {
            sessionStorage.removeItem(ACTIVE_JOB_KEY);
          } catch {
            /* ignore */
          }
          return;
        }

        setTimeout(() => pollJob(jobId), 4000);
      } catch {
        setTimeout(() => pollJob(jobId), 5000);
      }
    },
    [handleUploadComplete]
  );

  useEffect(() => {
    if (job || loading) return;
    const fromQuery = searchParams.get('jobId');
    let fromSession: string | null = null;
    try {
      fromSession = sessionStorage.getItem(ACTIVE_JOB_KEY);
    } catch {
      /* ignore */
    }
    const id = fromQuery || fromSession;
    if (id) {
      setWatchingJobId(id);
      pollJob(id);
    }
  }, [searchParams, job, loading, pollJob]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('tier');
    localStorage.removeItem('userTier');
    localStorage.removeItem('userEmail');
    localStorage.removeItem('userName');
    localStorage.removeItem('user');
    window.location.href = '/';
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#1c140f] text-white">
        <div className="text-center">
          <div className="animate-spin h-12 w-12 border-4 border-[#c084fc] border-t-transparent rounded-full mx-auto mb-4" />
          <p className="text-white/60">Detecting device capabilities…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1c140f] text-white">
      <div className="border-b border-white/10">
        <div className="max-w-5xl mx-auto px-6 py-5 flex flex-wrap items-center justify-between gap-4">
          <div>
            <Link
              href="/"
              className="text-2xl font-bold tracking-tight hover:opacity-90"
            >
              Reagan<span className="text-[#c084fc]">XS</span>
            </Link>
            <p className="text-xs text-white/40 mt-1">
              {isLoggedIn
                ? `Studio · ${tier}${userLabel ? ` · ${userLabel}` : ''}`
                : 'Demo studio · Pure Photo PLKSR'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {deviceProfile && <DeviceStatus deviceProfile={deviceProfile} />}
            <Link
              href="/"
              className="px-4 py-2 rounded-2xl bg-white/5 border border-white/10 text-sm hover:border-white/25 transition"
            >
              Home
            </Link>
            {isLoggedIn && (
              <Link
                href="/history"
                className="px-4 py-2 rounded-2xl bg-white/5 border border-white/10 text-sm hover:border-[#c084fc]/40 transition"
              >
                History
              </Link>
            )}
            {isLoggedIn ? (
              <>
                <Link
                  href="/settings"
                  className="px-4 py-2 rounded-2xl bg-white/5 border border-white/10 text-sm hover:border-[#c084fc]/40 transition"
                >
                  Settings
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="px-4 py-2 rounded-2xl bg-white/10 hover:bg-white/20 text-sm transition"
                >
                  Log out
                </button>
              </>
            ) : (
              <>
                <Link
                  href="/login"
                  className="px-4 py-2 rounded-2xl bg-white/5 border border-white/10 text-sm hover:border-white/25 transition"
                >
                  Log in
                </Link>
                <Link
                  href="/register"
                  className="px-4 py-2 rounded-2xl bg-gradient-to-r from-[#f97316] to-[#c084fc] text-black text-sm font-semibold"
                >
                  Register
                </Link>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto p-6">
        <div className="flex flex-col md:flex-row md:items-end md:justify-between gap-4 mb-8">
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-[#f97316] to-[#c084fc] bg-clip-text text-transparent">
              Video Processing
            </h1>
            <p className="text-white/50 mt-2 text-sm max-w-xl">
              {isLoggedIn
                ? 'Compress first (SVT-AV1 → VP9). Restore selectively with your tier models.'
                : 'Demo mode: no login required. RGT-S 4x only. Register for to access ATD FineTune and higher limits.'}
            </p>
          </div>
          <div
            className={`text-xs px-4 py-2 rounded-full border ${
              isLoggedIn
                ? 'border-[#c084fc]/40 bg-[#c084fc]/10 text-[#c084fc]'
                : 'border-[#f97316]/40 bg-[#f97316]/10 text-[#f97316]'
            }`}
          >
            {isLoggedIn ? `Logged in · ${tier.toUpperCase()}` : 'DEMO'}
          </div>
        </div>

        {error && (
          <div className="bg-yellow-900/40 border border-yellow-600/50 text-yellow-200 p-4 rounded-2xl mb-6 text-sm">
            {error}
          </div>
        )}

        {watchingJobId && !job && (
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#c084fc]/30 bg-[#c084fc]/10 px-4 py-3">
            <div>
              <p className="text-sm font-medium text-white">
                Processing in progress
              </p>
              <p className="text-xs text-white/50">
                {liveStatus || '…'} · {liveProgress}%
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => pollJob(watchingJobId)}
                className="px-3 py-1.5 rounded-xl text-xs border border-white/20 hover:bg-white/10"
              >
                Refresh
              </button>
              <Link
                href="/history"
                className="px-3 py-1.5 rounded-xl text-xs border border-white/20 hover:bg-white/10"
              >
                History
              </Link>
            </div>
          </div>
        )}

        {!job ? (
          <UploadZone
            onUploadComplete={handleUploadComplete}
            deviceProfile={deviceProfile}
            isLoggedIn={isLoggedIn}
            tier={tier}
          />
        ) : (
          <div className="space-y-8">
            <ProcessPipeline job={job} isLoggedIn={isLoggedIn} />

            <RestoreStatus
              restored={job.restored}
              shouldRestore={job.shouldRestore}
              modelUsed={job.modelUsed}
              restoreSkippedReason={job.restoreSkippedReason}
              stages={job.stages}
            />

            <SavingsCard job={job} isLoggedIn={isLoggedIn} />

            <div className="flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setJob(null)}
                className="px-6 py-3 rounded-2xl bg-white/5 border border-white/10 hover:border-white/25 text-sm transition"
              >
                Process another
              </button>
              {job.url && (
                <a
                  href={job.url as string}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="px-6 py-3 rounded-2xl bg-gradient-to-r from-[#f97316] to-[#c084fc] text-black text-sm font-semibold"
                >
                  Open result
                </a>
              )}
              {!isLoggedIn && (
                <Link
                  href="/register"
                  className="px-6 py-3 rounded-2xl border border-[#c084fc]/40 text-[#c084fc] text-sm hover:bg-[#c084fc]/10 transition"
                >
                  Unlock better models
                </Link>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}