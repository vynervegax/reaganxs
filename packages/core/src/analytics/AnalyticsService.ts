export class AnalyticsService {
  calculateSavings(original: number, final: number) {
    return Math.round(((original - final) / original) * 100);
  }

  trackCommunitySavings(savingsMB: number) {
    console.log(`[Community] +${savingsMB}MB saved`);
  }
}