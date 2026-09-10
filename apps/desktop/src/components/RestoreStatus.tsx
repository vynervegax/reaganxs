type Props = {
  restored?: boolean;
  modelUsed?: string;
  modelLoaded?: boolean;
  restoreSkippedReason?: string | null;
  stages?: string[];
};

export default function RestoreStatus({
  restored,
  modelUsed,
  modelLoaded,
  restoreSkippedReason,
  stages,
}: Props) {
  const label = restored ? 'Restored' : 'Skipped / not applied';
  const color = restored
    ? 'text-emerald-400 border-emerald-500/40 bg-emerald-500/10'
    : 'text-amber-300 border-amber-500/40 bg-amber-500/10';

  return (
    <div className="rounded-3xl border border-white/10 bg-white/5 p-5 space-y-3">
      <div className="flex items-center justify-between gap-3">
        <span className="text-sm text-white/50">Restoration</span>
        <span
          className={`text-xs px-3 py-1 rounded-full border font-medium ${color}`}
        >
          {label}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <p className="text-white/40 text-xs mb-1">Model used</p>
          <p className="font-medium">{modelUsed || 'compression-only'}</p>
        </div>
        <div>
          <p className="text-white/40 text-xs mb-1">Model loaded</p>
          <p className={modelLoaded ? 'text-emerald-400' : 'text-amber-300'}>
            {modelLoaded ? 'Yes' : 'No'}
          </p>
        </div>
      </div>

      {!restored && restoreSkippedReason && (
        <p className="text-xs text-white/45 border-t border-white/10 pt-3">
          {restoreSkippedReason}
        </p>
      )}

      {stages && stages.length > 0 && (
        <ul className="border-t border-white/10 pt-3 space-y-1 font-mono text-[11px] text-white/50">
          {stages.map((s) => (
            <li key={s}>→ {s}</li>
          ))}
        </ul>
      )}
    </div>
  );
}