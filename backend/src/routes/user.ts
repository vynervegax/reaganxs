import { Router } from 'express';
import { authenticate } from '../middleware/auth';
import { userController } from '../controllers/userController';

const router = Router();

router.get('/profile', authenticate, userController.getProfile);

export default router;