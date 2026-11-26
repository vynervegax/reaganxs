import { Job } from '../models/Job';
import { compressionService } from '../services/compressionService';
import { restorationService } from '../services/restorationService';
import path from 'path';
import fs from 'fs';

// Replace with your actual queue (BullMQ, etc.)
const queue: string[] = [];

export async function queueJob(jobId: string) {
  queue.push(jobId);
  process.nextTick(() => processQueue());
}

async function processQueue() {
  const jobId = queue.shift();
  if (!jobId) return;

  const job = await Job.findById(jobId);
  if (!job) return;

  try {
    // 1. Upload stage is already done by the client; file is local
    job.status = 'compressing';
    await job.save();

    const inputPath = job.inputPath!; // set by upload handler
    const compressResult = await compressionService.compress(inputPath, {
      tier: job.tier,
      forceVp9: job.forceVp9,
    });

    job.compressedPath = compressResult.outputPath;
    job.codec = compressResult.codec;
    job.savingsPercent = compressResult.savingsPercent;
    job.usedVp9BecauseSlow = compressResult.usedVp9BecauseSlow;
    job.status = 'restoring';
    await job.save();

    // 2. Restore
    const restored = await restorationService.restore(
      compressResult.outputPath,
      'atd-webphoto',
      {
        tier: job.tier,
        savingsPercent: compressResult.savingsPercent,
      }
    );

    job.restoredPath = restored;
    job.status = 'done';
    await job.save();

    // 3. Re-upload to R2 happens here (your existing uploader)
    // await uploadToR2(restored);
  } catch (e: any) {
    job.status = 'failed';
    job.error = e.message;
    await job.save();
  }

  if (queue.length) process.nextTick(() => processQueue());
}