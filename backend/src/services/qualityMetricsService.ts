// backend/src/services/qualityMetricsService.ts

import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';

const execAsync = promisify(exec);

export const qualityMetricsService = {
  /**
   * Run VMAF between original and processed video.
   * Requires ffmpeg compiled with --enable-libvmaf
   */
  async runVMAF(originalPath: string, processedPath: string): Promise<{ vmafScore: number }> {
    if (!fs.existsSync(originalPath) || !fs.existsSync(processedPath)) {
      return { vmafScore: 0 };
    }

    const logFile = `/tmp/vmaf_${Date.now()}.json`;

    try {
      // Basic VMAF command (adjust model path if needed)
      const cmd = `ffmpeg -i "${processedPath}" -i "${originalPath}" \
        -lavfi libvmaf=log_path=${logFile}:log_fmt=json \
        -f null -`;

      await execAsync(cmd);

      if (fs.existsSync(logFile)) {
        const data = JSON.parse(fs.readFileSync(logFile, 'utf-8'));
        const score = data?.pooled_metrics?.vmaf?.min ?? data?.VMAF_score ?? 0;
        fs.unlinkSync(logFile);
        return { vmafScore: Math.round(score * 100) / 100 };
      }

      return { vmafScore: 0 };
    } catch (err) {
      console.warn('[VMAF] Failed, returning 0:', err);
      return { vmafScore: 0 };
    }
  },
};