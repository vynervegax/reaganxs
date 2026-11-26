// apps/web/src/lib/webUpload.ts

export type SpeedResult = {
  mbps: number;
  slow: boolean;
  effectiveType?: string;
};

export async function estimateUploadSpeed(): Promise<SpeedResult> {
  const conn = (navigator as any).connection;
  if (conn) {
    const effectiveType = conn.effectiveType as string | undefined;
    const downlink = conn.downlink as number | undefined;
    if (effectiveType && ['slow-2g', '2g', '3g'].includes(effectiveType)) {
      return { mbps: downlink ?? 1, slow: true, effectiveType };
    }
    if (downlink && downlink < 5) {
      return { mbps: downlink, slow: true, effectiveType };
    }
  }

  try {
    const blob = new Blob([new Uint8Array(256 * 1024)]);
    const start = performance.now();
    await fetch('/api/probe', { method: 'POST', body: blob }).catch(() => {});
    const elapsed = (performance.now() - start) / 1000;
    const mbps = (0.256 * 8) / Math.max(elapsed, 0.1);
    return { mbps, slow: mbps < 5 };
  } catch {
    return { mbps: 0, slow: false };
  }
}

export function slowConnectionMessage(): string {
  return 'Your connection looks slow. We’re prioritising speed so your video finishes sooner. For better quality (AV1), try a faster network or Wi-Fi.';
}

export type WebJobPayload = {
  tier: 'demo' | 'free';
  forceVp9: boolean;
  [key: string]: unknown;
};

/**
 * Demo: always VP9.
 * Free: VP9 only when connection is slow.
 */
export async function prepareWebJob(
  tier: 'demo' | 'free',
  basePayload: Record<string, unknown>
): Promise<WebJobPayload> {
  if (tier === 'demo') {
    return {
      ...basePayload,
      tier: 'demo',
      forceVp9: true,
    };
  }

  const speed = await estimateUploadSpeed();
  const forceVp9 = speed.slow;

  if (forceVp9) {
    console.info(slowConnectionMessage());
    // Caller should surface this message in the UI
  }

  return {
    ...basePayload,
    tier: 'free',
    forceVp9,
  };
}