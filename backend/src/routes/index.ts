import { Router } from 'express';
import processRoutes from './process';
import authRoutes from './auth';
import historyRoutes from './history';
import contributionRoutes from './contribution';
import viralityRoutes from './virality';
import downloadRoutes from './download';
import userRoutes from './user';
import stripeRoutes from './stripe';
import tempPremiumRoutes from './tempPremium';

const router = Router();

router.use('/process', processRoutes);
router.use('/auth', authRoutes);
router.use('/history', historyRoutes);
router.use('/contribution', contributionRoutes);
router.use('/virality', viralityRoutes);
router.use('/download', downloadRoutes);
router.use('/user', userRoutes);
router.use('/stripe', stripeRoutes);

app.use('/api/temp-premium', tempPremiumRoutes);

export default router;