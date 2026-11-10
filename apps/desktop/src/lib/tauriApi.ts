import { invoke } from '@tauri-apps/api/core';

export type ProcessResult = {
  output_path: string;
  savings_percent: number;
  model_used: string;
  codec?: string;
  original_size?: number;
  final_size?: number;
  message?: string;
  model_loaded?: boolean;
  model_name?: string | null;
  restored?: boolean;
  restore_skipped_reason?: string | null;
  stages?: string[];
  job_id?: string | null;
};

export const tauriApi = {
  processVideo(
    inputPath: string,
    model?: string,
    allowRealModel = false
  ) {
    return invoke<ProcessResult>('process_video', {
      inputPath,
      model: model ?? null,
      allowRealModel,
    });
  },

  loadModel(modelName: string, allowRealModel = false) {
    return invoke<string>('load_model', {
      modelName,
      allowRealModel,
    });
  },

  getModelStatus() {
    return invoke<{ loaded: boolean; name?: string | null }>(
      'get_model_status'
    );
  },

  unloadModel() {
    return invoke<void>('unload_model');
  },
};