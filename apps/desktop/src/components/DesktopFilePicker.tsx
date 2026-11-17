'use client';

import { useState } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';

export default function DesktopFilePicker() {
  const [file, setFile] = useState<string | null>(null);
  const [model, setModel] = useState<'rgt' | 'atd' | 'bhi'>('atd');
  const [allowReal, setAllowReal] = useState(true);
  const [processing, setProcessing] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [error, setError] = useState<string | null>(null);

  const pickFile = async () => {
    const selected = await open({
      multiple: false,
      filters: [
        {
          name: 'Media',
          extensions: [
            'jpg', 'jpeg', 'png', 'webp', 'bmp', 'tiff', 'gif',
            'mp4', 'mov', 'mkv', 'webm', 'avi', 'm4v', 'ts',
            'mp3', 'wav', 'flac', 'aac', 'm4a', 'ogg',
          ],
        },
      ],
    });
    if (typeof selected === 'string') setFile(selected);
  };

  const process = async () => {
    if (!file) return;
    setProcessing(true);
    setError(null);
    try {
      const res = await invoke('process_video', {
        inputPath: file,
        model,
        allowRealModel: allowReal,
      });
      setResult(res);
    } catch (e: any) {
      setError(e.toString());
    } finally {
      setProcessing(false);
    }
  };

  return (
    <div className="space-y-4 p-6 max-w-xl">
      <button
        onClick={pickFile}
        className="px-6 py-3 rounded-2xl bg-white/10 border border-white/20 hover:bg-white/15"
      >
        {file ? 'Change file' : 'Select image, video, or audio'}
      </button>

      {file && <p className="text-sm text-white/60 truncate">{file}</p>}

      <div className="flex gap-3 items-center">
        <select
          value={model}
          onChange={(e) => setModel(e.target.value as any)}
          className="bg-white/5 border border-white/10 rounded-xl px-4 py-2"
        >
          <option value="rgt">RGT</option>
          <option value="atd">ATD</option>
          <option value="bhi">BHI</option>
        </select>
        <label className="text-sm flex items-center gap-2">
          <input
            type="checkbox"
            checked={allowReal}
            onChange={(e) => setAllowReal(e.target.checked)}
          />
          Premium models
        </label>
      </div>

      <button
        onClick={process}
        disabled={!file || processing}
        className="px-6 py-3 rounded-2xl bg-gradient-to-r from-[#f97316] to-[#c084fc] text-black font-semibold disabled:opacity-50"
      >
        {processing ? 'Processing…' : 'Process'}
      </button>

      {error && <p className="text-red-400 text-sm">{error}</p>}
      {result && (
        <div className="text-sm text-white/80 space-y-1">
          <p>Type: {result.media_type}</p>
          <p>Model: {result.model_used}</p>
          <p>Savings: {result.savings_percent.toFixed(1)}%</p>
          <p>Restored: {result.restored ? 'yes' : 'no'}</p>
          <p>Output: {result.output_path}</p>
        </div>
      )}
    </div>
  );
}