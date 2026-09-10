//dekstop

import { useState } from 'react';
import { tauriApi } from '../lib/tauriApi';

const MODELS = [
  {
    id: '4x-purephoto',
    displayName: '4x PurePhoto RealPLSKR',
    powerLevel: 'Balanced',
    file: '4xPurePhoto-RealPLSKR.pth',
  },
  {
    id: 'rgt-s',
    displayName: 'RGT-S x4',
    powerLevel: 'High',
    file: 'RGT_S_x4.pth',
  },
  {
    id: 'atd-srx4',
    displayName: 'ATD SRx4 Finetune',
    powerLevel: 'Ultra',
    file: '003_ATD_SRx4_finetune.pth',
    isBest: true,
  },
];

export default function ModelSelector({
  defaultModel = 'atd-srx4',
  onModelChange,
}: {
  defaultModel?: string;
  onModelChange?: (id: string) => void;
}) {
  const [selected, setSelected] = useState(defaultModel);
  const [loading, setLoading] = useState(false);

  const handle = async (id: string) => {
    setLoading(true);
    setSelected(id);
    try {
      await tauriApi.loadModel(id);
      onModelChange?.(id);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="backdrop-blur-2xl bg-white/5 border border-white/10 rounded-3xl p-8 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-xl font-semibold">Restoration model</h3>
        <span className="text-xs px-3 py-1 rounded-full bg-gradient-to-r from-[#f97316] to-[#c084fc] text-black font-medium">
          DESKTOP
        </span>
      </div>

      <div className="grid gap-3">
        {MODELS.map((m) => (
          <button
            key={m.id}
            type="button"
            disabled={loading}
            onClick={() => handle(m.id)}
            className={`p-5 rounded-2xl border text-left flex justify-between items-center transition ${
              selected === m.id
                ? 'border-[#f97316] bg-white/10 shadow-lg shadow-[#f97316]/15'
                : 'border-white/10 hover:border-white/30'
            }`}
          >
            <div>
              <div className="font-semibold">{m.displayName}</div>
              <div className="text-xs text-white/40 mt-1">
                {m.powerLevel} · {m.file}
              </div>
            </div>
            {m.isBest && (
              <span className="text-xs bg-[#c084fc] text-black px-2 py-0.5 rounded-full">
                BEST
              </span>
            )}
          </button>
        ))}
      </div>

      {loading && (
        <p className="text-center text-sm text-[#f97316]">Loading model…</p>
      )}
    </div>
  );
}