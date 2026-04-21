/** Display label for API scan `platform` (desktop / mweb / both). */
export function formatScanPlatform(p?: string | null): string {
  const x = (p || '').toLowerCase();
  if (x === 'mweb') return 'mWeb';
  if (x === 'desktop') return 'Desktop';
  if (x === 'both') return 'Both';
  return p || '—';
}
