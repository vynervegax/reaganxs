"use client";

import { useState } from "react";

interface ModelSelectorProps {
  onChange?: (model: string) => void;
  defaultModel?: string;
}

export default function ModelSelector({ onChange, defaultModel = "real-esrgan" }: ModelSelectorProps) {
  const [selected, setSelected] = useState(defaultModel);

  const handleChange = (model: string) => {
    setSelected(model);
    onChange?.(model);
  };

  return (
    <div className="space-y-3">
      <label className="text-sm font-medium">Restoration Model</label>
      <div className="grid grid-cols-3 gap-3">
        {["cugan", "real-esrgan", "nomos8k"].map((model) => (
          <button
            key={model}
            onClick={() => handleChange(model)}
            className={`p-4 rounded-xl border text-sm font-medium transition-all ${
              selected === model
                ? "border-[#00ff9f] bg-black/60 text-[#00ff9f]"
                : "border-gray-800 hover:border-gray-600"
            }`}
          >
            {model.replace("-", " ").toUpperCase()}
          </button>
        ))}
      </div>
    </div>
  );
}