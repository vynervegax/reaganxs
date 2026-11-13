// package/ui/src/components/SavingsCard.tsx
import { useRef, useEffect } from 'react';

interface SavingsCardProps {
  originalSize: number;      // bytes
  finalSize: number;         // bytes
  savingsPercent: number;
  modelUsed?: string;
  codec?: string;
  vmafScore?: number | null;
  restored: boolean;
  mediaKind?: string;
  tier?: string;
  jobId?: string;
  onDownload?: (dataUrl: string) => void;
}

export function SavingsCard({
  originalSize,
  finalSize,
  savingsPercent,
  modelUsed,
  codec,
  vmafScore,
  restored,
  mediaKind = 'video',
  tier = 'free',
  jobId,
  onDownload,
}: SavingsCardProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const formatSize = (bytes: number) => {
    if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const W = 800;
    const H = 520;
    canvas.width = W;
    canvas.height = H;

    // Background
    ctx.fillStyle = '#1a1614';
    ctx.fillRect(0, 0, W, H);

    // Subtle border
    ctx.strokeStyle = '#2a2420';
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, W - 2, H - 2);

    // Header
    ctx.fillStyle = '#f97316';
    ctx.font = 'bold 28px system-ui, sans-serif';
    ctx.fillText('ReaganXS', 32, 48);

    ctx.fillStyle = '#a8a29e';
    ctx.font = '14px system-ui, sans-serif';
    ctx.fillText('Results', 32, 72);

    // Tier badge
    ctx.fillStyle = '#3f3a36';
    ctx.beginPath();
    ctx.roundRect(W - 140, 28, 108, 28, 14);
    ctx.fill();
    ctx.fillStyle = '#c4b5a0';
    ctx.font = '12px system-ui, sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText(tier.toUpperCase(), W - 86, 46);
    ctx.textAlign = 'left';

    // Main savings
    ctx.fillStyle = '#f97316';
    ctx.font = 'bold 72px system-ui, sans-serif';
    ctx.fillText(`${Math.round(savingsPercent)}%`, 32, 180);

    ctx.fillStyle = '#a8a29e';
    ctx.font = '16px system-ui, sans-serif';
    ctx.fillText('Bandwidth saved', 32, 210);

    ctx.fillStyle = '#d6d3d1';
    ctx.font = '15px system-ui, sans-serif';
    ctx.fillText(
      `${formatSize(originalSize)} → ${formatSize(finalSize)}`,
      32,
      236
    );

    // Pipeline section
    const pipeY = 280;
    ctx.fillStyle = '#292524';
    ctx.beginPath();
    ctx.roundRect(24, pipeY, W - 48, 140, 12);
    ctx.fill();

    ctx.fillStyle = '#fafaf9';
    ctx.font = 'bold 16px system-ui, sans-serif';
    ctx.fillText('Processing Pipeline', 40, pipeY + 28);

    const steps = [
      { n: '1', title: 'Aggressive Compression', sub: codec ? codec.toUpperCase() : 'SVT-AV1' },
      { n: '2', title: restored ? 'Smart Routing + Restoration' : 'Smart Routing', sub: restored ? (modelUsed || 'Restored') : 'Compressed only' },
      { n: '3', title: 'Ready for download', sub: mediaKind === 'image' ? 'Image' : 'Video' },
    ];

    steps.forEach((s, i) => {
      const y = pipeY + 58 + i * 28;
      ctx.fillStyle = '#22c55e';
      ctx.beginPath();
      ctx.arc(52, y - 4, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#1a1614';
      ctx.font = 'bold 11px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText(s.n, 52, y);
      ctx.textAlign = 'left';
      ctx.fillStyle = '#fafaf9';
      ctx.font = '13px system-ui, sans-serif';
      ctx.fillText(s.title, 72, y);
      ctx.fillStyle = '#a8a29e';
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillText(s.sub, 280, y);
    });

    // Bottom stats
    const statsY = 450;
    const stats = [
      { label: 'VMAF', value: vmafScore != null ? String(Math.round(vmafScore)) : '—' },
      { label: 'Model', value: modelUsed || (restored ? 'Restored' : '—') },
      { label: 'Codec', value: codec || '—' },
    ];

    stats.forEach((st, i) => {
      const x = 40 + i * 240;
      ctx.fillStyle = '#a8a29e';
      ctx.font = '11px system-ui, sans-serif';
      ctx.fillText(st.label, x, statsY);
      ctx.fillStyle = '#fafaf9';
      ctx.font = 'bold 14px system-ui, sans-serif';
      ctx.fillText(st.value, x, statsY + 20);
    });

    // Footer
    if (jobId) {
      ctx.fillStyle = '#57534e';
      ctx.font = '10px system-ui, sans-serif';
      ctx.fillText(`Job ${jobId.slice(-8)}`, 32, H - 16);
    }
  }, [originalSize, finalSize, savingsPercent, modelUsed, codec, vmafScore, restored, mediaKind, tier, jobId]);

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
        className="w-full max-w-md rounded-xl border border-stone-800"
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