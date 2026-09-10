"use client";

import { useState } from "react";

export default function BeforeAfterSlider() {
  const [position, setPosition] = useState(50);

  return (
    <div className="relative w-full h-96 bg-black rounded-2xl overflow-hidden">
      {/* Simplified slider - you can enhance with real images */}
      <div className="absolute inset-0 flex">
        <div className="relative flex-1 overflow-hidden" style={{ width: `${position}%` }}>
          <div className="absolute inset-0 bg-[url('/before.jpg')] bg-cover" />
        </div>
        <div className="flex-1 bg-[url('/after.jpg')] bg-cover" />
      </div>
      <input
        type="range"
        min="0"
        max="100"
        value={position}
        onChange={(e) => setPosition(Number(e.target.value))}
        className="absolute inset-x-0 bottom-4 w-full accent-[#00ff9f]"
      />
    </div>
  );
}