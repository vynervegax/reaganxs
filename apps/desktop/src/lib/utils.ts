// apps/desktop/src/lib/utils.ts

import { clsx, type ClassValue } from 'clsx';

/** Simple className merger */
export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

/** Format bytes to human readable */
export function formatBytes(bytes: number, decimals = 1): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(decimals))} ${sizes[i]}`;
}

/** Format VRAM MB → GB string */
export function formatVram(mb: number): string {
  if (mb < 1024) return `${mb} MB`;
  return `${(mb / 1024).toFixed(1)} GB`;
}

/** Safe percentage clamp */
export function clampPercent(value: number): number {
  return Math.min(100, Math.max(0, Math.round(value)));
}

/** Model display name helper */
export const MODEL_LABELS: Record<string, string> = {
  'real-esrgan': 'Real-ESRGAN',
  'nmkd-siax': 'NMKD Siax',
  '4x-nmkd-superscale': '4x NMKD Superscale',
  '4x-nomos-webphoto-realplksr': '4x NomosWebPhoto RealPLKSR',
};

export function getModelLabel(id?: string): string {
  if (!id) return '—';
  return MODEL_LABELS[id] || id;
}