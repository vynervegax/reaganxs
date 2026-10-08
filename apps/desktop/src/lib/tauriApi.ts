import { invoke } from '@tauri-apps/api/core';

export type ProcessResult = {
  output_path: string;
  savings_percent: number;
  original_size: number;
  final_size: number;
  model_used: string;
  did_restore: boolean;
  codec?: string;
  vmaf?: number | null;
  message?: string;
  restored?: boolean;
  model_loaded?: boolean;
  restore_skipped_reason?: string;
  stages?: string[];
};

export type HardwareInfo = {
  cpu: string;
  total_memory_mb: number;
  available_memory_mb: number;
  gpu?: string;
};

export type GpuMemoryInfo = {
  total_vram_mb: number;
  used_vram_mb: number;
  available_vram_mb: number;
  device_type: string;
  is_low_memory: boolean;
};

export const tauriApi = {
  processVideo(inputPath: string, model = 'atd-srx4'): Promise<ProcessResult> {
    return invoke('process_video', { inputPath, modelName: model });
  },

  loadModel(modelName: string): Promise<string> {
    return invoke('load_model', { modelName });
  },

  getModelStatus(): Promise<{ loaded: boolean; name?: string }> {
    return invoke('get_model_status');
  },

  getHardwareInfo(): Promise<HardwareInfo> {
    return invoke('get_hardware_info');
  },

  getGpuMemoryInfo(): Promise<GpuMemoryInfo> {
    return invoke('get_gpu_memory_info');
  },

  async pickVideo(): Promise<string | null> {
    const { open } = await import('@tauri-apps/plugin-dialog');
    const selected = await open({
      multiple: false,
      filters: [{ name: 'Video', extensions: ['mp4', 'mov', 'mkv', 'webm'] }],
    });
    if (typeof selected === 'string') return selected;
    return null;
  },
};