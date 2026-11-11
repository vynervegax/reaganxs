import type { Request, Response, NextFunction } from 'express';
import {
  isMimeAllowed,
  resolveMediaKind,
  MEDIA_KINDS,
  type MediaKind,
} from '../config/mediaKinds';
import { PROGRESSIVE_OFFERINGS, type UserTier } from '../config/tiers';

export function assertAllowedUpload(opts: {
  mime?: string | null;
  filename?: string | null;
  size?: number;
  tier?: string;
}): { mediaKind: MediaKind } {
  const { mime, filename, size = 0, tier = 'demo' } = opts;

  if (!isMimeAllowed(mime, filename)) {
    const err: any = new Error('Unsupported media type. Enabled: video and image.');
    err.status = 415;
    throw err;
  }

  const mediaKind = resolveMediaKind(mime, filename);
  const kindCfg = MEDIA_KINDS[mediaKind];
  const offering =
    PROGRESSIVE_OFFERINGS[(tier as UserTier) || 'demo'] ||
    PROGRESSIVE_OFFERINGS.demo;

  const maxMb = kindCfg?.maxFileSizeMB != null
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
  if (!isMimeAllowed(file.mimetype, file.originalname)) {
    return cb(new Error('Only enabled media types are allowed (video, image).'));
  }
  cb(null, true);
}

/** After upload.single('video') — sets req.mediaKind */
export function validateFileMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const file = req.file;
    if (!file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }

    const user = (req as any).user as { tier?: string } | undefined;
    const tier = user?.tier || 'demo';

    const { mediaKind } = assertAllowedUpload({
      mime: file.mimetype,
      filename: file.originalname,
      size: file.size,
      tier,
    });

    (req as any).mediaKind = mediaKind;
    next();
  } catch (e: any) {
    const status = e?.status || 400;
    return res.status(status).json({
      success: false,
      message: e?.message || 'Invalid file',
    });
  }
}