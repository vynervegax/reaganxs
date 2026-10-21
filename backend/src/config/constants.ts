import path from 'path';
import os from 'os';

export const PREMIUM_PRICE_CENTS = 299; // $2.99
export const PREMIUM_PRICE_ID = process.env.STRIPE_PRICE_ID || '';
export const TEMP_PREMIUM_DAYS = 7;

export const JWT_SECRET: string =
  process.env.JWT_SECRET || 'reaganxs-dev-secret-change-me';
export const JWT_EXPIRES_IN: string = process.env.JWT_EXPIRES_IN || '7d';

export const COMPRESSION_ONLY = 'compression-only';

export const UPLOAD_TEMP_DIR =
  process.env.UPLOAD_TEMP_DIR || path.join(os.tmpdir(), 'reaganxs-uploads');

export const MAX_UPLOAD_BYTES = process.env.MAX_UPLOAD_MB
  ? Number(process.env.MAX_UPLOAD_MB) * 1024 * 1024
  : 2 * 1024 * 1024 * 1024;

/** Target ~50–70% savings when content allows (not ~96%) */
export const COMPRESS = {
  av1: {
    codec: 'libsvtav1' as const,
    preset: '8',
    crf: '31',
  },
  vp9: {
    codec: 'libvpx-vp9' as const,
    crf: '31',
  },
  audio: {
    codec: 'libopus' as const,
    bitrate: '96k',
    channels: '2',
    rate: '48000',
  },
};

export const RESTORE_ENCODE = {
  av1: { preset: '8', crf: '30' },
  vp9: { crf: '32' },
};

export const MODEL_IDS = {
  DEMO: 'rgt-webphoto',
  FREE: 'atd-webphoto',
  PREMIUM: 'atd-webphoto',
  DESKTOP: 'atd-srx4',
} as const;

export const MODEL_FILES: Record<string, string> = {
  'rgt-webphoto': '4xRealWebPhoto_v2_rtg_s.pth',
  'atd-webphoto': '4xRealWebPhoto_v3_atd.safetensors',
  'rgt-s': 'RGT_S_x4.pth',
  'atd-srx4': '003_ATD_SRx4_finetune.pth',
};

export const MODEL_DISPLAY: Record<string, string> = {
  'rgt-webphoto': 'Real Web Photo RGT',
  'atd-webphoto': 'Real Web Photo ATD',
  'rgt-s': 'RGT-S x4',
  'atd-srx4': 'ATD SRx4 Finetune',
  'compression-only': 'Compression only',
};

export type ModelId =
  | 'rgt-s'
  | 'atd-srx4'
  | 'compression-only'
  | string;

export const MODELS_DIR =
  process.env.MODELS_DIR || path.join(process.cwd(), 'models');

/** Partial = quality samples only (not a second full video) */
export const PARTIAL_BY_TIER: Record<
  string,
  { frameCount: number; maxWidth: number }
> = {
  demo: { frameCount: 6, maxWidth: 640 },
  free: { frameCount: 10, maxWidth: 960 },
  premium: { frameCount: 12, maxWidth: 1280 },
  desktop: { frameCount: 16, maxWidth: 1280 },
};

export const MIN_SAVINGS_FOR_RESTORE = 0.15;
export const TARGET_SIZE_RATIO = 0.5;