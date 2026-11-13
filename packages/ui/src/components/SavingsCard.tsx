// package/ui/src/components/SavingsCard.tsx
import { useRef, useEffect } from 'react';

interface SavingsCardProps {
  originalSize: number;      // bytes
  finalSize: number;         // bytes
  savingsPercent: number;
  modelUsed?: string;
  codec?: string;
  crf?: number | string;
  preset?: number | string;
  vmafScore?: number | null;
  restored: boolean;
  mediaKind?: string;
  tier?: string;
  jobId?: string;
  expiresAt?: string | Date | null;   // Cloudflare R2 expiry
  onDownload?: (dataUrl: string) => void;
}

export function SavingsCard({
  originalSize,
  finalSize,
  savingsPercent,
  modelUsed,
  codec,
  crf,
  preset,
  vmafScore,
  restored,
  mediaKind = 'video',
  tier = 'free',
  jobId,
  expiresAt,
  onDownload,
}: SavingsCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const formatSize = (bytes: number) => {
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
  };

  const expiryLabel = () => {
    if (!expiresAt) return '48 hours';
    try {
      const d = new Date(expiresAt);
      const hours = Math.round((d.getTime() - Date.now()) / 36e5);
      if (hours > 0 && hours < 72) return `${hours} hours`;
      return d.toLocaleDateString();
    } catch {
      return '48 hours';
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = 840;
    const H = 620;
    canvas.width = W;
    canvas.height = H;

    // Background
    ctx.fillStyle = '#1c1917';
    ctx.fillRect(0, 0, W, H);

    // Outer border
    ctx.strokeStyle = '#292524';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(0.75, 0.75, W - 1.5, H - 1.5);

    // Header
    ctx.fillStyle = '#f97316';
    ctx.font = 'bold 32px system-ui, sans-serif';
    ctx.fillText('ReaganXS', 36, 52);

    ctx.fillStyle = '#a8a29e';
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillText('Results', 36, 76);

    // Tier badge
    ctx.fillStyle = '#292524';
    ctx.beginPath();
    ctx.roundRect(W - 156, 32, 120, 32, 16);
    ctx.fill();
    ctx.fillStyle = '#d6d3d1';
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(tier.toUpperCase(), W - 96, 52);
    ctx.textAlign = 'left';

    // Big savings
    ctx.fillStyle = '#f97316';
    ctx.font = 'bold 80px system-ui, sans-serif';
    ctx.fillText(`${Math.round(savingsPercent)}%`, 36, 190);

    ctx.fillStyle = '#a8a29e';
    ctx.font = '16px system-ui, sans-serif';
    ctx.fillText('Bandwidth saved', 36, 218);

    ctx.fillStyle = '#e7e5e4';
    ctx.font = '16px system-ui, sans-serif';
    ctx.fillText(
      `${formatSize(originalSize)} → ${formatSize(finalSize)}`,
      36,
      246
    );

    // Pipeline card
    const pipeY = 280;
    ctx.fillStyle = '#292524';
    ctx.beginPath();
    ctx.roundRect(28, pipeY, W - 56, 180, 14);
    ctx.fill();

    ctx.fillStyle = '#fafaf9';
    ctx.font = 'bold 17px system-ui, sans-serif';
    ctx.fillText('Processing Pipeline', 48, pipeY + 32);

    const compressSub = [
      codec ? codec.toUpperCase() : 'SVT-AV1',
      crf != null ? `CRF ${crf}` : null,
      preset != null ? `Preset ${preset}` : null,
    ]
      .filter(Boolean)
      .join(' • ');

    const steps = [
      {
        n: '1',
        title: 'Aggressive Compression',
        sub: compressSub || 'SVT-AV1',
      },
      {
        n: '2',
        title: restored ? 'Smart Routing + Restoration' : 'Smart Routing',
        sub: restored ? (modelUsed || 'Restored') : 'Compressed only',
      },
      {
        n: '3',
        title: 'Upload to Cloudflare R2',
        sub: `${expiryLabel()} expiry`,
      },
    ];

    steps.forEach((s, i) => {
      const y = pipeY + 68 + i * 36;
      // green circle
      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      ctx.arc(60, y - 4, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1c1917';
      ctx.font = 'bold 12px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(s.n, 60, y);
      ctx.textAlign = 'left';

      ctx.fillStyle = '#fafaf9';
      ctx.font = '14px system-ui, sans-serif';
      ctx.fillText(s.title, 84, y);
      ctx.fillStyle = '#a8a29e';
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText(s.sub, 340, y);
    });

    // Bottom stats row
    const statsY = 500;
    const stats = [
      { label: 'VMAF', value: vmafScore != null ? String(Math.round(vmafScore)) : 'Not measured' },
      { label: 'Model', value: modelUsed || (restored ? 'Restored' : '—') },
      { label: 'Codec', value: codec || '—' },
    ];

    stats.forEach((st, i) => {
      const x = 48 + i * 250;
      ctx.fillStyle = '#a8a29e';
      ctx.font = '12px system-ui, sans-serif';
      ctx.fillText(st.label, x, statsY);
      ctx.fillStyle = '#fafaf9';
      ctx.font = 'bold 15px system-ui, sans-serif';
      ctx.fillText(st.value, x, statsY + 22);
    });

    // Footer
    if (jobId) {
      ctx.fillStyle = '#57534e';
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillText(`Job ${jobId.slice(-8)}`, 36, H - 20);
    }
  }, [
    originalSize,
    finalSize,
    savingsPercent,
    modelUsed,
    codec,
    crf,
    preset,
    vmafScore,
    restored,
    mediaKind,
    tier,
    jobId,
    expiresAt,
  ]);

  const download = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const url = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = url;
    a.download = `reaganxs-savings-${Math.round(savingsPercent)}pct.png`;
    a.click();
    onDownload?.(url);
  };

  return (
    <div className="space-y-3">
      <canvas
        ref={canvasRef}
        className="w-full max-w-lg rounded-xl border border-stone-800"
        style={{ imageRendering: 'auto' }}
      />
      <button
        onClick={download}
        className="px-4 py-2 text-sm rounded-lg bg-orange-600 hover:bg-orange-500 text-white"
      >
        Download savings card
      </button>
    </div>
  );
}