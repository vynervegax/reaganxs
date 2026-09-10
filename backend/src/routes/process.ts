// backend/src/routes/process.ts

import { Router } from 'express';
import multer from 'multer';
import fs from 'fs';
import { optionalAuthenticate } from '../middleware/auth';
import { tierGuard } from '../middleware/tierGuard';
import { validateFileMiddleware } from '../middleware/validateFile';
import { processController } from '../controllers/processController';
import { UPLOAD_TEMP_DIR, MAX_UPLOAD_BYTES } from '../config/constants';

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

/**
 * Demo + logged-in share the same endpoint.
 * - No token → tier demo (Real-ESRGAN)
 * - Token → free / premium / desktop from JWT
 */
router.post(
  '/',
  optionalAuthenticate, // ← not authenticate
  tierGuard('demo'),    // allows demo (rank 0)
  upload.single('video'),
  validateFileMiddleware,
  processController.processVideo
);

export default router;