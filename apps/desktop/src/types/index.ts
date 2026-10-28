// apps/desktop/src/types/index.ts
// Ladder: RGT-S x4 → ATD SRx4 Finetune -> Real Web Photo RGT and ATD

export type ModelId =
  | '4x-bhi'
  | 'rgt-s'
  | 'atd-srx4'
  | 'rgt-webphoto'
  | 'atd-webphoto';

export type ProcessingStage =
  | 'idle'
  | 'compressing'
  | 'routing'
  | 'restoring'
  | 'encoding'
  | 'complete'
  | 'error';

export type PowerProfile = 'performance' | 'balanced' | 'power-save';

export interface DeviceProfile {
  vram: number;
  batteryLevel: number;
  isLowPower: boolean;
  platform: 'desktop';
  thermalState?: 'nominal' | 'fair' | 'serious' | 'critical';
}

/** Matches Tauri process_video ProcessResult (camelCase mapped on JS side if needed) */
export interface ProcessResult {
  outputPath: string;
  savingsPercent: number;
  modelUsed: ModelId | 'compression-only' | string;
  codec?: string;
  originalSize?: number;
  finalSize?: number;
  message?: string;
  modelLoaded?: boolean;
  modelName?: string | null;
  restored?: boolean;
  restoreSkippedReason?: string | null;
  stages?: string[];
  vmafScore?: number | null;
  beforePath?: string;
  afterPath?: string;
}

export interface HardwareInfo {
  gpuName?: string;
  vramGB?: number;
  cpuName?: string;
  totalMemoryGB?: number;
  batteryLevel?: number;
  isLowPower?: boolean;
}

export interface GpuMemoryInfo {
  total_vram_mb: number;
  used_vram_mb: number;
  available_vram_mb: number;
  device_type: string;
  is_low_memory: boolean;
}

export interface AppSettings {
  powerProfile: PowerProfile;
  runVmaf: boolean;
  contributeData: boolean;
  preferredModel: ModelId;
}

export const DESKTOP_MODELS: { id: ModelId; label: string; minVramGB: number }[] =
  [
    { id: '4x-bhi', label: '4x BHI RealPLKSR', minVramGB: 4 },
    { id: 'rgt-s', label: 'RGT-S x4', minVramGB: 8 },
    { id: 'atd-srx4', label: 'ATD SRx4 Finetune', minVramGB: 10 },
  ];

export const DEFAULT_DESKTOP_MODEL: ModelId = 'atd-srx4';