//packages/core/src/config/constant.ts

export const MODEL_FILES: Record<string, string> = {
  'rgt-webphoto': '4xRealWebPhoto_v2_rtg_s.pth',
  'atd-webphoto': '4xRealWebPhoto_v3_atd.safetensors',
  'rgt-s': 'RGT_S_x4.pth',
  'atd-srx4': '003_ATD_SRx4_finetune.pth',
  '4x-bhi': '4xBHI_realplksr_dysample_real.safetensors',
};

export const MODEL_DISPLAY: Record<string, string> = {
  'rgt-webphoto': 'Real Web Photo RGT',
  'atd-webphoto': 'Real Web Photo ATD',
  'rgt-s': 'RGT-S x4',
  'atd-srx4': 'ATD SRx4 Finetune',
  '4x-bhi': '4x BHI RealPLKSR',
  'compression-only': 'Compression only',
};

export const COMPRESSION = {
  primary: 'libsvtav1',
  fallback: 'libvpx-vp9',
  svtPreset: 8,
  svtCrf: 28, // align with web target quality if you want parity
  vp9Crf: 28,
  audioCodec: 'libopus',
  audioBitrate: '96k',
  audioChannels: 2,
  audioRate: 48000,
};

export const RESTORE_MIN_SAVINGS = 0.15;