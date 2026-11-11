export type MediaKind = 'video' | 'image' | 'audio' | 'text' | 'custom';

export type MediaKindConfig = {
  id: MediaKind;
  label: string;
  mimeAllow: string[];
  extensions: string[];
  maxFileSizeMB: number | null;
  processor: 'video' | 'image' | 'audio' | 'text' | 'passthrough';
  enabled: boolean;
};

export const MEDIA_KINDS: Record<MediaKind, MediaKindConfig> = {
  video: {
    id: 'video',
    label: 'Video',
    mimeAllow: ['video/'],
    extensions: ['.mp4', '.mov', '.webm', '.mkv', '.avi', '.m4v'],
    maxFileSizeMB: null,
    processor: 'video',
    enabled: true,
  },
  image: {
    id: 'image',
    label: 'Image / graphic',
    mimeAllow: ['image/'],
    extensions: ['.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif', '.tif', '.tiff', '.bmp'],
    maxFileSizeMB: null,
    processor: 'image',
    enabled: true,
  },
  audio: {
    id: 'audio',
    label: 'Audio',
    mimeAllow: ['audio/'],
    extensions: ['.mp3', '.wav', '.flac', '.m4a', '.aac', '.ogg', '.opus'],
    maxFileSizeMB: null,
    processor: 'audio',
    enabled: false,
  },
  text: {
    id: 'text',
    label: 'Text',
    mimeAllow: ['text/', 'application/pdf'],
    extensions: ['.txt', '.srt', '.vtt', '.pdf'],
    maxFileSizeMB: 50,
    processor: 'text',
    enabled: false,
  },
  custom: {
    id: 'custom',
    label: 'Custom',
    mimeAllow: [],
    extensions: [],
    maxFileSizeMB: null,
    processor: 'passthrough',
    enabled: false,
  },
};

export function resolveMediaKind(
  mime?: string | null,
  filename?: string | null
): MediaKind {
  const m = (mime || '').toLowerCase().trim();
  const name = (filename || '').toLowerCase().trim();
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')) : '';

  for (const cfg of Object.values(MEDIA_KINDS)) {
    if (!cfg.enabled) continue;
    if (m && cfg.mimeAllow.some((p) => (p.endsWith('/') ? m.startsWith(p) : m === p))) {
      return cfg.id;
    }
    if (ext && cfg.extensions.includes(ext)) return cfg.id;
  }
  return 'video';
}

export function isMimeAllowed(mime?: string | null, filename?: string | null): boolean {
  const kind = resolveMediaKind(mime, filename);
  const cfg = MEDIA_KINDS[kind];
  if (!cfg?.enabled) return false;
  const m = (mime || '').toLowerCase();
  const name = (filename || '').toLowerCase();
  const ext = name.includes('.') ? name.slice(name.lastIndexOf('.')) : '';
  if (m && cfg.mimeAllow.some((p) => (p.endsWith('/') ? m.startsWith(p) : m === p))) return true;
  if (ext && cfg.extensions.includes(ext)) return true;
  return false;
}