import { useState } from 'react';

export default function SettingsPanel() {
  const [open, setOpen] = useState(false);
  const [powerMode, setPowerMode] = useState<'balanced' | 'performance' | 'power-save'>(
    'balanced'
  );
  const [autoRestore, setAutoRestore] = useState(true);
  const [contribute, setContribute] = useState(false);

  return (
    <>
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full backdrop-blur-2xl bg-white/5 border border-white/10 rounded-3xl p-6 text-left hover:bg-white/10 transition"
      >
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-semibold">Settings</h3>
            <p className="text-sm text-white/50 mt-1">Power · restore · license</p>
          </div>
          <span className="text-white/40 text-xl">⚙️</span>
        </div>
      </button>

      {/* Modal */}
      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Backdrop — click to close */}
          <button
            type="button"
            aria-label="Close settings"
            className="absolute inset-0 bg-black/70 backdrop-blur-sm"
            onClick={() => setOpen(false)}
          />

          {/* Panel */}
          <div
            role="dialog"
            aria-modal="true"
            className="relative z-10 w-full max-w-md backdrop-blur-2xl bg-[#1c140f]/95 border border-white/15 rounded-3xl p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-semibold">Settings</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-lg"
                aria-label="Close"
              >
                ✕
              </button>
            </div>

            <div className="space-y-5">
              <div>
                <label className="text-sm text-white/60 block mb-2">Power mode</label>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      ['power-save', 'Save'],
                      ['balanced', 'Balanced'],
                      ['performance', 'Perf'],
                    ] as const
                  ).map(([id, label]) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setPowerMode(id)}
                      className={`py-2 rounded-xl text-sm border transition ${
                        powerMode === id
                          ? 'border-[#f97316] bg-[#f97316]/20 text-white'
                          : 'border-white/10 text-white/60 hover:border-white/30'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              <label className="flex items-center justify-between gap-4 cursor-pointer">
                <span className="text-sm">Auto-restore when beneficial</span>
                <input
                  type="checkbox"
                  checked={autoRestore}
                  onChange={(e) => setAutoRestore(e.target.checked)}
                  className="w-5 h-5 accent-[#f97316]"
                />
              </label>

              <label className="flex items-center justify-between gap-4 cursor-pointer">
                <span className="text-sm">Anon dataset contribution</span>
                <input
                  type="checkbox"
                  checked={contribute}
                  onChange={(e) => setContribute(e.target.checked)}
                  className="w-5 h-5 accent-[#c084fc]"
                />
              </label>

              <p className="text-xs text-white/40">
                Desktop tier · local processing · restore never overrides strong compression.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setOpen(false)}
              className="mt-6 w-full py-3 rounded-2xl font-semibold text-black bg-gradient-to-r from-[#f97316] to-[#c084fc] hover:opacity-90"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </>
  );
}