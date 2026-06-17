export function downloadCsv(
  filename: string,
  rows: Record<string, string | number>[],
): void {
  if (!rows.length) return;

  const headers = Object.keys(rows[0]);
  const escape = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const csv = [
    headers.join(','),
    ...rows.map(r => headers.map(h => escape(r[h] ?? '')).join(',')),
  ].join('\n');

  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function deriveActivityStatus(lastActiveAt: string | null): string {
  if (!lastActiveAt) return 'Offline';
  const diff = Date.now() - new Date(lastActiveAt).getTime();
  if (diff < 5 * 60 * 1000) return 'Active';
  if (diff < 60 * 60 * 1000) return 'Idle';
  return 'Offline';
}
