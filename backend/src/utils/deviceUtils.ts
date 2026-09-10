export function parseDeviceProfile(raw: any) {
  return {
    vram: Number(raw.vram) || 4,
    batteryLevel: Number(raw.batteryLevel) || 100,
    isLowPower: raw.isLowPower === 'true' || false,
    platform: raw.platform || 'web',
  };
}