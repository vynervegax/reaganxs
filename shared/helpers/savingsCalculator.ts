export function calculateSavings(originalBytes: number, finalBytes: number): number {
  if (originalBytes === 0) return 0;
  return Math.round(((originalBytes - finalBytes) / originalBytes) * 100);
}

export function estimateBandwidthSavedMB(originalMB: number, savingsPercent: number): number {
  return Math.round(originalMB * (savingsPercent / 100));
}