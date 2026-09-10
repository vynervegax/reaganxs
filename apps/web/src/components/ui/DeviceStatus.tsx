interface DeviceStatusProps {
  deviceProfile: {
    vram: number;
    batteryLevel: number;
    isLowPower: boolean;
    platform?: string;
  };
}

export default function DeviceStatus({ deviceProfile }: DeviceStatusProps) {
  return (
    <div className="text-xs flex gap-6 text-gray-500 bg-zinc-900 px-4 py-2 rounded-xl">
      <div>
        Battery: <span className="text-[#00ff9f]">{deviceProfile.batteryLevel}%</span>
      </div>
      <div>
        VRAM: <span className="text-[#00ff9f]">{Math.round(deviceProfile.vram / 1024)}GB</span>
      </div>
      <div>
        Mode: <span className={deviceProfile.isLowPower ? "text-amber-400" : "text-emerald-400"}>
          {deviceProfile.isLowPower ? "Power Save" : "Performance"}
        </span>
      </div>
    </div>
  );
}