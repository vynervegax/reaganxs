import { routingService } from '../../src/services/routingService';

describe('RoutingService', () => {
  test('should restore only when beneficial', async () => {
    const decision = await routingService.decide(
      { originalSize: 1000, size: 350 }, 
      { vram: 16, isLowPower: false, batteryLevel: 80, platform: 'web' },
      { tier: 'premium' }
    );

    expect(decision.shouldRestore).toBe(true);
    expect(decision.model).toBe('real-esrgan');
  });

  test('free tier should not restore', async () => {
    const decision = await routingService.decide(
      { originalSize: 1000, size: 350 },
      { vram: 4, isLowPower: true, batteryLevel: 50, platform: 'web' },
      { tier: 'free' }
    );

    expect(decision.shouldRestore).toBe(false);
  });
});