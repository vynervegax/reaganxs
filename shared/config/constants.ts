export const MODEL_FILES = {
  '4x-bhi': '4xBHI_realplksr_dysample_real.safetensors',
  '4x-purephoto': '4xPurePhoto-RealPLSKR.pth',
  'rgt-s': 'RGT_S_x4.pth',
  'atd-srx4': '003_ATD_SRx4_finetune.pth',
} as const;

export const MODEL_DISPLAY = {
  '4x-bhi': '4x BHI RealPLKSR',
  '4x-purephoto': '4x PurePhoto RealPLSKR',
  'rgt-s': 'RGT-S x4',
  'atd-srx4': 'ATD SRx4 Finetune',
} as const;

export const COMPRESSION = {
  primary: 'libsvtav1',
  fallback: 'libvpx-vp9',
  svtPreset: 8,
  svtCrf: 33,
  vp9Crf: 32,
};