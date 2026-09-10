export interface DeviceProfile {
  vram: number;
  cpuCores: number;
  batteryLevel: number;
  isLowPower: boolean;
  platform: "web" | "desktop" | "mobile";
  thermalState?: "normal" | "warning" | "critical";
}

export async function getDeviceProfile(): Promise<DeviceProfile> {
  // Web APIs + fallbacks
  const navigatorAny = navigator as any;

  return {
    vram: (navigatorAny.deviceMemory || 4) * 1024,
    cpuCores: navigator.hardwareConcurrency || 4,
    batteryLevel: await getBatteryLevel(),
    isLowPower: !!(navigatorAny.getBattery && (await getBatteryLevel()) < 30),
    platform: /Mobi|Android/i.test(navigator.userAgent) ? "mobile" : "web",
    thermalState: "normal",
  };
}

async function getBatteryLevel(): Promise<number> {
  try {
    if ("getBattery" in navigator) {
      const battery = await (navigator as any).getBattery();
      return battery.level * 100;
    }
  } catch {}
  return 100;
}