interface ProgressBarProps {
  stage: string;
  progress: number;
  message?: string;
}

const STAGE_LABELS: Record<string, string> = {
  compressing: 'Compressing',
  routing: 'Smart Routing',
  restoring: 'Restoring',
  encoding: 'Re-encoding',
  complete: 'Complete',
  error: 'Error',
};

export default function ProgressBar({ stage, progress, message }: ProgressBarProps) {
  return (
    <div className="glass rounded-2xl p-8 space-y-6">
      <div className="text-center space-y-2">
        <p className="text-sm text-zinc-400 uppercase tracking-wider">
          {STAGE_LABELS[stage] || stage}
        </p>
        <p className="text-lg font-medium text-white">
          {message || 'Processing...'}
        </p>
      </div>

      <div className="space-y-2">
        <div className="h-3 rounded-full bg-white/10 overflow-hidden">
          <div
            className="h-full rounded-full bg-gradient-to-r from-orange-500 to-purple-500 transition-all duration-500 ease-out"
            style={{ width: `${Math.min(100, Math.max(0, progress))}%` }}
          />
        </div>
        <div className="flex justify-between text-xs text-zinc-500">
          <span>{Math.round(progress)}%</span>
          <span>
            {stage === 'compressing' && 'SVT-AV1'}
            {stage === 'restoring' && 'AI Restoration'}
            {stage === 'encoding' && 'Final encode'}
          </span>
        </div>
      </div>

      {/* Pipeline steps */}
      <div className="flex justify-between text-xs">
        {['Compress', 'Route', 'Restore', 'Encode'].map((label, i) => {
          const stepProgress = (i + 1) * 25;
          const done = progress >= stepProgress;
          const active = progress >= i * 25 && progress < stepProgress;
          return (
            <div key={label} className="flex flex-col items-center gap-1">
              <div
                className={`h-2.5 w-2.5 rounded-full ${
                  done
                    ? 'bg-orange-500'
                    : active
                    ? 'bg-purple-400 animate-pulse'
                    : 'bg-white/20'
                }`}
              />
              <span className={done || active ? 'text-zinc-300' : 'text-zinc-600'}>
                {label}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}