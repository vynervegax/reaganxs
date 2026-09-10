import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../models/User';
import { sendVerificationEmail } from '../services/emailService';

export const authController = {
  // Register new user
  async register(req: Request, res: Response) {
    try {
      const { email, password, name } = req.body;

      // Check if user exists
      const existingUser = await User.findOne({ email });
      if (existingUser) {
        return res.status(400).json({ error: 'User already exists' });
      }

      // Hash password
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(password, salt);

      // Create user with FREE tier by default
      const newUser = await User.create({
        email,
        password: hashedPassword,
        name,
        tier: 'free',           // ← Important: New users start as FREE
        verified: false,
      });

      // Send verification email (optional)
      await sendVerificationEmail(email, newUser._id);

      // Generate JWT
      const token = jwt.sign(
        { id: newUser._id, email: newUser.email, tier: newUser.tier },
        process.env.JWT_SECRET!,
        { expiresIn: '7d' }
      );

      res.status(201).json({
        success: true,
        message: 'User registered successfully',
        token,
        user: {
          id: newUser._id,
          email: newUser.email,
          name: newUser.name,
          tier: newUser.tier,
        },
      });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: 'Registration failed' });
    }
  },

  // Login
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

      const token = jwt.sign(
        { id: user._id, email: user.email, tier: user.tier },
        process.env.JWT_SECRET!,
        { expiresIn: '7d' }
      );

      res.json({
        success: true,
        token,
        user: {
          id: user._id,
          email: user.email,
          name: user.name,
          tier: user.tier,
        },
      });
    } catch (error: any) {
      console.error(error);
      res.status(500).json({ error: 'Login failed' });
    }
  },

  // Forgot Password (stub)
  async forgotPassword(req: Request, res: Response) {
    // Implement with Resend email
    res.json({ message: 'Password reset link sent' });
  },

  // Reset Password (stub)
  async resetPassword(req: Request, res: Response) {
    res.json({ message: 'Password reset successful' });
  },
};