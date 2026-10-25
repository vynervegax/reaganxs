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

/** Remove waiting/delayed Bull jobs that match a Mongo job id */
export async function removeQueuedBullJobs(mongoJobId: string): Promise<number> {
  const states = ['waiting', 'delayed', 'paused'] as const;
  let removed = 0;

  for (const state of states) {
    const jobs = await videoQueue.getJobs([state], 0, 200);
    for (const j of jobs) {
      if (j.data?.jobId === String(mongoJobId)) {
        await j.remove();
        removed++;
      }
    }
  }
  return removed;
}