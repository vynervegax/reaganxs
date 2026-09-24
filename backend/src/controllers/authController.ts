import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../models/User';
import { sendVerificationEmail } from '../services/emailService';

const JWT_SECRET = process.env.JWT_SECRET || '';
const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://localhost:3000').replace(/\/$/, '');

function signToken(user: { _id: unknown; email: string; tier: string }) {
  const id = String(user._id);
  return jwt.sign({ id, email: user.email, tier: user.tier }, JWT_SECRET, {
    expiresIn: '7d',
  });
}

function publicUser(user: { _id: unknown; email: string; name?: string; tier: string }) {
  return {
    id: String(user._id),
    email: user.email,
    name: user.name,
    tier: user.tier,
  };
}

export const authController = {
  async register(req: Request, res: Response) {
    try {
      const { email, password, name } = req.body;

      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ error: 'User already exists' });
      }

      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      const newUser = await User.create({
        email,
        password: hashedPassword,
        name,
        tier: 'free',
        verified: false,
      });

      const userId = String(newUser._id);
      const verifyLink = `${FRONTEND_URL}/verify?uid=${encodeURIComponent(userId)}`;
      await sendVerificationEmail(email, verifyLink);

      const token = signToken(newUser as any);

      return res.status(201).json({
        success: true,
        message: 'User registered successfully',
        token,
        user: publicUser(newUser as any),
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Registration failed' });
    }
  },

  async login(req: Request, res: Response) {
    try {
      const { email, password } = req.body;

      const user = await User.findOne({ email });
      if (!user) {
        return res.status(400).json({ error: 'Invalid credentials' });
      }

      const isMatch = await bcrypt.compare(password, user.password);
      if (!isMatch) {
        return res.status(400).json({ error: 'Invalid credentials' });
      }

      const token = signToken(user as any);

      return res.json({
        success: true,
        token,
        user: publicUser(user as any),
      });
    } catch (error) {
      console.error(error);
      return res.status(500).json({ error: 'Login failed' });
    }
  },

  async forgotPassword(req: Request, res: Response) {
    return res.json({ message: 'Password reset link sent' });
  },

  async resetPassword(_req: Request, res: Response) {
    return res.json({ message: 'Password reset successful' });
  },
};