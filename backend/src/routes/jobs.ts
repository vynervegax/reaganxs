import { Router } from 'express';
import { Job } from '../models/Job';
import { queueJob } from '../workers/jobWorker';

const router = Router();

router.post('/', async (req, res) => {
  try {
    const { tier, forceVp9, userId } = req.body;

    if (!tier || !['demo', 'free', 'premium', 'desktop'].includes(tier)) {
      return res.status(400).json({ error: 'Invalid tier' });
    }

    const job = await Job.create({
      userId,
      tier,
      forceVp9: !!forceVp9,
      status: 'queued',
    });

    await queueJob(job._id.toString());

    res.json({ jobId: job._id, status: job.status });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

router.get('/:id', async (req, res) => {
  const job = await Job.findById(req.params.id);
  if (!job) return res.status(404).json({ error: 'Not found' });
  res.json(job);
});

export default router;