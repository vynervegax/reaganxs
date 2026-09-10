import { invoke } from '@tauri-apps/api/core';

export type ProcessResult = {
  output_path: string;
  savings_percent: number;
  model_used: string;
  codec: string;
  original_size: number;
  final_size: number;
  message: string;
  model_loaded: boolean;
  model_name?: string | null;
  restored: boolean;
  restore_skipped_reason?: string | null;
  stages: string[];
};

export const tauriApi = {
  processVideo(inputPath: string, model?: string) {
    return invoke<ProcessResult>('process_video', {
      inputPath,
      model: model ?? null,
    });
  },

  loadModel(modelName: string) {
    return invoke<string>('load_model', { modelName });
  },

  getModelStatus() {
    return invoke<{ loaded: boolean; name?: string | null }>('get_model_status');
  },

  getHardwareInfo() {
    return invoke('get_hardware_info');
  },
};