import cron from 'node-cron';
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import { ProcessingJob } from '../models/ProcessingJob';
import { r2Service, SHORT_LIVED_HOURS, keyFromUrlOrKey } from '../services/r2Service';
import { PROGRESSIVE_OFFERINGS, type UserTier } from '../config/tiers';

const PREFIX = 'processed/';
const SAMPLES_PREFIX = 'samples/';
const COMPRESSED_PREFIX = 'compressed/';
const JOB_MAX_AGE_DAYS = 90; // mongo row safety net
const HISTORY_MAX_AGE_DAYS = 30;
const SHORT_LIVED = SHORT_LIVED_HOURS; // 9h samples + compressed

function r2Client(): S3Client | null {
  const accountId = process.env.R2_ACCOUNT_ID;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  if (!accountId || !accessKeyId || !secretAccessKey) return null;

  return new S3Client({
    region: 'auto',
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });
}

function keyFromUrl(url?: string | null): string | null {
  return keyFromUrlOrKey(url || '') || null;
}

async function deleteR2Keys(keys: string[]) {
  const client = r2Client();
  const bucket = process.env.R2_BUCKET_NAME;
  if (!client || !bucket || keys.length === 0) return 0;

  const safe = keys.filter(
    (k) =>
      (k.startsWith(PREFIX) ||
        k.startsWith(SAMPLES_PREFIX) ||
        k.startsWith(COMPRESSED_PREFIX) ||
        k.startsWith('uploads/')) &&
      !k.startsWith('models/')
  );
  if (safe.length === 0) return 0;

  for (let i = 0; i < safe.length; i += 1000) {
    const chunk = safe.slice(i, i + 1000);
    await client.send(
      new DeleteObjectsCommand({
        Bucket: bucket,
        Delete: { Objects: chunk.map((Key) => ({ Key })), Quiet: true },
      })
    );
  }
  return safe.length;
}

/**
 * Final outputs: delete when job.expiresAt has passed
 * (set from tier.expiryHours at complete time).
 * desktop expiryHours=0 → no expiresAt → skip here.
 */
export async function cleanupExpiredProcessedByTier() {
  const now = new Date();
  const jobs = await ProcessingJob.find({
    status: 'completed',
    expiresAt: { $ne: null, $lte: now },
  })
    .select('finalUrl url compressedKey previewFrameUrls previewClipUrl')
    .limit(200)
    .lean();

  const keys: string[] = [];
  for (const j of jobs as any[]) {
    const main = keyFromUrl(j.finalUrl || j.url);
    if (main) keys.push(main);
    if (j.compressedKey) keys.push(j.compressedKey);
    if (Array.isArray(j.previewFrameUrls)) {
      for (const u of j.previewFrameUrls) {
        const k = keyFromUrl(u);
        if (k) keys.push(k);
      }
    }
    const clip = keyFromUrl(j.previewClipUrl);
    if (clip) keys.push(clip);
  }

  const deleted = await deleteR2Keys(keys);

  // Clear URLs so history shows expired
  if (jobs.length > 0) {
    await ProcessingJob.updateMany(
      { _id: { $in: jobs.map((j: any) => j._id) } },
      {
        $set: {
          finalUrl: null,
          previewFrameUrls: [],
          previewClipUrl: null,
        },
      }
    );
  }

  console.log(
    `[cleanup] tier-expired processed: ${deleted} objects, ${jobs.length} jobs`
  );
  return { deleted, jobs: jobs.length };
}

/** samples/ — 9h */
export async function cleanupExpiredSamples() {
  try {
    const deleted = await r2Service.cleanupExpiredSamples(SHORT_LIVED);
    if (deleted === 0) {
      console.log(`[cleanup] samples/ — nothing older than ${SHORT_LIVED}h`);
    }
    return { deleted };
  } catch (err: any) {
    console.warn('[cleanup] samples/', err?.message || err);
    return { deleted: 0 };
  }
}

