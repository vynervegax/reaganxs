export type UserTier = 'demo' | 'free' | 'premium' | 'desktop';

export type ModelId =
  | 'bhi'
  | 'purephoto'
  | 'purescale'
  | 'atd'
  | 'rgt';

export type DeviceProfile = {
  vram?: number;
  batteryLevel?: number;
  isLowPower?: boolean;
  thermalState?: 'nominal' | 'fair' | 'serious' | 'critical';
  platform?: 'web' | 'desktop' | 'mobile' | string;
};

export type ProcessingDecision = {
  shouldRestore: boolean;
  model: ModelId | 'compression-only' | string;
  route: 'edge' | 'cloud' | 'hybrid' | 'local';
  reason: string;
  expiryHours: number | null;
  quantization: 'int8' | 'fp16';
  codecPrimary: 'svt-av1' | 'vp9';
  tier: UserTier;
};