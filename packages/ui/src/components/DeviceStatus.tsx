interface DeviceStatusProps {
  deviceProfile: any;
}

export default function DeviceStatus({ deviceProfile }: DeviceStatusProps) {
  return (
    <div className="flex gap-6 text-xs text-gray-500">
      <div>Battery: <span className="text-[#00ff9f]">{deviceProfile.batteryLevel}%</span></div>
      <div>VRAM: <span className="text-[#00ff9f]">{deviceProfile.vram}GB</span></div>
      <div>Mode: <span className={deviceProfile.isLowPower ? "text-amber-400" : "text-emerald-400"}>
        {deviceProfile.isLowPower ? "Power Save" : "Performance"}
      </span></div>
    </div>
  );
}