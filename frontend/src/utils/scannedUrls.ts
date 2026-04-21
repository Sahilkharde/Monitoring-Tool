import type { ScanData } from '../store/scanStore';

/** Unique target URLs from scan history, newest-first (API list order preserved). */
export function uniqueScannedUrls(scans: ScanData[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const s of scans) {
    const u = (s.target_url || '').trim();
    if (!u || seen.has(u)) continue;
    seen.add(u);
    out.push(u);
  }
  return out;
}

export function truncateUrl(url: string, max = 42): string {
  if (url.length <= max) return url;
  return `${url.slice(0, max - 1)}…`;
}
