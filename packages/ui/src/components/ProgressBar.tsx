interface ProgressBarProps {
  stage: "compressing" | "routing" | "restoring" | "complete";
  progress: number;
  message: string;
}

export default function ProgressBar({ stage, progress, message }: ProgressBarProps) {
  return (
    <div className="space-y-3">
      <div className="flex justify-between text-xs uppercase tracking-widest text-gray-500">
        <span>Compress</span>
        <span>Route</span>
        <span>Restore</span>
      </div>
      <div className="h-1.5 bg-gray-900 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-[#00ff9f] via-[#00cc7a] to-white transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="text-center text-sm text-gray-400">{message}</p>
    </div>
  );
}