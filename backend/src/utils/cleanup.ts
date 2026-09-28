import cron from 'node-cron';
import {
  S3Client,
  ListObjectsV2Command,
  DeleteObjectsCommand,
} from '@aws-sdk/client-s3';
import { ProcessingJob } from '../models/ProcessingJob';

const PREFIX = 'processed/';
const JOB_MAX_AGE_DAYS = 90;
const HISTORY_MAX_AGE_DAYS = 30;

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
    if (path.includes(`/${PREFIX}`)) {
      return path.slice(path.indexOf(PREFIX));
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

  const safe = keys.filter((k) => k.startsWith(PREFIX) && !k.startsWith('models/'));
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

/** Remove old job rows; also delete their processed/ objects. */
export async function cleanupExpiredJobs() {
  const cutoff = new Date(Date.now() - JOB_MAX_AGE_DAYS * 24 * 60 * 60 * 1000);
  const jobs = await ProcessingJob.find({
    createdAt: { $lt: cutoff },
  })
    .select('finalUrl url')
    .lean();

  const keys = jobs
    .map((j: any) => keyFromUrl(j.finalUrl || j.url))
    .filter((k): k is string => Boolean(k));

  await deleteR2Keys(keys);

  const result = await ProcessingJob.deleteMany({ createdAt: { $lt: cutoff } });
  console.log(`[cleanup] Mongo jobs deleted ${result.deletedCount}`);
  return { jobs: result.deletedCount, objects: keys.length };
}

export function startCleanupJobs() {
  // 03:15 UTC daily
  cron.schedule('15 3 * * *', async () => {
    try {
      await cleanupExpiredR2();
      await cleanupExpiredJobs();
    } catch (err) {
      console.error('[cleanup] failed', err);
    }
  });

  console.log(
    `[cleanup] scheduled — R2 prefix=${PREFIX}, jobs>${JOB_MAX_AGE_DAYS}d, history window=${HISTORY_MAX_AGE_DAYS}d`
  );
}