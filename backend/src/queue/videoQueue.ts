import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const connection = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: null,
});

export const videoQueue = new Queue('video-process', { connection });

export type VideoJobData = {
  jobId: string;
  filePath: string;
  originalFilename: string;
  originalSize: number;
  compressedSize?: number;
  codec?: string;
  skipCompress?: boolean;
  userId: string | null;
  tier: string;
  preferredModel?: string;
  deviceProfile: any;
  r2Key?: string;
};