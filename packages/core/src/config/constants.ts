export const MODEL_FILES: Record<string, string> = {
  '4x-bhi': '4xBHI_realplksr_dysample_real.safetensors',
  '4x-purephoto': '4xPurePhoto-RealPLSKR.pth',
  'rgt-s': 'RGT_S_x4.pth',
  'atd-srx4': '003_ATD_SRx4_finetune.pth',
};

export const MODEL_DISPLAY: Record<string, string> = {
  '4x-bhi': '4x BHI RealPLKSR',
  '4x-purephoto': '4x PurePhoto RealPLSKR',
  'rgt-s': 'RGT-S x4',
  'atd-srx4': 'ATD SRx4 Finetune',
};

export const COMPRESSION = {
  primary: 'libsvtav1',
  fallback: 'libvpx-vp9',
  svtPreset: 8,
  svtCrf: 33,
  vp9Crf: 32,
  audioCodec: 'libopus',
  audioBitrate: '96k',
  audioChannels: 2,
  audioRate: 48000,
};

export const RESTORE_MIN_SAVINGS = 0.15;