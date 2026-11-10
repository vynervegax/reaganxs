import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import type { MediaKind } from '../config/mediaKinds';

const connection = new IORedis(
  process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  { maxRetriesPerRequest: null }
);

export type VideoJobData = {
  jobId: string;
  filePath?: string;
  originalFilename?: string;
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
  mediaKind?: MediaKind;
  mimeType?: string;
};

export const videoQueue = new Queue<VideoJobData>('video-process', {
  connection,
  defaultJobOptions: {
    removeOnComplete: 100,
    removeOnFail: 50,
    attempts: 1,
  },
});

export async function removeQueuedBullJobs(
  processingJobId: string
): Promise<number> {
  let removed = 0;
  const jobs = await videoQueue.getJobs(['waiting', 'delayed']);
  for (const j of jobs) {
    const data = j.data as VideoJobData;
    if (data?.jobId === processingJobId) {
      try {
        await j.remove();
        removed += 1;
      } catch {
        /* ignore */
      }
    }
  }
  return removed;
}

export async function enqueueMediaJob(
  data: VideoJobData,
  opts?: { priority?: number }
) {
  return videoQueue.add('process', data, {
    priority: opts?.priority ?? 5,
  });
}