/** compressed/ checkpoints — 9h */
export async function cleanupExpiredCompressed() {
  try {
    const deleted = await r2Service.cleanupExpiredCompressed(SHORT_LIVED);
    if (deleted === 0) {
      console.log(`[cleanup] compressed/ — nothing older than ${SHORT_LIVED}h`);
    }
    return { deleted };
  } catch (err: any) {
    console.warn('[cleanup] compressed/', err?.message || err);
    return { deleted: 0 };
  }
}

/** Mongo rows older than 90d + any leftover R2 keys */
export async function cleanupExpiredJobs() {
  const cutoff = new Date(Date.now() - JOB_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
  const jobs = await ProcessingJob.find({
    createdAt: { $lt: cutoff },
  })
    .select('finalUrl url previewFrameUrls previewClipUrl compressedKey')
    .lean();

  const keys: string[] = [];
  for (const j of jobs as any[]) {
    const main = keyFromUrl(j.finalUrl || j.url);
    if (main) keys.push(main);
    if (j.compressedKey) keys.push(j.compressedKey);
    if (Array.isArray(j.previewFrameUrls)) {
      for (const u of j.previewFrameUrls) {
        const k = keyFromUrl(u);
        if (k) keys.push(k);
      }
    }
    const clip = keyFromUrl(j.previewClipUrl);
    if (clip) keys.push(clip);
  }

  await deleteR2Keys(keys);

  const result = await ProcessingJob.deleteMany({ createdAt: { $lt: cutoff } });
  console.log(`[cleanup] Mongo jobs deleted ${result.deletedCount}`);
  return { jobs: result.deletedCount, objects: keys.length };
}

export async function cleanupFailedJobUploads() {
  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const failed = await ProcessingJob.find({
    status: 'failed',
    updatedAt: { $gte: since },
  })
    .select('finalUrl previewFrameUrls previewClipUrl')
    .limit(100)
    .lean();

  const keys: string[] = [];
  for (const j of failed as any[]) {
    const main = keyFromUrl(j.finalUrl);
    if (main) keys.push(main);
    if (Array.isArray(j.previewFrameUrls)) {
      for (const u of j.previewFrameUrls) {
        const k = keyFromUrl(u);
        if (k) keys.push(k);
      }
    }
    const clip = keyFromUrl(j.previewClipUrl);
    if (clip) keys.push(clip);
  }

  const deleted = await deleteR2Keys(keys);
  if (deleted > 0) {
    console.log(`[cleanup] failed-job R2 objects deleted ${deleted}`);
  }
  return { deleted };
}

export function startCleanupJobs() {
  // Hourly: short-lived + tier-expired finals
  cron.schedule('5 * * * *', async () => {
    try {
      await cleanupExpiredSamples();
      await cleanupExpiredCompressed();
      await cleanupExpiredProcessedByTier();
    } catch (err) {
      console.error('[cleanup] hourly failed', err);
    }
  });

  // Daily 03:15 UTC — mongo + stragglers
  cron.schedule('15 3 * * *', async () => {
    try {
      await cleanupExpiredJobs();
      await cleanupFailedJobUploads();
      await cleanupExpiredProcessedByTier();
    } catch (err) {
      console.error('[cleanup] daily failed', err);
    }
  });

  cleanupExpiredSamples().catch((err) =>
    console.warn('[cleanup] boot samples', err?.message || err)
  );
  cleanupExpiredCompressed().catch((err) =>
    console.warn('[cleanup] boot compressed', err?.message || err)
  );

  console.log(
    `[cleanup] scheduled — processed by tier expiresAt, samples+compressed>${SHORT_LIVED}h, jobs>${JOB_MAX_AGE_DAYS}d, history window=${HISTORY_MAX_AGE_DAYS}d`
  );
}

// re-export for tests
export { PROGRESSIVE_OFFERINGS };
export type { UserTier };