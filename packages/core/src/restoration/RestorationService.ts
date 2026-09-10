import { MODEL_FILES, MODEL_DISPLAY } from '../config/constants';

export class RestorationService {
  static getWeightFile(modelId: string): string {
    return MODEL_FILES[modelId] || MODEL_FILES['4x-bhi'];
  }

  static getDisplayName(modelId: string): string {
    return MODEL_DISPLAY[modelId] || modelId;
  }

  /**
   * Platform-agnostic restore contract.
   * Web backend / desktop Tauri implement the actual runner.
   */
  static describe(modelId: string) {
    return {
      modelId,
      weightFile: this.getWeightFile(modelId),
      displayName: this.getDisplayName(modelId),
      scale: 4,
    };
  }
}