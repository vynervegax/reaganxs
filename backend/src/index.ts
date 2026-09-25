import dotenv from 'dotenv';
dotenv.config();

import app from './server';
import { connectDB } from './config/db';

const port = Number(process.env.PORT) || 3001;

async function start() {
  // Bind first so Railway can reach the process even if Mongo is slow/down.
  app.listen(port, '0.0.0.0', () => {
    console.log(`🚀 ReaganXS Backend listening on 0.0.0.0:${port}`);
  });

  try {
    await connectDB();
  } catch (err) {
    console.error('❌ MongoDB connection failed (API is up, DB routes will fail)', err);
  }
}

start().catch((err) => {
  console.error('fatal start error', err);
  process.exit(1);
});