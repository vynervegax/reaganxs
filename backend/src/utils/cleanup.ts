import cron from 'node-cron';
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import { ProcessingJob } from '../models/ProcessingJob';
import { r2Service } from '../services/r2Service';

const PREFIX = 'processed/';
const SAMPLES_PREFIX = 'samples/';
const JOB_MAX_AGE_DAYS = 90;
const HISTORY_MAX_AGE_DAYS = 30;
const SAMPLE_MAX_AGE_HOURS = 24;

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
  if (!url) return null;
  try {
    const u = new URL(url);
    const path = u.pathname.replace(/^\//, '');
    if (path.startsWith(PREFIX)) return path;
    if (path.startsWith(SAMPLES_PREFIX)) return path;
    if (path.includes(`/${PREFIX}`)) {
      return path.slice(path.indexOf(PREFIX));
    }
    if (path.includes(`/${SAMPLES_PREFIX}`)) {
      return path.slice(path.indexOf(SAMPLES_PREFIX));
    }
    return null;
  } catch {
    return null;
  }
}

async function deleteR2Keys(keys: string[]) {
  const client = r2Client();
  const bucket = process.env.R2_BUCKET_NAME;
  if (!client || !bucket || keys.length === 0) return 0;

  const safe = keys.filter(
    (k) =>
      (k.startsWith(PREFIX) || k.startsWith(SAMPLES_PREFIX)) &&
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

/** Delete processed/* objects older than 90 days (never models/). */
export async function cleanupExpiredR2() {
  const client = r2Client();
  const bucket = process.env.R2_BUCKET_NAME;
  if (!client || !bucket) {
    console.warn('[cleanup] R2 not configured — skip object sweep');
    return { deleted: 0 };
  }

  const cutoff = Date.now() - JOB_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
  const toDelete: string[] = [];
  let token: string | undefined;

  do {
    const page = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: PREFIX,
        ContinuationToken: token,
      })
    );

    for (const obj of page.Contents || []) {
      if (!obj.Key || !obj.Key.startsWith(PREFIX)) continue;
      if (obj.Key.startsWith('models/')) continue;
      const modified = obj.LastModified ? obj.LastModified.getTime() : 0;
      if (modified && modified < cutoff) toDelete.push(obj.Key);
    }

    token = page.IsTruncated ? page.NextContinuationToken : undefined;
  } while (token);

  const deleted = await deleteR2Keys(toDelete);
  console.log(`[cleanup] R2 processed/ deleted ${deleted} objects`);
  return { deleted };
}

/**
 * Quality sample clip + partial frame PNGs under samples/
 * Auto-delete after 24 hours.
 */
export async function cleanupExpiredSamples() {
  try {
    const deleted = await r2Service.cleanupExpiredSamples(SAMPLE_MAX_AGE_HOURS);
    if (deleted === 0) {
      console.log(
        `[cleanup] R2 samples/ — nothing older than ${SAMPLE_MAX_AGE_HOURS}h`
      );
    }
    return { deleted };
  } catch (err: any) {
    console.warn('[cleanup] samples/', err?.message || err);
    return { deleted: 0 };
  }
}

/** Remove old job rows; also delete their processed/ objects. */
export async function cleanupExpiredJobs() {
  const cutoff = new Date(Date.now() - JOB_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
  const jobs = await ProcessingJob.find({
    createdAt: { $lt: cutoff },
  })
    .select('finalUrl url previewFrameUrls previewClipUrl')
    .lean();

  const keys: string[] = [];
  for (const j of jobs as any[]) {
    const main = keyFromUrl(j.finalUrl || j.url);
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

  await deleteR2Keys(keys);

  const result = await ProcessingJob.deleteMany({ createdAt: { $lt: cutoff } });
  console.log(`[cleanup] Mongo jobs deleted ${result.deletedCount}`);
  return { jobs: result.deletedCount, objects: keys.length };
}

/**
 * Failed jobs still holding R2 keys (defensive sweep).
 * Prefer worker-side delete on fail; this catches stragglers.
 */
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
  // Daily 03:15 UTC — long-lived processed/ + mongo jobs
  cron.schedule('15 3 * * *', async () => {
    try {
      await cleanupExpiredR2();
      await cleanupExpiredJobs();
      await cleanupFailedJobUploads();
    } catch (err) {
      console.error('[cleanup] daily failed', err);
    }
  });

  // Every hour — samples/ (frames + quality clip) after 24h
  cron.schedule('5 * * * *', async () => {
    try {
      await cleanupExpiredSamples();
    } catch (err) {
      console.error('[cleanup] samples hourly failed', err);
    }
  });

  // Run samples once on boot (don’t wait for next hour)
  cleanupExpiredSamples().catch((err) =>
    console.warn('[cleanup] boot samples', err?.message || err)
  );

  console.log(
    `[cleanup] scheduled — R2 prefix=${PREFIX}, samples/>${SAMPLE_MAX_AGE_HOURS}h hourly, jobs>${JOB_MAX_AGE_DAYS}d, history window=${HISTORY_MAX_AGE_DAYS}d`
  );
}