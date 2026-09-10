import sanitize from 'sanitize-filename';

export const sanitizeFilename = (filename: string): string => {
  // Remove dangerous characters and limit length
  let safeName = sanitize(filename, { replacement: '_' });
  safeName = safeName.replace(/[^a-zA-Z0-9._-]/g, '_');
  
  // Limit length
  if (safeName.length > 100) {
    safeName = safeName.substring(0, 100);
  }

  return safeName || 'unnamed_video';
};