import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  GitCompare,
  Globe,
  Loader2,
  AlertCircle,
  ArrowRight,
  CheckSquare,
  Square,
  ExternalLink,
  Sparkles,
  Monitor,
  Smartphone,
} from 'lucide-react';
import clsx from 'clsx';
import { formatDistanceToNow } from 'date-fns';
import { useScanStore } from '../store/scanStore';
import type { ScanData } from '../store/scanStore';
import { api } from '../utils/api';
import { formatScanPlatform } from '../utils/scanPlatform';

const MAX_COMPARE = 5;

function getDomain(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url.slice(0, 48);
  }
}

function countBySeverity(findings: ScanData['findings'], sev: string) {
  return (findings ?? []).filter((f) => f.severity === sev).length;
}

function scoreTone(score: number | null | undefined): string {
  if (score == null || Number.isNaN(score)) return 'text-zinc-500';
  if (score >= 90) return 'text-emerald-400';
  if (score >= 70) return 'text-amber-400';
  if (score >= 50) return 'text-orange-400';
  return 'text-red-400';
}

function ComparisonColumnPlatformHeader({ scan }: { scan: ScanData }) {
  const pl = (scan.platform || '').toLowerCase();
  const label = formatScanPlatform(scan.platform);
  const Icon = pl === 'mweb' ? Smartphone : pl === 'both' ? Globe : Monitor;
  return (
    <div className="inline-flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[rgba(99,102,241,0.12)] px-2.5 py-1.5 text-xs font-bold tracking-wide text-[var(--text-primary)]">
      <Icon className="h-3.5 w-3.5 shrink-0 text-violet-300" aria-hidden />
      <span>{label}</span>
    </div>
  );
}

