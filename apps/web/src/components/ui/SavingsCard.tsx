function formatTimestamp(d?: string | Date | null) {
  if (!d) return '—';
  try {
    const dt = new Date(d);
    const date = dt.toLocaleDateString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    const time = dt.toLocaleTimeString('en-GB', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false,
    });
    return `${date}, ${time}`;
  } catch {
    return '—';
  }
}

// inside the component, after the other calculations:
const stamp = job.completedAt || job.createdAt || new Date();

const facts = [
  { label: 'COMPRESSION', value: compressLine },
  { label: 'MODEL', value: restored ? label : 'None' },
  { label: 'TIMESTAMP', value: formatTimestamp(stamp) },
  {
    label: 'SIZE',
    value: `${formatBytes(orig)} → ${formatBytes(fin)}`,
  },
  ...(vmaf != null ? [{ label: 'VMAF', value: vmaf.toFixed(1) }] : []),
];