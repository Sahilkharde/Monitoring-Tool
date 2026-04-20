import { useState, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
  Globe, ExternalLink, X, RefreshCw,
  Play, CheckSquare, Square, BarChart3,
  Loader2, AlertCircle, ArrowRight,
} from 'lucide-react';
import clsx from 'clsx';
import { useScanStore } from '../store/scanStore';
import { api } from '../utils/api';
import { formatDistanceToNow } from 'date-fns';

function getScoreColor(score: number) {
  if (score >= 90) return 'text-emerald-400';
  if (score >= 70) return 'text-yellow-400';
  if (score >= 50) return 'text-orange-400';
  return 'text-red-400';
}

function getDomain(url: string): string {
  try { return new URL(url).hostname.replace('www.', ''); } catch { return url; }
}

export default function Competition() {
  const navigate = useNavigate();
  const { scans, loadScans } = useScanStore();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [rescanning, setRescanning] = useState(false);
  const [freshUrl, setFreshUrl] = useState('');
  const [showFreshScan, setShowFreshScan] = useState(false);

  const completedScans = scans.filter(s => s.status === 'completed' && s.overall_score !== null);

  useEffect(() => {
    if (scans.length === 0) loadScans();
  }, [scans.length, loadScans]);

  const toggleSelect = useCallback((scanId: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(scanId)) next.delete(scanId);
      else next.add(scanId);
      return next;
    });
  }, []);

  const selectAll = useCallback(() => {
    if (selected.size === completedScans.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(completedScans.map(s => s.scan_id)));
    }
  }, [completedScans, selected.size]);

  const removeUrl = useCallback((scanId: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.delete(scanId);
      return next;
    });
  }, []);

  const handleRescanAll = useCallback(async () => {
    setRescanning(true);
    try {
      await api.post('/competition/rescan', { scan_ids: Array.from(selected) });
      await loadScans();
    } catch { /* silent */ }
    setRescanning(false);
  }, [selected, loadScans]);

  /** Backend has no /competition/compare — use Compare page with client-side matrix. */
  const handleCompare = useCallback(() => {
    if (selected.size < 2) return;
    const ids = Array.from(selected);
    navigate(`/compare?ids=${encodeURIComponent(ids.join(','))}`);
  }, [selected, navigate]);

  const handleFreshScan = useCallback(async () => {
    if (!freshUrl.trim()) return;
    setRescanning(true);
    try {
      await api.post('/scans', { target_url: freshUrl, platform: 'desktop', agents: ['security', 'performance', 'code_quality'] });
      setFreshUrl('');
      setShowFreshScan(false);
      await loadScans();
    } catch { /* silent */ }
    setRescanning(false);
  }, [freshUrl, loadScans]);

  const orderedSelection = Array.from(selected);

  return (
    <div className="min-h-0 bg-[var(--bg-primary)] text-[var(--text-primary)]">
      {/* Header */}
      <div className="border-b px-6 py-5" style={{ borderColor: 'var(--border)' }}>
        <div className="mx-auto max-w-5xl">
          <h1 className="text-2xl font-bold">Competition Analysis</h1>
          <p className="mt-1 text-sm text-[var(--text-secondary)]">Compare your site against competitor OTT platforms</p>
        </div>
      </div>

      <div className="mx-auto max-w-5xl p-6">
        {/* Action Cards */}
        <div className="mb-6 grid gap-4 sm:grid-cols-2">
          <div className="card rounded-xl p-5">
            <div className="mb-3 flex items-center gap-2">
              <BarChart3 className="h-5 w-5 text-blue-400" />
              <h3 className="font-semibold">Analyze Existing Results</h3>
            </div>
            <p className="mb-4 text-sm text-[var(--text-secondary)]">Re-scan selected URLs with the latest agents and compare results.</p>
            <button
              onClick={handleRescanAll}
              disabled={selected.size === 0 || rescanning}
              className="btn-primary flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-medium disabled:opacity-40"
            >
              {rescanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              Re-Scan All
            </button>
          </div>

          <div className="card rounded-xl p-5">
            <div className="mb-3 flex items-center gap-2">
              <Play className="h-5 w-5 text-emerald-400" />
              <h3 className="font-semibold">Run Fresh Scan</h3>
            </div>
            <p className="mb-4 text-sm text-[var(--text-secondary)]">Scan new URLs and compare results side-by-side.</p>
            {!showFreshScan ? (
              <button
                onClick={() => setShowFreshScan(true)}
                className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-2 text-sm font-medium text-emerald-400 hover:bg-emerald-500/20"
              >
                <Play className="h-4 w-4" />
                Add URL
              </button>
            ) : (
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
                  <input
                    value={freshUrl}
                    onChange={e => setFreshUrl(e.target.value)}
                    placeholder="https://competitor.com"
                    className="w-full rounded-lg border bg-[var(--bg-primary)] py-2 pl-10 pr-3 text-sm text-[var(--text-primary)] outline-none focus:border-emerald-500"
                    style={{ borderColor: 'var(--border)', color: 'var(--text-primary)' }}
                    onKeyDown={e => e.key === 'Enter' && handleFreshScan()}
                  />
                </div>
                <button
                  onClick={handleFreshScan}
                  disabled={!freshUrl.trim() || rescanning}
                  className="rounded-lg bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-40"
                >
                  {rescanning ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
                </button>
                <button onClick={() => { setShowFreshScan(false); setFreshUrl(''); }} className="rounded-lg border px-2 py-2 text-[var(--text-secondary)] hover:text-[var(--text-primary)]" style={{ borderColor: 'var(--border)' }}>
                  <X className="h-4 w-4" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* URL Selection */}
        <div className="card rounded-xl p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h3 className="font-semibold">Select URLs to Compare</h3>
              <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">First selected = your primary site, rest = competitors</p>
            </div>
            <div className="flex items-center gap-3">
              <span className="rounded-full bg-blue-500/10 px-2.5 py-0.5 text-xs font-medium text-blue-400">
                {selected.size} selected
              </span>
              <button
                onClick={selectAll}
                className="text-sm text-blue-400 hover:text-blue-300"
              >
                {selected.size === completedScans.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>
          </div>

          {completedScans.length === 0 ? (
            <div className="flex flex-col items-center py-12 text-center">
              <AlertCircle className="mb-3 h-10 w-10 text-[var(--text-tertiary)]" />
              <p className="text-sm text-[var(--text-tertiary)]">No completed scans available. Run some scans first.</p>
            </div>
          ) : (
            <div className="space-y-2">
              {completedScans.map((scan, idx) => {
                const isSelected = selected.has(scan.scan_id);
                const selIdx = orderedSelection.indexOf(scan.scan_id);
                const isPrimary = selIdx === 0;
                return (
                  <motion.div
                    key={scan.scan_id}
                    layout
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: idx * 0.03 }}
                    className={clsx(
                      'flex items-center gap-3 rounded-lg border p-3 transition-colors',
                      isSelected
                        ? isPrimary
                          ? 'border-blue-500/40 bg-blue-500/5'
                          : 'bg-[var(--bg-primary)]'
                        : 'bg-[var(--bg-primary)] hover:border-gray-600'
                    )}
                    style={{ borderColor: isSelected && isPrimary ? undefined : 'var(--border)' }}
                  >
                    {/* Checkbox */}
                    <button onClick={() => toggleSelect(scan.scan_id)} className="shrink-0">
                      {isSelected
                        ? <CheckSquare className="h-5 w-5 text-blue-400" />
                        : <Square className="h-5 w-5 text-[var(--text-tertiary)]" />
                      }
                    </button>

                    {/* Primary badge */}
                    {isPrimary && (
                      <span className="shrink-0 rounded bg-blue-500/20 px-1.5 py-0.5 text-[10px] font-bold uppercase text-blue-400">
                        Primary
                      </span>
                    )}

                    {/* Domain */}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <Globe className="h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)]" />
                        <span className="truncate text-sm font-medium text-[var(--text-primary)]">{getDomain(scan.target_url)}</span>
                      </div>
                      <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-[var(--text-tertiary)]">
                        {scan.target_url}
                        <a href={scan.target_url} target="_blank" rel="noopener noreferrer" className="shrink-0">
                          <ExternalLink className="h-3 w-3" />
                        </a>
                      </p>
                    </div>

                    {/* Score */}
                    <span className={clsx('shrink-0 text-lg font-bold', getScoreColor(scan.overall_score ?? 0))}>
                      {scan.overall_score?.toFixed(1) ?? '—'}
                    </span>

                    {/* Time */}
                    <span className="shrink-0 text-xs text-[var(--text-tertiary)]">
                      {scan.completed_at ? formatDistanceToNow(new Date(scan.completed_at), { addSuffix: true }) : '—'}
                    </span>

                    {/* Remove */}
                    {isSelected && (
                      <button
                        onClick={() => removeUrl(scan.scan_id)}
                        className="shrink-0 rounded p-1 text-[var(--text-tertiary)] hover:text-red-400"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    )}
                  </motion.div>
                );
              })}
            </div>
          )}
        </div>

        {/* Compare Button */}
        {selected.size >= 2 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-6"
          >
            <button
              type="button"
              onClick={handleCompare}
              className="btn-primary flex w-full items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-semibold transition-colors"
            >
              <BarChart3 className="h-4 w-4" /> Compare {selected.size} Sites
            </button>
          </motion.div>
        )}
      </div>
    </div>
  );
}
