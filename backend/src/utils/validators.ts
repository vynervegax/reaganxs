import { z } from 'zod';

export const videoUploadSchema = z.object({
  deviceProfile: z.object({
    vram: z.number(),
    batteryLevel: z.number(),
    isLowPower: z.boolean(),
  }).optional(),
});

export const validateFile = (file: Express.Multer.File) => {
  if (!file.mimetype.startsWith('video/')) {
    throw new Error('Only video files are allowed');
  }
  if (file.size > 2 * 1024 * 1024 * 1024) { // 2GB
    throw new Error('File too large');
  }
};