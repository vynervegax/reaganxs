import { invoke } from '@tauri-apps/api/core';

export interface ProcessResult {
  output_path: string;
  savings_percent: number;
  model_used: string;
  codec: string;
  original_size: number;
  final_size: number;
  message: string;
  model_loaded: boolean;
  model_name: string | null;
  restored: boolean;
  restore_skipped_reason: string | null;
  stages: string[];
}

export interface ModelStatus {
  loaded: boolean;
  name: string | null;
  metadata?: {
    name: string;
    scale: number;
    description: string;
    weight_file: string;
    tensor_count: number;
  } | null;
  device?: string;
  tensor_count?: number;
}

export interface GpuMemoryInfo {
  total_vram_mb: number;
  used_vram_mb: number;
  available_vram_mb: number;
  device_type: string;
  is_low_memory: boolean;
}

export const tauriApi = {
  processVideo: (
    inputPath: string,
    model?: string,
    allowRealModel?: boolean
  ) =>
    invoke<ProcessResult>('process_video', {
      inputPath,
      model: model ?? null,
      allowRealModel: allowRealModel ?? false,
    }),

  loadModel: (modelName: string, allowRealModel?: boolean) =>
    invoke<string>('load_model', {
      modelName,
      allowRealModel: allowRealModel ?? false,
    }),

  getModelStatus: () => invoke<ModelStatus>('get_model_status'),

  unloadModel: () => invoke<void>('unload_model'),

  getGpuMemoryInfo: () => invoke<GpuMemoryInfo>('get_gpu_memory_info'),

  runVmaf: (reference: string, distorted: string) =>
    invoke<number>('run_vmaf', { reference, distorted }),

  sendContribution: (payload: unknown) =>
    invoke<void>('send_contribution', { payload }),
};