import { Request, Response } from 'express';
import { User } from '../models/User';

export const userController = {
  async getProfile(req: Request, res: Response) {
    try {
      const userId = (req as any).user?._id;
      
      if (!userId) {
        return res.status(401).json({ success: false, message: 'Unauthorized' });
      }

      const user = await User.findById(userId)
        .select('-password -resetPasswordToken -resetPasswordExpires');

      if (!user) {
        return res.status(404).json({ success: false, message: 'User not found' });
      }

      res.json({ success: true, user });
    } catch (error: any) {
      console.error('Profile fetch error:', error);
      res.status(500).json({ success: false, message: 'Failed to fetch profile' });
    }
  },

  async updateTier(req: Request, res: Response) {
    try {
      const { tier } = req.body;
      const user = await User.findByIdAndUpdate(
        (req as any).user._id,
        { tier },
        { new: true }
      ).select('-password');

      res.json({ success: true, user });
    } catch (error: any) {
      res.status(500).json({ success: false, message: error.message });
    }
  },
};