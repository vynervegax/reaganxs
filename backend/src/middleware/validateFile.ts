import type { Request } from 'express';
import {
  isMimeAllowed,
  resolveMediaKind,
  MEDIA_KINDS,
} from '../config/mediaKinds';
import { PROGRESSIVE_OFFERINGS, type UserTier } from '../config/tiers';

export function assertAllowedUpload(opts: {
  mime?: string | null;
  filename?: string | null;
  size?: number;
  tier?: string;
}): { mediaKind: string } {
  const { mime, filename, size = 0, tier = 'demo' } = opts;

  if (!isMimeAllowed(mime, filename)) {
    throw Object.assign(
      new Error(
        'Unsupported media type. Enabled: video and image (audio/text coming soon).'
      ),
      { status: 415 }
    );
  }

  const mediaKind = resolveMediaKind(mime, filename);
  const kindCfg = MEDIA_KINDS[mediaKind as keyof typeof MEDIA_KINDS];
  const offering =
    PROGRESSIVE_OFFERINGS[(tier as UserTier) || 'demo'] ||
    PROGRESSIVE_OFFERINGS.demo;

  const maxMb =
    kindCfg?.maxFileSizeMB != null
      ? kindCfg.maxFileSizeMB
      : offering.maxFileSizeMB;
  const maxBytes = maxMb * 1024 * 1024;

  if (size > maxBytes) {
    throw Object.assign(
      new Error(
        `File too large for ${mediaKind} on ${offering.label} tier (max ${maxMb} MB).`
      ),
      { status: 413 }
    );
  }

  return { mediaKind };
}

/** Multer fileFilter */
export function multerMediaFilter(
  _req: Request,
  file: Express.Multer.File,
  cb: (error: Error | null, acceptFile?: boolean) => void
) {
  try {
    if (!isMimeAllowed(file.mimetype, file.originalname)) {
      return cb(
        new Error('Only enabled media types are allowed (video, image).')
      );
    }
    cb(null, true);
  } catch (e: any) {
    cb(e);
  }
}