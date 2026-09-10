import { ProcessingJob } from '../models/ProcessingJob';
import cron from 'node-cron';

cron.schedule('0 2 * * *', async () => {   // Daily at 2:00 AM
  console.log('🧹 Starting daily cleanup job...');

  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);

  try {
    // 1. Archive old history entries (30+ days) - still keep record but hide from UI
    const oldJobs = await ProcessingJob.find({
      createdAt: { $lt: thirtyDaysAgo },
      status: { $ne: 'archived' },
    });

    for (const job of oldJobs) {
      await ProcessingJob.findByIdAndUpdate(job._id, { status: 'archived' });
    }

    console.log(`Archived ${oldJobs.length} entries (30+ days old)`);

    // 2. Hard delete very old records (90+ days) + R2 files
    const veryOldJobs = await ProcessingJob.find({
      createdAt: { $lt: ninetyDaysAgo },
    });

    for (const job of veryOldJobs) {
      if (job.finalUrl) {
        // Optional: delete from R2 if you store the key
        // await r2Service.deleteFile(job.key); 
      }
      await job.deleteOne();
    }

    console.log(`Permanently deleted ${veryOldJobs.length} records + R2 files (90+ days old)`);
  } catch (err) {
    console.error('Cleanup job failed:', err);
  }
});

console.log('✅ Cleanup scheduler started (daily at 2 AM)');