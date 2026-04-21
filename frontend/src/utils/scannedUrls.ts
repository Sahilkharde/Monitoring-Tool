import type { ScanData } from '../store/scanStore';

/** Normalize URL for matching (origin + path, trailing slash, case). */
export function normalizeUrlForMatch(u: string): string {
  const raw = (u || '').trim();
  if (!raw) return '';
  try {
    const url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
    const origin = url.origin.toLowerCase();
    let path = url.pathname || '/';
    if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
    return `${origin}${path}${url.search}`;
  } catch {
    return raw.toLowerCase().replace(/\/$/, '');
  }
}

/** Most recent scan row for this target (by started_at / completed_at). */
export function latestScanForTargetUrl(scans: ScanData[], url: string): ScanData | undefined {
  const target = normalizeUrlForMatch(url);
  if (!target) return undefined;
  const matches = scans.filter((s) => normalizeUrlForMatch(s.target_url || '') === target);
  if (matches.length === 0) return undefined;
  matches.sort((a, b) => {
    const ta = new Date(a.started_at || a.completed_at || 0).getTime();
    const tb = new Date(b.started_at || b.completed_at || 0).getTime();
    return tb - ta;
  });
  return matches[0];
}

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
