// backend/src/services/r2Service.ts

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  ListObjectsV2Command,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';

const accountId = process.env.R2_ACCOUNT_ID || '';
const accessKeyId = process.env.R2_ACCESS_KEY_ID || '';
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || '';
const bucket = process.env.R2_BUCKET_NAME || '';
const publicBase = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');
const apiPublic = (
  process.env.API_PUBLIC_URL ||
  process.env.BACKEND_URL ||
  'http://localhost:4000'
).replace(/\/$/, '');

/** samples/ + compressed/ checkpoints */
export const SHORT_LIVED_HOURS = 9;

const LOCAL_DIR = path.join(process.cwd(), 'tmp', 'outputs');
fs.mkdirSync(LOCAL_DIR, { recursive: true });

const r2Enabled = Boolean(
  accountId && accessKeyId && secretAccessKey && bucket
);

const client = r2Enabled
  ? new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true,
      tls: true,
    })
  : null;

function contentTypeFor(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.mp4') return 'video/mp4';
  if (ext === '.webm') return 'video/webm';
  if (ext === '.mov') return 'video/quicktime';
  if (ext === '.png') return 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  return 'application/octet-stream';
}

export function keyFromUrlOrKey(urlOrKey: string): string | null {
  if (!urlOrKey) return null;
  if (!urlOrKey.includes('://')) return urlOrKey.replace(/^\//, '');
  try {
    const u = new URL(urlOrKey);
    const p = u.pathname.replace(/^\//, '');
    if (
      p.startsWith('processed/') ||
      p.startsWith('uploads/') ||
      p.startsWith('samples/') ||
      p.startsWith('compressed/')
    ) {
      return p;
    }
    for (const prefix of [
      'processed/',
      'samples/',
      'uploads/',
      'compressed/',
    ] as const) {
      const idx = p.indexOf(prefix);
      if (idx >= 0) return p.slice(idx);
    }
    return p || null;
  } catch {
    return null;
  }
}

async function uploadLocal(
  localPath: string
): Promise<{ url: string; key: string }> {
  const name = `${Date.now()}-${randomUUID()}${path.extname(localPath) || '.mp4'}`;
  const dest = path.join(LOCAL_DIR, name);
  fs.copyFileSync(localPath, dest);
  return { url: `${apiPublic}/outputs/${name}`, key: `local/${name}` };
}

async function uploadR2(
  localPath: string,
  opts: { prefix: string; expiryHours: number }
): Promise<{ url: string; key: string }> {
  if (!client) throw new Error('R2 not configured');

  const key = `${opts.prefix}${Date.now()}-${randomUUID()}${
    path.extname(localPath) || '.bin'
  }`;
  const body = fs.readFileSync(localPath);

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentTypeFor(localPath),
    })
  );

  if (publicBase) {
    return { url: `${publicBase}/${key}`, key };
  }

  // Signed URL access window (object still needs app/cron delete)
  const hours =
    opts.expiryHours > 0
      ? Math.min(Math.max(opts.expiryHours, 1), 168)
      : 168;
  const url = await getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: hours * 3600 }
  );
  return { url, key };
}

async function cleanupPrefixOlderThan(
  prefix: string,
  maxAgeHours: number
): Promise<number> {
  if (!client || maxAgeHours <= 0) return 0;

  const cutoff = Date.now() - maxAgeHours * 60 * 60 * 1000;
  let deleted = 0;
  let token: string | undefined;

  do {
    const res = await client.send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: token,
        MaxKeys: 200,
      })
    );

    for (const obj of res.Contents || []) {
      const key = obj.Key;
      if (!key) continue;

      let ts = obj.LastModified?.getTime() ?? 0;
      if (!ts) {
        const m = key.match(new RegExp(`^${prefix.replace('/', '\\/')}(\\d+)-`));
        if (m) ts = Number(m[1]);
      }
      if (ts && ts < cutoff) {
        await r2Service.deleteObject(key);
        deleted++;
      }
    }

    token = res.IsTruncated ? res.NextContinuationToken : undefined;
  } while (token);

  if (deleted > 0) {
    console.log(
      `[cleanup] ${prefix} deleted ${deleted} objects (>${maxAgeHours}h)`
    );
  }
  return deleted;
}

export const r2Service = {
  async uploadWithExpiry(
    localPath: string,
    expiryHours = 24
  ): Promise<string> {
    const { url } = await this.uploadWithKey(localPath, {
      prefix: 'processed/',
      expiryHours,
    });
    return url;
  },

  async uploadWithKey(
    localPath: string,
    opts: { prefix?: string; expiryHours?: number } = {}
  ): Promise<{ url: string; key: string }> {
    if (!fs.existsSync(localPath)) {
      throw new Error(`Upload: file not found ${localPath}`);
    }
    const prefix = opts.prefix ?? 'processed/';
    const expiryHours = opts.expiryHours ?? 24;

    if (r2Enabled) {
      try {
        const out = await uploadR2(localPath, { prefix, expiryHours });
        console.log('[storage] R2 OK', out.url.slice(0, 80));
        return out;
      } catch (err: any) {
        console.error(
          '[storage] R2 failed, local fallback:',
          err?.message || err
        );
      }
    } else {
      console.warn('[storage] R2 env missing — local fallback');
    }
    return uploadLocal(localPath);
  },

  /** Partial frames → samples/ (9h cleanup) */
  async uploadSample(
    localPath: string
  ): Promise<{ url: string; key: string }> {
    return this.uploadWithKey(localPath, {
      prefix: 'samples/',
      expiryHours: SHORT_LIVED_HOURS,
    });
  },

  async createPresignedUpload(originalFilename: string, contentType: string) {
    if (!client) throw new Error('R2 not configured');

    const ext = path.extname(originalFilename) || '.mp4';
    const key = `uploads/${Date.now()}-${randomUUID()}${ext}`;

    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      ContentType: contentType || 'video/mp4',
    });

    const uploadUrl = await getSignedUrl(client, command, {
      expiresIn: 60 * 60,
    });

    return { uploadUrl, key };
  },

  async downloadToLocal(key: string, destPath: string): Promise<void> {
    if (!client) throw new Error('R2 not configured');

    const res = await client.send(
      new GetObjectCommand({ Bucket: bucket, Key: key })
    );

    if (!res.Body) throw new Error(`Empty body for key ${key}`);

    fs.mkdirSync(path.dirname(destPath), { recursive: true });
    await pipeline(res.Body as Readable, fs.createWriteStream(destPath));
  },

  async deleteObject(key: string): Promise<void> {
    if (!client || !key) return;
    if (key.startsWith('local/')) return;
    try {
      await client.send(
        new DeleteObjectCommand({
          Bucket: bucket,
          Key: key,
        })
      );
      console.log('[storage] deleted', key);
    } catch (err: any) {
      console.warn('[storage] delete failed', key, err?.message);
    }
  },

  async deleteMany(keys: string[]): Promise<void> {
    for (const k of keys) {
      if (k) await this.deleteObject(k);
    }
  },

  async deleteByUrl(url: string): Promise<void> {
    const key = keyFromUrlOrKey(url);
    if (key) await this.deleteObject(key);
  },

  async cleanupExpiredSamples(
    maxAgeHours = SHORT_LIVED_HOURS
  ): Promise<number> {
    return cleanupPrefixOlderThan('samples/', maxAgeHours);
  },

  async cleanupExpiredCompressed(
    maxAgeHours = SHORT_LIVED_HOURS
  ): Promise<number> {
    return cleanupPrefixOlderThan('compressed/', maxAgeHours);
  },
};