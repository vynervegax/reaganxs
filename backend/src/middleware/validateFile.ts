import type { Request } from 'express';
import multer from 'multer';
import {
  isMimeAllowed,
  resolveMediaKind,
  MEDIA_KINDS,
  type MediaKind,
} from '../config/mediaKinds';
import { PROGRESSIVE_OFFERINGS, type UserTier } from '../config/tiers';
import { UPLOAD_TEMP_DIR } from '../config/constants';

export function assertAllowedUpload(opts: {
  mime?: string | null;
  filename?: string | null;
  size?: number;
  tier?: string;
}): { mediaKind: MediaKind } {
  const { mime, filename, size = 0, tier = 'demo' } = opts;

  if (!isMimeAllowed(mime, filename)) {
    const err: any = new Error(
      'Unsupported media type. Enabled: video and image.'
    );
    err.status = 415;
    throw err;
  }

  const mediaKind = resolveMediaKind(mime, filename);
  const kindCfg = MEDIA_KINDS[mediaKind];
  const offering =
    PROGRESSIVE_OFFERINGS[(tier as UserTier) || 'demo'] ||
    PROGRESSIVE_OFFERINGS.demo;

  const maxMb =
    kindCfg?.maxFileSizeMB != null
      ? kindCfg.maxFileSizeMB
      : offering.maxFileSizeMB;
  const maxBytes = maxMb * 1024 * 1024;

  if (size > 0 && size > maxBytes) {
    const err: any = new Error(
      `File too large for ${mediaKind} on ${offering.label || tier} (max ${maxMb} MB).`
    );
    err.status = 413;
    throw err;
  }

  return { mediaKind };
}

export function multerMediaFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: (error: Error | null, acceptFile?: boolean) => void
) {
  try {
    if (!isMimeAllowed(file.mimetype, file.originalname)) {
      return cb(new Error('Only enabled media types are allowed (video, image).'));
    }
    cb(null, true);
  } catch (e: any) {
    cb(e);
  }
}

/** Used by process routes: field name `video` (legacy) */
export const validateFileMiddleware = multer({
  dest: UPLOAD_TEMP_DIR,
  limits: { fileSize: 32 * 1024 * 1024 * 1024 },
  fileFilter: multerMediaFilter,
}).single('video');