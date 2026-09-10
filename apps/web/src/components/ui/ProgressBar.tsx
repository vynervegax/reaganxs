interface Props {
  stage: string;
  progress: number;
  message: string;
}

export default function ProgressBar({ stage, progress, message }: Props) {
  return (
    <div className="glass rounded-3xl p-8">
      <div className="flex justify-between items-center mb-3">
        <span className="font-medium">{message}</span>
        <span className="text-[#c084fc]">{progress}%</span>
      </div>
      <div className="h-2 bg-white/10 rounded-full overflow-hidden">
        <div 
          className="h-full bg-gradient-to-r from-[#f97316] to-[#c084fc] transition-all duration-500"
          style={{ width: `${progress}%` }}
        />
      </div>
      <p className="text-xs text-gray-500 mt-3 capitalize">Stage: {stage}</p>
    </div>
  );
}