import dotenv from 'dotenv';
dotenv.config();

import app from './server';
import { connectDB } from './config/db';
import { startCleanupJobs } from './utils/cleanup';
import { modelService } from './services/modelService';
import './workers/videoWorker';

const raw = process.env.PORT;
const port = Number(raw);
if (!Number.isFinite(port) || port <= 0) {
  throw new Error(`PORT must be set by Railway, got: ${raw}`);
}

async function start() {
  const server = app.listen(port, '0.0.0.0', () => {
    console.log(`🚀 ReaganXS Backend listening on 0.0.0.0:${port}`);
  });

  server.on('error', (err) => {
    console.error('listen error', err);
    process.exit(1);
  });

  try {
    await connectDB();
    console.log('✅ MongoDB connected');
    startCleanupJobs();
  } catch (err) {
    console.error('❌ MongoDB failed (HTTP is still up; cleanup not started)', err);
  }

  // Ensure model weights exist on the volume (download from R2 only if missing)
  try {
    await modelService.ensureModels();
    console.log('✅ Models ready');
  } catch (err) {
    console.warn('Model ensure failed (will fall back to FFmpeg enhance)', err);
  }
}

start().catch((err) => {
  console.error('fatal start error', err);
  process.exit(1);
});