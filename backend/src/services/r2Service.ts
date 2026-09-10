// backend/src/services/r2Service.ts

import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

const accountId = process.env.R2_ACCOUNT_ID || '';
const accessKeyId = process.env.R2_ACCESS_KEY_ID || '';
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || '';
const bucket = process.env.R2_BUCKET_NAME || '';
const publicBase = (process.env.R2_PUBLIC_URL || '').replace(/\/$/, '');
const apiPublic = (process.env.API_PUBLIC_URL || process.env.BACKEND_URL || 'http://localhost:4000').replace(/\/$/, '');

const LOCAL_DIR = path.join(process.cwd(), 'tmp', 'outputs');
fs.mkdirSync(LOCAL_DIR, { recursive: true });

const r2Enabled = Boolean(accountId && accessKeyId && secretAccessKey && bucket);

const client = r2Enabled
  ? new S3Client({
      region: 'auto',
      endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId, secretAccessKey },
      forcePathStyle: true,
      // avoid some TLS edge cases
      tls: true,
    })
  : null;

function contentTypeFor(filePath: string) {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.mp4') return 'video/mp4';
  if (ext === '.webm') return 'video/webm';
  return 'application/octet-stream';
}

async function uploadLocal(localPath: string): Promise<string> {
  const name = `${Date.now()}-${randomUUID()}${path.extname(localPath) || '.mp4'}`;
  const dest = path.join(LOCAL_DIR, name);
  fs.copyFileSync(localPath, dest);
  // Served by Express static route below
  return `${apiPublic}/outputs/${name}`;
}

async function uploadR2(localPath: string, expiryHours: number): Promise<string> {
  if (!client) throw new Error('R2 not configured');

  const key = `processed/${Date.now()}-${randomUUID()}${path.extname(localPath) || '.mp4'}`;
  const body = fs.readFileSync(localPath);

  await client.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: body,
      ContentType: contentTypeFor(localPath),
    })
  );

  if (publicBase) return `${publicBase}/${key}`;

  return getSignedUrl(
    client,
    new GetObjectCommand({ Bucket: bucket, Key: key }),
    { expiresIn: Math.min(Math.max(expiryHours, 1), 168) * 3600 }
  );
}

export const r2Service = {
  async uploadWithExpiry(localPath: string, expiryHours = 24): Promise<string> {
    if (!fs.existsSync(localPath)) {
      throw new Error(`Upload: file not found ${localPath}`);
    }

    // Prefer R2; on TLS/config failure fall back to local (dev-friendly)
    if (r2Enabled) {
      try {
        const url = await uploadR2(localPath, expiryHours);
        console.log('[storage] R2 OK', url.slice(0, 80));
        return url;
      } catch (err: any) {
        console.error('[storage] R2 failed, using local fallback:', err?.message || err);
      }
    } else {
      console.warn('[storage] R2 env missing — local fallback');
    }

    const url = await uploadLocal(localPath);
    console.log('[storage] local OK', url);
    return url;
  },
};