export default function Comparison() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { scans, loadScans } = useScanStore();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [detailById, setDetailById] = useState<Record<string, ScanData>>({});
  const [loadingDetail, setLoadingDetail] = useState(false);
  const hydratedFromQuery = useRef<string | null>(null);

  useEffect(() => {
    void loadScans();
  }, [loadScans]);

  /** Open from Competition (or shared link): /compare?ids=scan-a,scan-b */
  useEffect(() => {
    const idsParam = searchParams.get('ids');
    if (!idsParam?.trim()) return;
    const ids = idsParam
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    if (ids.length < 2) return;

    const completedList = scans.filter((s) => s.status === 'completed' && s.overall_score != null);
    const valid = ids.filter((id) => completedList.some((s) => s.scan_id === id));
    if (valid.length < 2) return;

    if (hydratedFromQuery.current === idsParam) return;
    hydratedFromQuery.current = idsParam;

    setSelected(new Set(valid));
    setSearchParams({}, { replace: true });

    void (async () => {
      setLoadingDetail(true);
      try {
        const settled = await Promise.allSettled(
          valid.map((id) => api.get<ScanData>(`/scans/${id}`).then((row) => ({ id, row }))),
        );
        const next: Record<string, ScanData> = {};
        for (const r of settled) {
          if (r.status === 'fulfilled') next[r.value.id] = r.value.row;
        }
        setDetailById(next);
      } finally {
        setLoadingDetail(false);
      }
    })();
  }, [searchParams, scans, setSearchParams]);

  const completed = useMemo(
    () => scans.filter((s) => s.status === 'completed' && s.overall_score != null),
    [scans],
  );

  const toggle = useCallback((scanId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(scanId)) next.delete(scanId);
      else if (next.size < MAX_COMPARE) next.add(scanId);
      return next;
    });
  }, []);

  const selectedOrdered = useMemo(() => {
    const ids = Array.from(selected);
    return completed.filter((s) => ids.includes(s.scan_id));
  }, [completed, selected]);

  const runCompare = useCallback(async () => {
    if (selected.size < 2) return;
    setLoadingDetail(true);
    try {
      const ids = Array.from(selected);
      const settled = await Promise.allSettled(
        ids.map((id) => api.get<ScanData>(`/scans/${id}`).then((row) => ({ id, row }))),
      );
      const next: Record<string, ScanData> = {};
      for (const r of settled) {
        if (r.status === 'fulfilled') next[r.value.id] = r.value.row;
      }
      setDetailById(next);
    } catch {
      setDetailById({});
    } finally {
      setLoadingDetail(false);
    }
  }, [selected]);

  /** Full scan rows from API (only targets that loaded successfully). */
  const columns = useMemo(() => {
    return selectedOrdered.map((s) => detailById[s.scan_id]).filter((c): c is ScanData => c != null);
  }, [selectedOrdered, detailById]);

  const detailCount = Object.keys(detailById).length;
  const hasMatrix = columns.length >= 2 && !loadingDetail;
  const partialLoad = selected.size >= 2 && detailCount > 0 && detailCount < selected.size;

  return (
    <div className="min-h-0 bg-[var(--bg-primary)] text-[var(--text-primary)]">
      <div className="border-b border-[var(--border)] px-4 py-5 sm:px-6">
        <div className="mx-auto max-w-6xl">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <div className="flex items-center gap-2 text-[var(--accent)]">
                <GitCompare className="h-6 w-6" />
                <span className="text-xs font-semibold uppercase tracking-wider">Analysis</span>
              </div>
              <h1 className="mt-1 text-2xl font-bold tracking-tight">Partner &amp; URL comparison</h1>
              <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[var(--text-secondary)]">
                Pick two or more completed scans to compare scores side by side—useful when evaluating migration
                partners or benchmarking OTT properties against each other.
              </p>
            </div>
            <Link
              to="/control-center"
              className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-[var(--border)] px-4 py-2.5 text-sm font-semibold text-[var(--text-primary)] transition-colors hover:bg-white/[0.04]"
            >
              Run new scan
              <ArrowRight className="h-4 w-4 opacity-70" />
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-6xl space-y-8 px-4 py-8 sm:px-6">
        {/* Selection */}
        <section className="card rounded-2xl border border-[var(--border)] p-5 sm:p-7">
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Select scans to compare</h2>
              <p className="mt-1 text-sm text-[var(--text-tertiary)]">
                Up to {MAX_COMPARE} targets. Order of selection is preserved (first column can be your baseline).
              </p>
            </div>
            <span className="rounded-full bg-[rgba(99,102,241,0.12)] px-3 py-1 text-xs font-semibold text-[var(--accent)]">
              {selected.size} / {MAX_COMPARE} selected
            </span>
          </div>

          {completed.length === 0 ? (
            <div className="flex flex-col items-center rounded-xl border border-dashed border-[var(--border)] py-14 text-center">
              <AlertCircle className="mb-3 h-10 w-10 text-[var(--text-tertiary)]" />
              <p className="text-sm text-[var(--text-secondary)]">No completed scans yet.</p>
              <p className="mt-1 text-sm text-[var(--text-tertiary)]">
                Run at least two verifications from Control Center, then return here.
              </p>
            </div>
          ) : (
            <ul className="space-y-2">
              {completed.map((scan) => {
                const on = selected.has(scan.scan_id);
                const order = Array.from(selected).indexOf(scan.scan_id);
                return (
                  <li key={scan.scan_id}>
                    <button
                      type="button"
                      onClick={() => toggle(scan.scan_id)}
                      className={clsx(
                        'flex w-full items-center gap-3 rounded-xl border px-4 py-3.5 text-left transition-colors',
                        on
                          ? 'border-[var(--accent)]/40 bg-[rgba(99,102,241,0.06)]'
                          : 'border-[var(--border)] bg-[var(--bg-secondary)] hover:border-[var(--border-strong)]',
                      )}
                    >
                      <span className="shrink-0 text-[var(--accent)]">
                        {on ? <CheckSquare className="h-5 w-5" /> : <Square className="h-5 w-5 text-[var(--text-tertiary)]" />}
                      </span>
                      {on && (
                        <span className="shrink-0 rounded-md bg-[var(--accent)]/15 px-2 py-0.5 text-[10px] font-bold text-[var(--accent)]">
                          #{order + 1}
                        </span>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <Globe className="h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)]" />
                          <span className="truncate font-medium text-[var(--text-primary)]">{getDomain(scan.target_url)}</span>
                          <span className="shrink-0 rounded-md border border-[var(--border)] bg-[rgba(99,102,241,0.1)] px-1.5 py-0.5 text-[10px] font-bold text-violet-300">
                            {formatScanPlatform(scan.platform)}
                          </span>
                          <a
                            href={scan.target_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="shrink-0 text-[var(--text-tertiary)] hover:text-[var(--accent)]"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        </div>
                        <p className="mt-0.5 truncate text-xs text-[var(--text-tertiary)]">{scan.scan_id}</p>
                      </div>
                      <span className={clsx('shrink-0 text-lg font-bold tabular-nums', scoreTone(scan.overall_score))}>
                        {scan.overall_score != null ? scan.overall_score.toFixed(1) : '—'}
                      </span>
                      <span className="hidden shrink-0 text-xs text-[var(--text-tertiary)] sm:inline">
                        {scan.completed_at ? formatDistanceToNow(new Date(scan.completed_at), { addSuffix: true }) : '—'}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          {selected.size >= 2 && (
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void runCompare()}
                disabled={loadingDetail}
                className="btn-primary inline-flex items-center justify-center gap-2 rounded-xl px-6 py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/20 disabled:opacity-50"
                style={{ background: 'var(--gradient-primary)' }}
              >
                {loadingDetail ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
                Build comparison table
              </button>
              <button
                type="button"
                onClick={() => {
                  setSelected(new Set());
                  setDetailById({});
                }}
                className="text-sm font-medium text-[var(--text-secondary)] hover:text-[var(--text-primary)]"
              >
                Clear selection
              </button>
            </div>
          )}
        </section>

        {/* Matrix */}
        {hasMatrix && (
          <motion.section
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            className="card overflow-hidden rounded-2xl border border-[var(--border)]"
          >
            <div className="border-b border-[var(--border)] px-5 py-4 sm:px-6">
              <h2 className="text-lg font-semibold text-[var(--text-primary)]">Score comparison</h2>
              <p className="mt-1 text-sm text-[var(--text-tertiary)]">Same weighting as Overview: 40% / 35% / 25%.</p>
              {partialLoad && (
                <p className="mt-2 text-xs text-amber-400/90">
                  Some scans could not be loaded; showing {detailCount} of {selected.size} columns.
                </p>
              )}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead>
                  <tr className="border-b border-[var(--border)] bg-[rgba(99,102,241,0.04)]">
                    <th className="px-4 py-4 text-left text-xs font-semibold uppercase tracking-wider text-[var(--text-tertiary)]">
                      Metric
                    </th>
                    {columns.map((c) => (
                      <th key={c.scan_id} className="px-4 py-4 text-center">
                        <div className="flex flex-col items-center gap-2">
                          <ComparisonColumnPlatformHeader scan={c} />
                          <div className="font-semibold text-[var(--text-primary)]">{getDomain(c.target_url)}</div>
                          <div className="max-w-[min(100%,14rem)] truncate text-[11px] font-normal text-[var(--text-tertiary)]" title={c.target_url}>
                            {c.target_url}
                          </div>
                        </div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border)]">
                  {(
                    [
                      { key: 'overall_score', label: 'Overall KPI' },
                      { key: 'security_score', label: 'Security (40%)' },
                      { key: 'performance_score', label: 'Performance (35%)' },
                      { key: 'code_quality_score', label: 'Code quality (25%)' },
                    ] as const
                  ).map((row) => (
                    <tr key={row.key} className="hover:bg-white/[0.02]">
                      <td className="px-4 py-3.5 font-medium text-[var(--text-secondary)]">{row.label}</td>
                      {columns.map((c) => {
                        const v = c[row.key] as number | null | undefined;
                        return (
                          <td key={c.scan_id} className="px-4 py-3.5 text-center tabular-nums">
                            <span className={clsx('text-lg font-bold', scoreTone(v ?? null))}>
                              {v != null && !Number.isNaN(v) ? v.toFixed(1) : '—'}
                            </span>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                  <tr>
                    <td className="px-4 py-3.5 font-medium text-[var(--text-secondary)]">Critical findings</td>
                    {columns.map((c) => (
                      <td key={c.scan_id} className="px-4 py-3.5 text-center text-red-400 tabular-nums">
                        {countBySeverity(c.findings, 'CRITICAL')}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="px-4 py-3.5 font-medium text-[var(--text-secondary)]">High findings</td>
                    {columns.map((c) => (
                      <td key={c.scan_id} className="px-4 py-3.5 text-center text-amber-400/90 tabular-nums">
                        {countBySeverity(c.findings, 'HIGH')}
                      </td>
                    ))}
                  </tr>
                  <tr>
                    <td className="px-4 py-3.5 font-medium text-[var(--text-secondary)]">Duration</td>
                    {columns.map((c) => (
                      <td key={c.scan_id} className="px-4 py-3.5 text-center text-[var(--text-tertiary)]">
                        {typeof c.duration_ms === 'number' && c.duration_ms > 0
                          ? `${(c.duration_ms / 1000).toFixed(1)}s`
                          : '—'}
                      </td>
                    ))}
                  </tr>
                </tbody>
              </table>
            </div>
          </motion.section>
        )}

        {selected.size >= 2 && !hasMatrix && !loadingDetail && (
          <p className="text-center text-sm text-[var(--text-tertiary)]">
            Click <strong className="text-[var(--text-secondary)]">Build comparison table</strong> to load full details and
            fill the matrix.
          </p>
        )}
      </div>
    </div>
  );
}
