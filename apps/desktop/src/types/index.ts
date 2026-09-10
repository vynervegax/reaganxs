// apps/desktop/src/types/index.ts
// Ladder: BHI → PurePhoto → PureScale → ATD + RGT

export type ModelId =
  | 'bhi'
  | 'purephoto'
  | 'purescale'
  | 'atd'
  | 'rgt';

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
    { id: 'purephoto', label: 'PurePhoto', minVramGB: 6 },
    { id: 'purescale', label: 'PureScale', minVramGB: 8 },
    { id: 'atd', label: 'ATD', minVramGB: 10 },
    { id: 'rgt', label: 'RGT', minVramGB: 12 },
  ];

export const DEFAULT_DESKTOP_MODEL: ModelId = 'atd';