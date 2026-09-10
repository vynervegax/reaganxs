import { useEffect, useState } from 'react';
import { tauriApi } from '../lib/tauriApi';

interface GpuMem {
  total_vram_mb: number;
  used_vram_mb: number;
  available_vram_mb: number;
  device_type: string;
  is_low_memory: boolean;
}

export default function GpuMemoryInfo() {
  const [info, setInfo] = useState<GpuMem | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        const data = await tauriApi.getGpuMemoryInfo();
        setInfo(data);
      } catch {
        // silent
      }
    };
    load();
    const id = setInterval(load, 5000);
    return () => clearInterval(id);
  }, []);

  if (!info) {
    return (
      <div className="glass rounded-2xl p-5 text-sm text-zinc-500">
        GPU memory...
      </div>
    );
  }

  const usedPct = info.total_vram_mb
    ? Math.round((info.used_vram_mb / info.total_vram_mb) * 100)
    : 0;

  return (
    <div className="glass rounded-2xl p-5 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-zinc-300">GPU Memory</h3>
        <span className="text-xs text-zinc-500">{info.device_type}</span>
      </div>

      <div className="space-y-1.5">
        <div className="h-2 rounded-full bg-white/10 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              info.is_low_memory ? 'bg-amber-500' : 'bg-orange-500'
            }`}
            style={{ width: `${usedPct}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-zinc-500">
          <span>{info.used_vram_mb} MB used</span>
          <span>{info.available_vram_mb} MB free</span>
        </div>
      </div>

      {info.is_low_memory && (
        <p className="text-xs text-amber-400">
          Low VRAM — batch size will be reduced
        </p>
      )}
    </div>
  );
}