import fs from 'fs';
import path from 'path';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { MODELS_DIR, MODEL_FILES } from '../config/constants';
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';

const accountId = process.env.R2_ACCOUNT_ID || '';
const accessKeyId = process.env.R2_ACCESS_KEY_ID || '';
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY || '';
const bucket = process.env.R2_BUCKET_NAME || '';

const client =
  accountId && accessKeyId && secretAccessKey && bucket
    ? new S3Client({
        region: 'auto',
        endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
        credentials: { accessKeyId, secretAccessKey },
        forcePathStyle: true,
      })
    : null;

async function downloadFromR2(key: string, dest: string): Promise<void> {
  if (!client) throw new Error('R2 not configured');

  fs.mkdirSync(path.dirname(dest), { recursive: true });

  const res = await client.send(
    new GetObjectCommand({ Bucket: bucket, Key: key })
  );

  if (!res.Body) throw new Error(`Empty body for ${key}`);

  const body = res.Body as Readable;
  await pipeline(body, fs.createWriteStream(dest));
}

export const modelService = {
  /**
   * Ensure required model weights exist on local volume.
   * Downloads from R2 models/ folder only if missing.
   * Safe to call at startup — runs once per missing file.
   */
  async ensureModels(models: string[] = Object.keys(MODEL_FILES)): Promise<void> {
    fs.mkdirSync(MODELS_DIR, { recursive: true });

    for (const modelId of models) {
      const filename = MODEL_FILES[modelId];
      if (!filename) continue;

      const localPath = path.join(MODELS_DIR, filename);

      if (fs.existsSync(localPath) && fs.statSync(localPath).size > 0) {
        console.log(`[models] already present: ${filename}`);
        continue;
      }

      const r2Key = `models/${filename}`;
      console.log(`[models] downloading ${r2Key} → ${localPath}`);

      try {
        await downloadFromR2(r2Key, localPath);
        console.log(`[models] downloaded ${filename}`);
      } catch (err: any) {
        console.warn(`[models] failed to download ${filename}:`, err?.message || err);
        // Non-fatal — restoration will fall back to FFmpeg enhance
      }
    }
  },
};