import { DeviceProfile } from '../types';

export async function getDeviceProfile(): Promise<DeviceProfile> {
  const nav = navigator as any;

  return {
    vram: nav.deviceMemory ? nav.deviceMemory * 1024 : 4096,
    batteryLevel: await getBatteryLevel(),
    isLowPower: !!(nav.getBattery && (await getBatteryLevel()) < 30),
    platform: /Mobi|Android/i.test(navigator.userAgent) ? 'mobile' : 'web',
    thermalState: 'normal',
  };
}

async function getBatteryLevel(): Promise<number> {
  try {
    if ('getBattery' in navigator) {
      const battery = await (navigator as any).getBattery();
      return Math.floor(battery.level * 100);
    }
  } catch {}
  return 100;
}