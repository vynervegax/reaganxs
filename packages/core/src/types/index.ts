// packages/core/src/types/index.ts

export type UserTier = 'demo' | 'free' | 'premium' | 'desktop';

export type ModelId =
  | 'real-esrgan'
  | 'nmkd-siax'
  | '4x-nmkd-superscale'
  | '4x-nomos-webphoto-realplksr';

export type PowerLevel = 'low' | 'medium' | 'high' | 'ultra';
export type Quantization = 'int8' | 'fp16' | 'fp32';
export type ModelSource = 'local' | 'r2' | 'online';

export interface ModelMetadata {
  id: ModelId;
  name: string;
  displayName: string;
  filename: string;           // actual file in backend/models/
  scale: number;
  powerLevel: PowerLevel;
  minVRAM_GB: number;
  defaultQuantization: Quantization;
  recommendedFor: string[];
  source: ModelSource;
  description: string;
  version: string;
}

export interface DeviceProfile {
  vram: number;               // GB
  batteryLevel: number;       // 0-100
  isLowPower: boolean;
  platform: 'web' | 'desktop' | 'mobile';
  thermalState?: 'nominal' | 'fair' | 'serious' | 'critical';
}

export interface ProcessingDecision {
  shouldRestore: boolean;
  model: ModelId;
  quantization: Quantization;
  route: 'edge' | 'cloud' | 'local';
  expiryHours: number;
  reason: string;
}

export interface CompressionPreset {
  codec: 'svt-av1' | 'vp9';
  preset: number;
  crf: number;
}