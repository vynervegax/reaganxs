import { Queue } from 'bullmq';
import IORedis from 'ioredis';

const connection = new IORedis(process.env.REDIS_URL || 'redis://127.0.0.1:6379', {
  maxRetriesPerRequest: null,
});

export type VideoJobData = {
  jobId: string;
  filePath?: string;
  originalSize: number;
  userId?: string | null;
  tier?: string;
  preferredModel?: string;
  deviceProfile?: Record<string, unknown>;
  skipCompress?: boolean;
  compressedSize?: number;
  codec?: string;
  r2Key?: string;
  resumeFrom?: 'restore' | string;
  compressedKey?: string;
  /** skeletal multi-media */
  mediaKind?: 'video' | 'image' | 'audio' | 'text' | 'custom';
  mimeType?: string;
  originalFilename?: string;
};

export const videoQueue = new Queue<VideoJobData>('video-process', {
  connection,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 1,
  },
});

export async function enqueueMediaJob(
  data: VideoJobData,
  opts?: { priority?: number }
) {
  return videoQueue.add('process', data, {
    priority: opts?.priority ?? 5,
    jobId: undefined,
  });
}