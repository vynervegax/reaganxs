export interface DeviceProfile {
  vram: number;
  batteryLevel: number;
  isLowPower: boolean;
  platform: 'web' | 'desktop' | 'mobile';
  thermalState?: 'normal' | 'warning' | 'critical';
}

export interface ProcessingDecision {
  route: 'edge' | 'cloud';
  model: string;
  shouldRestore: boolean;
  quantization: 'int8' | 'fp16';
  expiryHours: number;
}

export type UserTier = 'free' | 'registered' | 'premium' | 'desktop';