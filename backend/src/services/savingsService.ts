export const savingsService = {
  calculate(originalBytes: number, finalBytes: number): number {
    if (originalBytes === 0) return 0;
    return Math.round(((originalBytes - finalBytes) / originalBytes) * 100);
  },

  estimateMonthlySavings(dailyAvgMB: number): number {
    return Math.round(dailyAvgMB * 30);
  },
};