export function validateVideoFile(file: File): string | null {
  if (!file.type.startsWith('video/')) {
    return "Only video files are allowed";
  }
  if (file.size > 2 * 1024 * 1024 * 1024) { // 2GB
    return "File size exceeds 2GB limit";
  }
  return null;
}