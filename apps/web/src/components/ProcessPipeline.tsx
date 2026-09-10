interface ProcessPipelineProps {
  job: any;
  isLoggedIn?: boolean;
}

export default function ProcessPipeline({ job, isLoggedIn = false }: ProcessPipelineProps) {
  return (
    <div className="backdrop-blur-2xl bg-white/5 border border-white/10 rounded-3xl p-8">
      <div className="text-center mb-6">
        <h3 className="text-2xl font-semibold mb-2">Processing Pipeline</h3>
        <p className="text-gray-400">
          {isLoggedIn ? "Premium Tier • Full Pipeline" : "Demo Mode • Limited Pipeline"}
        </p>
      </div>

      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center text-black font-bold">1</div>
          <div className="flex-1">
            <p className="font-medium">Aggressive Compression (SVT-AV1)</p>
            <p className="text-sm text-gray-400">CRF 28 • Preset 6</p>
          </div>
        </div>

        {isLoggedIn && (
          <div className="flex items-center gap-4">
            <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center text-black font-bold">2</div>
            <div className="flex-1">
              <p className="font-medium">Smart Routing + Restoration</p>
              <p className="text-sm text-gray-400"> ATD SRx4 Finetune  </p>
            </div>
          </div>
        )}

        <div className="flex items-center gap-4">
          <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center text-black font-bold">3</div>
          <div className="flex-1">
            <p className="font-medium">Upload to Cloudflare R2</p>
            <p className="text-sm text-gray-400">
              {isLoggedIn ? "48 hours expiry" : "6 hours expiry"}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}