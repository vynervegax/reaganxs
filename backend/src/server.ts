import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';

import { connectDB } from './config/db';
import { errorHandler } from './middleware/errorHandler';
import api from './routes';

const app = express();

app.set('trust proxy', 1);

const allowedOrigins = [
  process.env.FRONTEND_URL,
  process.env.WEB_ORIGIN,
  process.env.MVP_ORIGIN,
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
].filter(Boolean) as string[];

app.use(
  cors({
    origin(origin, cb) {
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      if (process.env.NODE_ENV !== 'production') return cb(null, true);
      return cb(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// --- Rate limits ---
const keyGenerator = (req: any) => {
  const userId = req.user?.id || req.user?._id;
  if (userId) return String(userId);
  return ipKeyGenerator(req.ip || req.socket?.remoteAddress || 'unknown');
};

const uploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Upload limit reached. Try again later.' },
  keyGenerator,
});

const statusLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 600,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many status checks.' },
  keyGenerator,
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many auth attempts.' },
  keyGenerator: (req) => ipKeyGenerator(req.ip || 'unknown'),
});

const defaultLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 150,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests' },
  keyGenerator,
});

// Status polling (higher limit) — register first
app.get('/api/process/:id', statusLimiter);

// Uploads only (POST)
app.post('/api/process', uploadLimiter);

// Auth
app.use('/api/auth', authLimiter);

// Fallback
app.use('/api/', defaultLimiter);

const outputsDir = path.join(process.cwd(), 'tmp', 'outputs');
fs.mkdirSync(outputsDir, { recursive: true });
fs.mkdirSync(path.join(process.cwd(), 'tmp', 'uploads'), { recursive: true });

app.use(
  '/outputs',
  express.static(outputsDir, {
    setHeaders(res, filePath) {
      const ext = path.extname(filePath).toLowerCase();
      if (ext === '.mp4') res.setHeader('Content-Type', 'video/mp4');
      if (ext === '.webm') res.setHeader('Content-Type', 'video/webm');
      res.setHeader('Content-Disposition', 'inline');
      res.setHeader('Cache-Control', 'public, max-age=3600');
    },
  })
);

app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'reaganxs-backend',
    time: new Date().toISOString(),
  });
});

app.get('/', (_req, res) => {
  res.json({ name: 'ReaganXS API', status: 'running', docs: '/health' });
});

app.use('/api', api);

app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Not found' });
});

app.use(errorHandler);

export default app;