interface HardwareInfoProps {
  data?: {
    gpuName?: string;
    vramGB?: number;
    cpuName?: string;
    totalMemoryGB?: number;
    batteryLevel?: number;
    isLowPower?: boolean;
  } | null;
}

export default function HardwareInfo({ data }: HardwareInfoProps) {
  if (!data) {
    return (
      <div className="glass rounded-2xl p-5 text-sm text-zinc-500">
        Detecting hardware...
      </div>
    );
  }

  return (
    <div className="glass rounded-2xl p-5 space-y-3">
      <h3 className="text-sm font-medium text-zinc-300">Hardware</h3>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-xs text-zinc-500">GPU</p>
          <p className="text-white truncate">{data.gpuName || 'Unknown'}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-500">VRAM</p>
          <p className="text-white">{data.vramGB ?? '—'} GB</p>
        </div>
        <div>
          <p className="text-xs text-zinc-500">CPU</p>
          <p className="text-white truncate">{data.cpuName || '—'}</p>
        </div>
        <div>
          <p className="text-xs text-zinc-500">System RAM</p>
          <p className="text-white">{data.totalMemoryGB ?? '—'} GB</p>
        </div>
      </div>
      {data.isLowPower && (
        <p className="text-xs text-amber-400">
          Low power mode detected — using lighter quantization
        </p>
      )}
    </div>
  );
}