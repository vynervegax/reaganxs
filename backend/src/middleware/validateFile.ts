import { Request, Response, NextFunction } from 'express';

export const validateFileMiddleware = (req: Request, res: Response, next: NextFunction) => {
  const file = req.file;

  if (!file) {
    return res.status(400).json({ 
      success: false, 
      message: 'No file uploaded' 
    });
  }

  // File type validation
  if (!file.mimetype.startsWith('video/')) {
    return res.status(400).json({ 
      success: false, 
      message: 'Only video files are allowed' 
    });
  }

  // File extension validation
  const allowedExtensions = ['.mp4', '.mov', '.avi', '.webm', '.mkv'];
  const fileExt = '.' + file.originalname.split('.').pop()?.toLowerCase();
  
  if (!allowedExtensions.includes(fileExt)) {
    return res.status(400).json({ 
      success: false, 
      message: 'Unsupported video format' 
    });
  }

  // Size limit (2GB)
  if (file.size > 2 * 1024 * 1024 * 1024) {
    return res.status(400).json({ 
      success: false, 
      message: 'File size exceeds 2GB limit' 
    });
  }

  next();
};