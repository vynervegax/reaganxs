import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import rateLimit from 'express-rate-limit';

import { connectDB } from './config/db';
import { errorHandler } from './middleware/errorHandler';

import processRoutes from './routes/process';
import authRoutes from './routes/auth';
import historyRoutes from './routes/history';
import contributionRoutes from './routes/contribution';
import viralityRoutes from './routes/virality';
import stripeRoutes from './routes/stripe';

const app = express();

// ── Trust proxy (Railway / reverse proxy) ─────────────────
app.set('trust proxy', 1);

// ── CORS ──────────────────────────────────────────────────
const allowedOrigins = [
  process.env.WEB_ORIGIN,
  process.env.MVP_ORIGIN,
  'http://localhost:3000',
  'http://localhost:3001',
  'http://127.0.0.1:3000',
].filter(Boolean) as string[];

app.use(
  cors({
    origin(origin, cb) {
      // Allow non-browser clients (curl, mobile, same-origin)
      if (!origin) return cb(null, true);
      if (allowedOrigins.includes(origin)) return cb(null, true);
      // In development, be permissive
      if (process.env.NODE_ENV !== 'production') return cb(null, true);
      return cb(new Error(`CORS blocked: ${origin}`));
    },
    credentials: true,
  })
);

// ── Body parsers (skip multipart — multer handles that) ───
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true, limit: '2mb' }));

// ── Rate limit (general API) ──────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests' },
});
app.use('/api/', apiLimiter);

// Stricter limit on process endpoint
const processLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many process requests' },
});

// ── Local outputs (R2 fallback) ───────────────────────────
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

// ── Health ────────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({
    ok: true,
    service: 'reaganxs-backend',
    time: new Date().toISOString(),
  });
});

app.get('/', (_req, res) => {
  res.json({
    name: 'ReaganXS API',
    status: 'running',
    docs: '/health',
  });
});

// ── Routes ────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/process', processLimiter, processRoutes);
app.use('/api/history', historyRoutes);
app.use('/api/contribution', contributionRoutes);
app.use('/api/virality', viralityRoutes);
app.use('/api/stripe', stripeRoutes);

// ── 404 ───────────────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({ success: false, message: 'Not found' });
});

// ── Error handler (last) ──────────────────────────────────
app.use(errorHandler);

// ── Boot ──────────────────────────────────────────────────
export async function startServer() {
  const port = Number(process.env.PORT) || 4000;

  try {
    await connectDB();
    console.log('[db] connected');
  } catch (err) {
    console.error('[db] connection failed — continuing without DB if optional', err);
    // If Mongo is required, rethrow:
    // throw err;
  }

  app.listen(port, () => {
    console.log(`[server] ReaganXS API on :${port}`);
    console.log(`[server] outputs → ${outputsDir}`);
    console.log(`[server] API_PUBLIC_URL=${process.env.API_PUBLIC_URL || 'http://localhost:' + port}`);
  });
}

export default app;