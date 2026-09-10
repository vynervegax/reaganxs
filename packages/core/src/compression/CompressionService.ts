import { exec } from 'child_process';
import { promisify } from 'util';
import fs from 'fs';
import path from 'path';

const execAsync = promisify(exec);

export class CompressionService {
  async compress(
    input: File | string,
    outputPath?: string
  ): Promise<{ outputPath: string; size: number; codec: string; buffer?: ArrayBuffer }> {
    try {
      const inputPath = input instanceof File ? await this.saveTempFile(input) : input;
      const finalOutput = outputPath || path.join('/tmp', `compressed_${Date.now()}.mp4`);

      const command = `ffmpeg -i "${inputPath}" -c:v libsvtav1 -preset 6 -crf 28 -pix_fmt yuv420p "${finalOutput}"`;

      await execAsync(command);

      const buffer = fs.readFileSync(finalOutput);
      const stats = fs.statSync(finalOutput);

      return {
        outputPath: finalOutput,
        size: stats.size,
        codec: 'av1',
        buffer: buffer.buffer as ArrayBuffer,
      };
    } catch (error) {
      console.error('Compression failed:', error);
      throw new Error(`SVT-AV1 compression failed: ${error}`);
    }
  }

  private async saveTempFile(file: File): Promise<string> {
    const tempPath = path.join('/tmp', `upload_${Date.now()}.tmp`);
    const buffer = await file.arrayBuffer();
    fs.writeFileSync(tempPath, new Uint8Array(buffer));
    return tempPath;
  }
}