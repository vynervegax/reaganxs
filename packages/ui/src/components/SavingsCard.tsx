interface SavingsCardProps {
  savingsPercent: number;
  model: string;
  onShare?: () => void;
}

export default function SavingsCard({ savingsPercent, model, onShare }: SavingsCardProps) {
  return (
    <div className="bg-gradient-to-br from-zinc-950 to-black border border-[#00ff9f]/30 rounded-2xl p-8 text-center">
      <div className="text-7xl font-mono font-bold text-[#00ff9f] mb-2">
        {savingsPercent}%
      </div>
      <p className="text-lg text-gray-400 mb-6">Bandwidth Saved</p>
      <p className="text-sm text-gray-500 mb-6">with {model.toUpperCase()}</p>

      {onShare && (
        <button
          onClick={onShare}
          className="bg-white hover:bg-gray-100 text-black px-8 py-3 rounded-xl font-medium transition"
        >
          Share Savings Card
        </button>
      )}
    </div>
  );
}