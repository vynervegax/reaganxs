import type { UserTier } from '../config/tiers';
import { SmartRouter, type RouteInput } from '../routing/SmartRouter';
import { RestorationService } from '../restoration/RestorationService';
import {
  COMPRESSION_CODECS,
  SVT_AV1_PRESETS,
  VP9_SETTINGS,
  AUDIO_SETTINGS,
  MODEL_IDS,
} from '../config/constants';
import type { DeviceProfile } from '../config/decisionRules';

export type CompressFn = (args: {
  inputPath: string;
  outputPath: string;
  codec: 'libsvtav1' | 'libvpx-vp9';
  preset?: number;
  crf: number;
}) => Promise<{ outputPath: string; size: number }>;

export type StatFn = (path: string) => Promise<number>;

export type ProcessVideoInput = {
  inputPath: string;
  tier: UserTier;
  deviceProfile?: DeviceProfile | null;
  requestedModel?: string | null;
  platform?: 'web' | 'desktop' | 'mvp';
  /** Host-provided: real FFmpeg / native compress */
  compress: CompressFn;
  /** Host-provided: file size */
  stat: StatFn;
  /** Host-provided optional restore runner */
  runEnhance?: RestorationService extends never
    ? never
    : Parameters<typeof RestorationService.restore>[0]['runEnhance'];
  workDir?: string;
};

export type ProcessVideoResult = {
  success: boolean;
  outputPath: string;
  originalSize: number;
  compressedSize: number;
  finalSize: number;
  savingsPercent: number;
  modelUsed: string;
  didRestore: boolean;
  route: string;
  reason: string;
  codec: string;
  expiryHours: number;
  quantization: 'int8' | 'fp16';
};

/**
 * Orchestrator: Compress → Route → Restore (selective)
 * Always compress first with SVT-AV1, fallback VP9.
 * Never libx264 / libx265 on the product path.
 */
export class VideoProcessor {
  static async process(input: ProcessVideoInput): Promise<ProcessVideoResult> {
    const originalSize = await input.stat(input.inputPath);
    const base = input.inputPath.replace(/\.[^.]+$/, '');
    const av1Out = `${base}_compressed_av1.mp4`;
    const vp9Out = `${base}_compressed_vp9.webm`;

    let compressedPath = '';
    let codec: 'libsvtav1' | 'libvpx-vp9' = 'libsvtav1';
    let compressedSize = 0;

    // 1. ALWAYS COMPRESS — SVT-AV1 then VP9
    try {
      const preset = SVT_AV1_PRESETS.aggressive;
      const r = await input.compress({
        inputPath: input.inputPath,
        outputPath: av1Out,
        codec: 'libsvtav1',
        preset: preset.preset,
        crf: preset.crf,
      });
      compressedPath = r.outputPath;
      compressedSize = r.size || (await input.stat(r.outputPath));
      codec = 'libsvtav1';
    } catch (e: any) {
      const r = await input.compress({
        inputPath: input.inputPath,
        outputPath: vp9Out,
        codec: 'libvpx-vp9',
        crf: VP9_SETTINGS.crf,
      });
      compressedPath = r.outputPath;
      compressedSize = r.size || (await input.stat(r.outputPath));
      codec = 'libvpx-vp9';
    }

    if (!compressedPath || compressedSize <= 0) {
      throw new Error('Compression failed: SVT-AV1 and VP9 both failed');
    }

    const savingsPercent = Math.max(
      0,
      Math.round(
        ((originalSize - compressedSize) / Math.max(originalSize, 1)) * 100
      )
    );

    // 2. SMART ROUTE
    const routeInput: RouteInput = {
      tier: input.tier,
      deviceProfile: input.deviceProfile,
      compressionSavingsPercent: savingsPercent,
      requestedModel: input.requestedModel,
      platform: input.platform,
    };
    const decision = SmartRouter.route(routeInput);

    let finalPath = compressedPath;
    let modelUsed = MODEL_IDS.COMPRESSION_ONLY;
    let didRestore = false;
    let reason = decision.reason || `Compressed with ${codec} (${savingsPercent}% savings).`;

    // 3. SELECTIVE RESTORE
    if (decision.shouldRestore && decision.model !== MODEL_IDS.COMPRESSION_ONLY) {
      const restoreResult = await RestorationService.restore({
        inputPath: compressedPath,
        modelId: decision.model,
        tier: input.tier,
        quantization: decision.quantization,
        runEnhance: input.runEnhance,
      });

      if (!restoreResult.skipped) {
        const restoredSize = await input.stat(restoreResult.outputPath);
        const stillSaves = restoredSize < originalSize * 0.95;
        const notMuchWorse = restoredSize <= compressedSize * 1.2;

        if (stillSaves && notMuchWorse) {
          finalPath = restoreResult.outputPath;
          modelUsed = restoreResult.modelUsed;
          didRestore = true;
          reason = restoreResult.reason;
        } else {
          reason =
            'Restoration did not preserve bandwidth savings. Kept compression-only.';
          modelUsed = MODEL_IDS.COMPRESSION_ONLY;
          didRestore = false;
          finalPath = compressedPath;
        }
      } else {
        reason = restoreResult.reason;
        modelUsed = MODEL_IDS.COMPRESSION_ONLY;
        didRestore = false;
      }
    }

    const finalSize = await input.stat(finalPath);
    const finalSavings = Math.max(
      0,
      Math.round(
        ((originalSize - finalSize) / Math.max(originalSize, 1)) * 100
      )
    );

    return {
      success: true,
      outputPath: finalPath,
      originalSize,
      compressedSize,
      finalSize,
      savingsPercent: finalSavings,
      modelUsed,
      didRestore,
      route: decision.route,
      reason,
      codec,
      expiryHours: decision.expiryHours,
      quantization: decision.quantization,
    };
  }

  static readonly supportedCodecs = COMPRESSION_CODECS;
  static readonly audio = AUDIO_SETTINGS;
}

export default VideoProcessor;