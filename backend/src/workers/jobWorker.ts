// backend/src/workers/jobWorker.ts
import { Job, IJob } from '../models/Job';
import { compressionService } from '../services/compressionService';
import { restorationService } from '../services/restorationService';
import { r2 } from '../lib/r2'; // your existing R2 helper
import path from 'path';
import fs from 'fs';
import os from 'os';

const COMPRESSED_PREFIX = 'compressed/';
const SAMPLES_PREFIX = 'samples/';
const PROCESSED_PREFIX = 'processed/';
const UPLOADS_PREFIX = 'uploads/';

async function existsInR2(key: string): Promise<boolean> {
  try {
    await r2.head(key);
    return true;
  } catch {
    return false;
  }
}

async function downloadToTemp(key: string, suffix: string): Promise<string> {
  const tmp = path.join(os.tmpdir(), `reaganxs-${Date.now()}${suffix}`);
  const stream = await r2.getStream(key);
  const ws = fs.createWriteStream(tmp);
  await new Promise((resolve, reject) => {
    stream.pipe(ws);
    stream.on('error', reject);
    ws.on('finish', resolve);
    ws.on('error', reject);
  });
  return tmp;
}

async function uploadFile(key: string, localPath: string, contentType = 'video/mp4') {
  await r2.putFile(key, localPath, contentType);
}

async function safeUnlink(p?: string) {
  if (!p) return;
  try { fs.unlinkSync(p); } catch { /* ignore */ }
}

export async function processJob(jobId: string) {
  const job = await Job.findById(jobId);
  if (!job) return;

  let localUpload: string | undefined;
  let localCompressed: string | undefined;
  let localRestored: string | undefined;

  try {
    job.status = 'processing';
    await job.save();

    // ---------- 1. Compression stage ----------
    const compressedKey = `${COMPRESSED_PREFIX}${job.id}`;
    const compressedExists = job.compressedKey && await existsInR2(job.compressedKey);

    if (compressedExists) {
      console.log(`[job ${job.id}] resume: compressed object exists`);
      localCompressed = await downloadToTemp(job.compressedKey!, path.extname(job.compressedKey!));
    } else {
      // Need original upload
      if (!job.uploadKey || !(await existsInR2(job.uploadKey))) {
        throw new Error('Upload object missing or expired — cannot restart compression');
      }
      localUpload = await downloadToTemp(job.uploadKey, path.extname(job.uploadKey));

      job.status = 'compressing';
      await job.save();

      const result = await compressionService.compress(localUpload, {
        tier: job.tier,
        forceVp9: job.forceVp9,
      });

      localCompressed = result.outputPath;
      job.codec = result.codec;
      job.savingsPercent = result.savingsPercent;
      job.usedVp9BecauseSlow = result.usedVp9BecauseSlow;

      // Persist checkpoint
      await uploadFile(compressedKey, localCompressed);
      job.compressedKey = compressedKey;
      await job.save();
    }

    // ---------- 2. Restoration stage ----------
    const processedKey = `${PROCESSED_PREFIX}${job.id}.mp4`;
    const processedExists = job.processedKey && await existsInR2(job.processedKey);

    if (processedExists) {
      console.log(`[job ${job.id}] resume: processed object exists`);
      localRestored = await downloadToTemp(job.processedKey!, '.mp4');
    } else {
      job.status = 'restoring';
      await job.save();

      try {
        localRestored = await restorationService.restore(
          localCompressed!,
          job.model || 'atd-webphoto',
          {
            tier: job.tier,
            savingsPercent: job.savingsPercent,
          }
        );
      } catch (e) {
        // Fallback: partial frames
        console.warn(`[job ${job.id}] full restore failed, trying partial frames`);
        const partial = await restorationService.restorePartialFrames(
          localCompressed!,
          job.model || 'atd-webphoto',
          { tier: job.tier, savingsPercent: job.savingsPercent }
        );
        const previewKey = `${SAMPLES_PREFIX}${job.id}.mp4`;
        const previewLocal = path.join(os.tmpdir(), `preview-${job.id}.mp4`);
        await restorationService.framesToPreviewClip(partial.framePaths, previewLocal);
        await uploadFile(previewKey, previewLocal);
        job.samplesKey = previewKey;
        await job.save();
        localRestored = previewLocal;
      }

      await uploadFile(processedKey, localRestored);
      job.processedKey = processedKey;
      await job.save();
    }

    // ---------- 3. Finalize ----------
    job.finalUrl = r2.publicUrl(job.processedKey!);
    job.status = 'completed';
    await job.save();

    // Cleanup uploads/ immediately on success
    if (job.uploadKey) {
      await r2.delete(job.uploadKey).catch(() => {});
      job.uploadKey = undefined;
      await job.save();
    }
  } catch (e: any) {
    console.error(`[job ${job.id}] failed:`, e?.message);
    job.status = 'failed';
    job.error = e?.message || 'Unknown error';
    await job.save();

    // Still clean uploads/ on failure so we don't leave originals around
    if (job.uploadKey) {
      await r2.delete(job.uploadKey).catch(() => {});
    }
  } finally {
    await safeUnlink(localUpload);
    await safeUnlink(localCompressed);
    await safeUnlink(localRestored);
  }
}