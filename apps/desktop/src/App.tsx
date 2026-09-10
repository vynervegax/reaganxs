import { useEffect, useState } from 'react';
import UploadZone from './components/UploadZone';
import ProgressBar from './components/ProgressBar';
import ModelSelector from './components/ModelSelector';
import HardwareInfo from './components/HardwareInfo';
import SettingsPanel from './components/SettingsPanel';
import BeforeAfter from './components/BeforeAfter';
import RestoreStatus from './components/RestoreStatus';
import { tauriApi, type ProcessResult } from './lib/tauriApi';

export default function App() {
  const [result, setResult] = useState<ProcessResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [stage, setStage] = useState('idle');
  const [selectedModel, setSelectedModel] = useState('4x-purephoto-realplksr');
  const [modelStatus, setModelStatus] = useState<{
    loaded: boolean;
    name?: string | null;
  }>({ loaded: false });

  useEffect(() => {
    tauriApi
      .getModelStatus?.()
      .then((s: any) =>
        setModelStatus({ loaded: !!s?.loaded, name: s?.name ?? null })
      )
      .catch(() => setModelStatus({ loaded: false }));
  }, []);

  const handleUpload = async (filePath: string) => {
    setIsProcessing(true);
    setError(null);
    setResult(null);
    setProgress(10);
    setStage('compressing');

    try {
      setProgress(40);
      const res = await tauriApi.processVideo(filePath, selectedModel);
      setProgress(100);
      setStage('complete');
      setResult(res);
      setError(null);
    } catch (e: any) {
      setError(e?.message || String(e) || 'Processing failed');
      setResult(null);
      setStage('error');
    } finally {
      setIsProcessing(false);
    }
  };

  const handleModelChange = async (modelId: string) => {
    setSelectedModel(modelId);
    try {
      await tauriApi.loadModel(modelId);
      setModelStatus({ loaded: true, name: modelId });
    } catch {
      setModelStatus({ loaded: false, name: null });
    }
  };

  return (
    <div className="min-h-screen bg-[#1c140f] text-white relative overflow-hidden">
      <div className="relative max-w-4xl mx-auto px-6 py-8 space-y-8">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
              <span className="bg-gradient-to-r from-[#f97316] via-[#e879f9] to-[#c084fc] bg-clip-text text-transparent">
                ReaganXS
              </span>
            </h1>
            <p className="text-sm text-[#c084fc]/80 mt-1">
              Desktop · compress first · restore selectively
            </p>
          </div>
          <span className="text-xs px-4 py-1.5 rounded-full bg-gradient-to-r from-[#f97316] to-[#c084fc] text-black font-semibold shadow-lg shadow-[#c084fc]/25">
            LOCAL GPU
          </span>
        </div>

        <HardwareInfo />

        <ModelSelector
          defaultModel={selectedModel}
          onModelChange={handleModelChange}
        />

        <div className="text-xs">
          <span className="text-white/40">Model session · </span>
          <span className={modelStatus.loaded ? 'text-[#c084fc]' : 'text-amber-300'}>
            {modelStatus.loaded
              ? `Loaded (${modelStatus.name})`
              : 'Not loaded — compression still works'}
          </span>
        </div>

        {!result && !isProcessing && (
          <UploadZone onUpload={handleUpload} isProcessing={isProcessing} />
        )}

        {isProcessing && (
          <ProgressBar
            stage={stage}
            progress={progress}
            message={
              stage === 'compressing'
                ? 'Compressing (SVT-AV1 → VP9)…'
                : 'Working…'
            }
          />
        )}

        {error && (
          <div className="rounded-2xl border border-red-500/40 bg-red-500/10 text-red-200 p-4 text-sm">
            {error}
          </div>
        )}

        {result && (
          <div className="space-y-6">
            <div className="rounded-3xl border border-[#c084fc]/35 bg-gradient-to-br from-[#c084fc]/15 via-transparent to-[#f97316]/10 p-5">
              <p className="text-[#c084fc] font-medium text-sm">Processing complete</p>
              <p className="text-xs text-white/50 mt-1">{result.message}</p>
            </div>

            <div className="grid sm:grid-cols-3 gap-4">
              {[
                { label: 'Codec', value: result.codec },
                {
                  label: 'Savings',
                  value: `${result.savings_percent}%`,
                  accent: true,
                },
                { label: 'Output', value: result.output_path, mono: true },
              ].map((card) => (
                <div
                  key={card.label}
                  className="rounded-2xl border border-[#c084fc]/20 bg-white/5 p-4 backdrop-blur-md"
                >
                  <p className="text-xs text-[#c084fc]/70 mb-1">{card.label}</p>
                  <p
                    className={`${
                      card.accent
                        ? 'font-semibold text-transparent bg-gradient-to-r from-[#f97316] to-[#c084fc] bg-clip-text'
                        : card.mono
                        ? 'font-mono text-xs break-all text-white/70'
                        : 'font-medium'
                    }`}
                  >
                    {card.value}
                  </p>
                </div>
              ))}
            </div>

            <RestoreStatus
              restored={result.restored}
              modelUsed={result.model_used}
              modelLoaded={result.model_loaded}
              restoreSkippedReason={result.restore_skipped_reason}
              stages={result.stages}
            />

            <BeforeAfter
              originalSize={result.original_size}
              finalSize={result.final_size}
            />

            <button
              type="button"
              onClick={() => {
                setResult(null);
                setError(null);
                setProgress(0);
                setStage('idle');
              }}
              className="px-6 py-3 rounded-2xl border border-[#c084fc]/40 text-[#c084fc] hover:bg-[#c084fc]/10 text-sm transition"
            >
              Process another
            </button>
          </div>
        )}

        <SettingsPanel />
      </div>
    </div>
  );
}