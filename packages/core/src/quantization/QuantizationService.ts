export class QuantizationService {
  getOptimizedConfig(deviceProfile: any) {
    return {
      precision: deviceProfile.isLowPower ? 'int8' : 'fp16',
      modelSize: deviceProfile.vram > 12 ? 'large' : 'medium',
    };
  }
}