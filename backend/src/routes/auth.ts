import { Router, Response, NextFunction } from 'express';
import { authService } from '../services/authService';
import { authenticate } from '../middleware/auth';
import type { AuthRequest } from '../types/auth';

const router = Router();

/** POST /api/auth/register */
router.post('/register', async (req, res: Response) => {
  try {
    const { email, password, name } = req.body || {};
    if (!email || !password) {
      return res
        .status(400)
        .json({ success: false, message: 'Email and password are required' });
    }

    const result = await authService.register(
      String(email).trim(),
      String(password),
      name ? String(name).trim() : undefined
    );

    return res.status(201).json({
      success: true,
      token: result.token,
      user: result.user,
    });
  } catch (e: any) {
    const msg = e?.message || 'Registration failed';
    const status = msg.includes('already') ? 409 : 400;
    return res.status(status).json({ success: false, message: msg });
  }
});

/** POST /api/auth/login */
router.post('/login', async (req, res: Response) => {
  try {
    const { email, password } = req.body || {};
    if (!email || !password) {
      return res
        .status(400)
        .json({ success: false, message: 'Email and password are required' });
    }

    const result = await authService.login(
      String(email).trim(),
      String(password)
    );

    return res.json({
      success: true,
      token: result.token,
      user: result.user,
    });
  } catch (e: any) {
    return res.status(401).json({
      success: false,
      message: e?.message || 'Invalid email or password',
    });
  }
});

/** POST /api/auth/forgot-password */
router.post('/forgot-password', async (req, res: Response) => {
  try {
    const email = String(req.body?.email || '').trim();
    if (!email) {
      return res
        .status(400)
        .json({ success: false, message: 'Email is required' });
    }

    const result = await authService.forgotPassword(email);

    const body: Record<string, unknown> = {
      success: true,
      message: result.message,
    };

    // Dev-only: return token so you can test reset without email
    if (process.env.NODE_ENV !== 'production' && result.resetToken) {
      body.resetToken = result.resetToken;
    }

    return res.json(body);
  } catch (e: any) {
    return res.status(400).json({
      success: false,
      message: e?.message || 'Request failed',
    });
  }
});

/** POST /api/auth/reset-password */
router.post('/reset-password', async (req, res: Response) => {
  try {
    const token = String(req.body?.token || '');
    const password = String(
      req.body?.password || req.body?.newPassword || ''
    );

    if (!token || !password) {
      return res.status(400).json({
        success: false,
        message: 'Token and new password are required',
      });
    }

    const result = await authService.resetPassword(token, password);
    return res.json({ success: true, message: result.message });
  } catch (e: any) {
    return res.status(400).json({
      success: false,
      message: e?.message || 'Reset failed',
    });
  }
});

/** GET /api/auth/me */
router.get(
  '/me',
  authenticate as any,
  async (req: AuthRequest, res: Response, _next: NextFunction) => {
    try {
      if (!req.user?.id) {
        return res
          .status(401)
          .json({ success: false, message: 'Authentication required' });
      }

      const user = await authService.getUserById(req.user.id);

      return res.json({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          tier: user.tier,
          tempPremiumExpiresAt: user.tempPremiumExpiresAt,
          createdAt: user.createdAt,
        },
      });
    } catch (e: any) {
      return res.status(404).json({
        success: false,
        message: e?.message || 'User not found',
      });
    }
  }
);

export default router;