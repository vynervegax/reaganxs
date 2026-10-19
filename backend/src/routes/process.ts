// backend/src/routes/process.ts

import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import { optionalAuthenticate } from '../middleware/auth';
import { tierGuard } from '../middleware/tierGuard';
import { validateFileMiddleware } from '../middleware/validateFile';
import { processController } from '../controllers/processController';
import { UPLOAD_TEMP_DIR, MAX_UPLOAD_BYTES } from '../config/constants';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

const router = Router();

fs.mkdirSync(UPLOAD_TEMP_DIR, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_TEMP_DIR),
  filename: (_req, file, cb) =>
    cb(null, `${Date.now()}-${file.originalname.replace(/[^\w.\-]+/g, '_')}`),
});

const upload = multer({
  storage,
  limits: { fileSize: MAX_UPLOAD_BYTES },
});

const statusLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many status checks.' },
  keyGenerator: (req: any) => {
    const userId = req.user?.id || req.user?._id;
    if (userId) return String(userId);
    return ipKeyGenerator(req.ip || 'unknown');
  },
});

router.post(
  '/',
  optionalAuthenticate,
  tierGuard('demo'),
  upload.single('video'),
  validateFileMiddleware,
  processController.processVideo
);

router.get('/:id', statusLimiter, processController.getJobStatus);

export default router;