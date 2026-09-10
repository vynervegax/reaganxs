import dotenv from 'dotenv';
dotenv.config();

import app from './server';
import { connectDB } from './config/db';

const PORT = process.env.PORT || 3001;

async function start() {
  await connectDB();
  
  app.listen(PORT, () => {
    console.log(`🚀 ReaganXS Backend running on port ${PORT}`);
  });
}

start();