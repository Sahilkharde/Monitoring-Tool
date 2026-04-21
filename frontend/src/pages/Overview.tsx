import { useState, useEffect, lazy, Suspense } from 'react';
import { Link } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, Cell, Legend,
} from 'recharts';
import {
  ChevronDown, ChevronUp,
  Download, Zap, Eye, Sparkles,
  ArrowRight, PlayCircle, Shield, Gauge, Code2,
} from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import { useScanStore } from '../store/scanStore';
import type { Recommendation, ScanData } from '../store/scanStore';
import { api } from '../utils/api';
import ScoreGauge from '../components/Charts/ScoreGauge';
import SeverityBadge from '../components/Charts/SeverityBadge';
import SeverityDonut from '../components/Charts/SeverityDonut';
import MetricTile from '../components/dashboard/MetricTile';
import DashboardSectionHeader from '../components/dashboard/DashboardSectionHeader';

const ScoreTrendChart = lazy(() => import('../components/Charts/ScoreTrendChart'));

function ChartFallback({ height = 280 }: { height?: number }) {
  return (
    <div
      className="dash-panel flex items-center justify-center rounded-xl text-sm text-[var(--text-tertiary)]"
      style={{ minHeight: height }}
    >
      Loading chart…
    </div>
  );
}

function OverviewSkeleton() {
  return (
    <div className="space-y-8 max-w-3xl mx-auto animate-pulse">
      <div className="h-8 w-64 rounded-lg bg-[rgba(99,102,241,0.08)]" />
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-28 rounded-xl bg-[rgba(99,102,241,0.06)] border border-[var(--border)]" />
        ))}
      </div>
      <div className="h-64 rounded-xl bg-[rgba(99,102,241,0.06)] border border-[var(--border)]" />
      <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-40 rounded-xl bg-[rgba(99,102,241,0.06)] border border-[var(--border)]" />
        ))}
      </div>
    </div>
  );
}

function statusLabel(status: string) {
  switch (status) {
    case 'completed': return 'Completed';
    case 'running':
    case 'pending': return 'In progress';
    case 'failed': return 'Failed';
    default: return status;
  }
}

function DashboardOnboarding({
  scans,
  onPickScan,
}: {
  scans: ScanData[];
  onPickScan: (scanId: string) => void;
}) {
  const steps = [
    { n: '1', title: 'Target', desc: 'Add your site URL in Control Center.' },
    { n: '2', title: 'Capture', desc: 'Optional browser login if the page needs it.' },
    { n: '3', title: 'Analyze', desc: 'Security, speed, and code checks run together.' },
    { n: '4', title: 'Review', desc: 'Scores and fixes show up on this overview.' },
  ];

  return (
    <div className="max-w-3xl mx-auto space-y-14 pb-8">
      <motion.section
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] px-8 py-10 sm:px-10 sm:py-12"
      >
        <div className="space-y-6 max-w-xl">
          <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[var(--text-tertiary)]">
            Overview
          </p>
          <h1 className="text-2xl sm:text-3xl font-bold text-[var(--text-primary)] tracking-tight leading-tight">
            No scan loaded yet
          </h1>
          <p className="text-base text-[var(--text-secondary)] leading-7">
            Start one verification run. This page will show your scores and top fixes here.
          </p>
        </div>

        <div className="mt-10 flex flex-col gap-4 sm:flex-row sm:flex-wrap">
          <Link
            to="/control-center"
            className="inline-flex w-full sm:w-auto min-h-[48px] items-center justify-center gap-2 rounded-xl px-8 py-3.5 text-base font-semibold text-white shadow-lg shadow-indigo-500/20 transition hover:opacity-95"
            style={{ background: 'var(--gradient-primary)' }}
          >
            <PlayCircle className="h-5 w-5 shrink-0" />
            Run scan
            <ArrowRight className="h-4 w-4 shrink-0 opacity-80" />
          </Link>
          <Link
            to="/reporting"
            className="inline-flex w-full sm:w-auto min-h-[48px] items-center justify-center rounded-xl border border-[var(--border)] bg-[var(--bg-primary)] px-8 py-3.5 text-base font-medium text-[var(--text-primary)] hover:bg-white/[0.04] transition"
          >
            Open reporting
          </Link>
        </div>
      </motion.section>

      <section className="space-y-6">
        <h2 className="text-lg font-semibold text-[var(--text-primary)]">What you get</h2>
        <div className="grid grid-cols-1 gap-6">
          {[
            { icon: Shield, title: 'Security', hint: 'TLS, headers, cookies, exposure checks.' },
            { icon: Gauge, title: 'Performance', hint: 'Load timing and weight-style signals.' },
            { icon: Code2, title: 'Code quality', hint: 'Complexity and risk-style heuristics.' },
          ].map(({ icon: Icon, title, hint }) => (
            <motion.div
              key={title}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="rounded-xl border border-[var(--border)] bg-[var(--bg-card)] px-6 py-6 sm:px-8 sm:py-7"
            >
              <div className="flex items-start gap-5">
                <div className="rounded-xl p-3 shrink-0" style={{ background: 'rgba(99,102,241,0.12)' }}>
                  <Icon className="h-6 w-6 text-[var(--accent)]" />
                </div>
                <div className="min-w-0 space-y-3 flex-1">
                  <h3 className="text-base font-semibold text-[var(--text-primary)]">{title}</h3>
                  <p className="text-sm text-[var(--text-secondary)] leading-7">{hint}</p>
                  <p className="text-sm text-[var(--text-tertiary)] pt-1">Shows data after your first scan.</p>
                </div>
              </div>
            </motion.div>
          ))}
        </div>
      </section>

      <motion.section
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ delay: 0.05 }}
        className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] px-8 py-10 sm:px-10 sm:py-11"
      >
        <h2 className="text-lg font-semibold text-[var(--text-primary)] mb-10">How it works</h2>
        <ol className="space-y-10">
          {steps.map((s) => (
            <li key={s.n} className="flex gap-5 sm:gap-6">
              <span
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                style={{ background: 'var(--gradient-primary)' }}
              >
                {s.n}
              </span>
              <div className="space-y-2 pt-0.5 min-w-0">
                <h3 className="text-base font-semibold text-[var(--text-primary)]">{s.title}</h3>
                <p className="text-sm text-[var(--text-secondary)] leading-7">{s.desc}</p>
              </div>
            </li>
          ))}
        </ol>
      </motion.section>

      {scans.length > 0 && (
        <motion.section
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          className="rounded-2xl border border-[var(--border)] bg-[var(--bg-card)] overflow-hidden"
        >
          <div className="flex flex-col gap-1 px-8 py-6 border-b border-[var(--border)] sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-lg font-semibold text-[var(--text-primary)]">Past runs</h2>
            <span className="text-sm text-[var(--text-tertiary)]">{scans.length} saved</span>
          </div>
          <ul className="divide-y divide-[var(--border)]">
            {scans.slice(0, 8).map((s) => (
              <li
                key={s.scan_id}
                className="flex flex-col gap-4 px-8 py-5 sm:flex-row sm:items-center sm:justify-between hover:bg-white/[0.02] transition-colors"
              >
                <div className="flex items-start gap-3 min-w-0">
                  <span
                    className={`mt-1.5 h-2.5 w-2.5 rounded-full shrink-0 ${
                      s.status === 'completed'
                        ? 'bg-emerald-400'
                        : s.status === 'failed'
                          ? 'bg-red-400'
                          : 'bg-amber-400 animate-pulse'
                    }`}
                  />
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm font-medium text-[var(--text-primary)] break-all leading-6">{s.target_url}</p>
                    <p className="text-sm text-[var(--text-tertiary)]">
                      {s.started_at ? formatDistanceToNow(new Date(s.started_at), { addSuffix: true }) : '—'}
                      <span className="mx-2 text-[var(--border)]">·</span>
                      {statusLabel(s.status)}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => onPickScan(s.scan_id)}
                  className="self-start sm:self-center shrink-0 rounded-lg border border-[var(--border)] px-4 py-2.5 text-sm font-medium text-[var(--text-primary)] hover:bg-[rgba(99,102,241,0.08)] transition-colors"
                >
                  Load results
                </button>
              </li>
            ))}
          </ul>
        </motion.section>
      )}
    </div>
  );
}

function CategoryBadge({ category }: { category: string }) {
  const colors: Record<string, string> = {
    Security: 'bg-red-500/10 text-red-400 border-red-500/20',
    Performance: 'bg-cyan-500/10 text-cyan-400 border-cyan-500/20',
    'Code Quality': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-[11px] font-semibold border ${colors[category] ?? 'bg-zinc-500/10 text-zinc-300 border-zinc-500/25'}`}>
      {category}
    </span>
  );
}

function EffortBadge({ effort }: { effort: string }) {
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold border ${
      effort === 'low'
        ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20'
        : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
    }`}>
      {effort === 'low' ? 'Low Effort' : 'High Effort'}
    </span>
  );
}

function ScoreBar({ value, max = 10 }: { value: number; max?: number }) {
  const pct = Math.min((value / max) * 100, 100);
  const gradient = pct >= 70 ? 'linear-gradient(90deg, #ef4444, #f97316)' : pct >= 40 ? 'linear-gradient(90deg, #f59e0b, #eab308)' : 'linear-gradient(90deg, #6366f1, #8b5cf6)';
  return (
    <div className="flex items-center gap-2 min-w-[80px]">
      <div className="flex-1 h-1.5 rounded-full" style={{ background: 'rgba(99,102,241,0.08)' }}>
        <div className="h-1.5 rounded-full transition-all" style={{ width: `${pct}%`, background: gradient }} />
      </div>
      <span className="text-xs text-[var(--text-secondary)] w-5 text-right font-mono">{value}</span>
    </div>
  );
}

const fadeIn = {
  hidden: { opacity: 0, y: 8 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { delay: i * 0.04, duration: 0.28, ease: [0.4, 0, 0.2, 1] },
  }),
};

export default function Overview() {
  const loadScans = useScanStore((s) => s.loadScans);
  const loadScan = useScanStore((s) => s.loadScan);
  const currentScan = useScanStore((s) => s.currentScan);
  const scans = useScanStore((s) => s.scans);
  const [hydrating, setHydrating] = useState(true);
  const [passThreshold, setPassThreshold] = useState(95);

  useEffect(() => {
    api
      .get<{ data: { overall: number } }>('/control/thresholds')
      .then((r) => {
        const v = r?.data?.overall;
        if (typeof v === 'number' && !Number.isNaN(v)) setPassThreshold(v);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let alive = true;
    (async () => {
      await loadScans();
      if (!alive) return;
      const { currentScan: cur, scans: list } = useScanStore.getState();
      if (!cur && list.length > 0) {
        const pick =
          list.find((s) => s.status === 'completed')
          ?? list.find((s) => s.status === 'failed')
          ?? list[0];
        await loadScan(pick.scan_id);
      }
      if (alive) setHydrating(false);
    })();
    return () => {
      alive = false;
    };
  }, [loadScans, loadScan]);

  const [summaryOpen, setSummaryOpen] = useState(false);
  const [findingsExpanded, setFindingsExpanded] = useState(false);

  if (hydrating && !currentScan) {
    return <OverviewSkeleton />;
  }

  if (!currentScan) {
    return <DashboardOnboarding scans={scans} onPickScan={(id) => void loadScan(id)} />;
  }

  const scan = currentScan;
  const regressions = scan.regressions ?? [];
  const recommendations = scan.recommendations ?? [];
  const findings = scan.findings ?? [];
  const critHigh = findings.filter((f) => f.severity === 'CRITICAL' || f.severity === 'HIGH');
  const displayFindings = findingsExpanded ? critHigh : critHigh.slice(0, 8);
  const top5 = recommendations.slice(0, 5);
  const quickWins = recommendations.filter((r) => r.quick_win);

  const overallScore = Number(scan.overall_score ?? 0);
  const securityScore = Number(scan.security_score ?? 0);
  const performanceScore = Number(scan.performance_score ?? 0);
  const codeQualityScore = Number(scan.code_quality_score ?? 0);

  const overallPass = overallScore >= passThreshold;

  const projectedData = [
    { name: 'Security', current: securityScore, projected: Math.min(100, securityScore + recommendations.filter((r) => r.category === 'Security').reduce((s, r) => s + (r.projected_gain ?? 0), 0)) },
    { name: 'Performance', current: performanceScore, projected: Math.min(100, performanceScore + recommendations.filter((r) => r.category === 'Performance').reduce((s, r) => s + (r.projected_gain ?? 0), 0)) },
    { name: 'Code Quality', current: codeQualityScore, projected: Math.min(100, codeQualityScore + recommendations.filter((r) => r.category === 'Code Quality').reduce((s, r) => s + (r.projected_gain ?? 0), 0)) },
  ];

  const projectedOverall = projectedData[0].projected * 0.4 + projectedData[1].projected * 0.35 + projectedData[2].projected * 0.25;

  const handleExportCSV = () => {
    const header = '#,Issue,Category,Severity,Impact,Post-Fix Gain,Effort,Confidence\n';
    const rows = recommendations.map((r, i) => `${i + 1},"${r.title}",${r.category},${r.impact},${r.impact},${r.projected_gain ?? '-'},${r.effort},${r.ease}`).join('\n');
    const blob = new Blob([header + rows], { type: 'text/csv' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `success-matrix-${scan.scan_id}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const scanMeta = scan.completed_at
    ? `Completed ${formatDistanceToNow(new Date(scan.completed_at), { addSuffix: true })}`
    : scan.started_at
      ? `Started ${formatDistanceToNow(new Date(scan.started_at), { addSuffix: true })}`
      : null;

  return (
    <div className="w-full space-y-10 pb-4">
      <motion.div
        initial={{ opacity: 0, y: 6 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.22 }}
        className="flex flex-col gap-6 border-b border-[var(--border)] pb-8 sm:flex-row sm:items-start sm:justify-between"
      >
        <div className="min-w-0 space-y-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--text-tertiary)]">
            Dashboard
          </p>
          <h1 className="text-xl font-bold leading-tight tracking-tight text-[var(--text-primary)] sm:text-2xl">
            Verification overview
          </h1>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3 text-sm text-[var(--text-secondary)] leading-relaxed">
            <span className="inline-flex items-center gap-1.5 min-w-0 max-w-full">
              <span className="text-[var(--text-tertiary)] shrink-0">Target</span>
              <span className="font-medium text-[var(--text-primary)] truncate">{scan.target_url}</span>
            </span>
            <span className="hidden sm:inline text-[var(--border)]">·</span>
            <span className="inline-flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-full ${scan.status === 'completed' ? 'bg-emerald-400' : scan.status === 'failed' ? 'bg-red-400' : 'bg-amber-400'}`} />
              <span className="capitalize">{statusLabel(scan.status)}</span>
            </span>
            {scanMeta && (
              <>
                <span className="hidden sm:inline text-[var(--border)]">·</span>
                <span className="text-[var(--text-tertiary)] text-xs sm:text-sm">{scanMeta}</span>
              </>
            )}
            {typeof scan.duration_ms === 'number' && scan.duration_ms > 0 && (
              <>
                <span className="hidden sm:inline text-[var(--border)]">·</span>
                <span className="text-[var(--text-tertiary)] text-xs sm:text-sm font-mono">{(scan.duration_ms / 1000).toFixed(1)}s run</span>
              </>
            )}
            <span className="hidden sm:inline text-[var(--border)]">·</span>
            <span className="text-[11px] font-mono text-zinc-500" title="Use this to confirm you are viewing the correct saved run">
              {scan.scan_id}
            </span>
          </div>
        </div>
        <Link
          to="/control-center"
          className="inline-flex shrink-0 items-center justify-center gap-2 self-start rounded-lg border border-[var(--border)] px-5 py-2.5 text-sm font-semibold text-[var(--text-primary)] hover:bg-white/[0.04] transition-colors"
        >
          New scan
          <ArrowRight className="h-3.5 w-3.5 opacity-70" />
        </Link>
      </motion.div>

      {/* Compared to last scan (backend: regressions) */}
      <AnimatePresence>
        {regressions.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="rounded-xl border border-[var(--border)] bg-[rgba(99,102,241,0.04)] p-4 sm:p-5"
          >
            <div className="mb-3 space-y-1">
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">Compared to your last scan</h3>
              <p className="text-xs leading-relaxed text-[var(--text-tertiary)]">
                Same target URL: this run vs the previous completed scan. Lower scores or new high-severity findings are
                called out below.
              </p>
            </div>
            <div className="space-y-3">
              {regressions.map((reg, i) => {
                const isNewFinding = reg.metric === 'New Finding' && reg.title;
                const isScoreDrop =
                  reg.previous != null && reg.current != null && typeof reg.delta === 'number';
                const metricLabel =
                  reg.metric === 'Overall'
                    ? 'Overall KPI'
                    : reg.metric
                      ? `${reg.metric} score`
                      : 'Score';

                return (
                  <div
                    key={i}
                    className="rounded-lg border border-[var(--border)] bg-[var(--bg-secondary)] px-3 py-3 text-sm sm:px-4"
                  >
                    {isNewFinding && reg.severity ? (
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                        <div className="flex min-w-0 items-start gap-2">
                          <SeverityBadge severity={reg.severity} />
                          <p className="text-[var(--text-secondary)]">
                            <span className="font-medium text-[var(--text-primary)]">New in this scan</span>
                            {' '}
                            (not seen on last scan): {reg.title}
                          </p>
                        </div>
                      </div>
                    ) : isScoreDrop ? (
                      <p className="leading-relaxed text-[var(--text-secondary)]">
                        <span className="font-semibold text-[var(--text-primary)]">{metricLabel}</span> is{' '}
                        <span className="text-amber-400/95">lower</span> in this scan: from{' '}
                        <span className="tabular-nums font-medium text-[var(--text-primary)]">
                          {reg.previous?.toFixed(1)}
                        </span>{' '}
                        to{' '}
                        <span className="tabular-nums font-medium text-[var(--text-primary)]">
                          {reg.current?.toFixed(1)}
                        </span>
                        , compared to your last scan
                        {typeof reg.delta === 'number' && (
                          <span className="ml-1.5 font-mono text-xs text-[var(--text-tertiary)]">
                            (Δ {reg.delta > 0 ? '+' : ''}
                            {reg.delta})
                          </span>
                        )}
                        .
                      </p>
                    ) : (
                      <p className="font-mono text-xs text-[var(--text-tertiary)]">{reg.metric ?? 'Update'}</p>
                    )}
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* KPI — measure tiles (Sonar-style) + gauge breakdown */}
      <motion.div custom={0} variants={fadeIn} initial="hidden" animate="visible" className="space-y-6">
        <DashboardSectionHeader
          eyebrow="Measures"
          title="Quality gate & scores"
          description={`PASS only when overall is at least ${passThreshold}. Weights: security 40%, performance 35%, code quality 25%.`}
          icon={Sparkles}
        />
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 sm:gap-4 xl:grid-cols-4">
          <MetricTile
            label="Overall KPI"
            score={overallScore}
            accent="violet"
            badge={{ text: overallPass ? 'Pass' : 'Fail', ok: overallPass }}
            hint={`Target ≥ ${passThreshold}`}
          />
          <MetricTile label="Security" score={securityScore} accent="red" hint="Weight 40%" />
          <MetricTile label="Performance" score={performanceScore} accent="cyan" hint="Weight 35%" />
          <MetricTile label="Code quality" score={codeQualityScore} accent="emerald" hint="Weight 25%" />
        </div>

        <div className="dash-panel p-5 sm:p-7">
          <p className="mb-5 text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--text-tertiary)]">
            Breakdown
          </p>
          <div className="flex flex-col items-center gap-10 lg:flex-row lg:items-end lg:justify-between lg:gap-8">
            <div className="flex shrink-0 flex-col items-center">
              <ScoreGauge score={overallScore} label="Overall KPI" size="lg" subtitle={overallPass ? 'PASS' : 'FAIL'} />
            </div>
            <div className="grid w-full max-w-xl grid-cols-1 gap-8 sm:max-w-none sm:grid-cols-3 sm:gap-6">
              <div className="flex justify-center">
                <ScoreGauge score={securityScore} label="Security (40%)" size="md" />
              </div>
              <div className="flex justify-center">
                <ScoreGauge score={performanceScore} label="Performance (35%)" size="md" />
              </div>
              <div className="flex justify-center">
                <ScoreGauge score={codeQualityScore} label="Code Quality (25%)" size="md" />
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Score Trend — lazy chart chunk for faster initial paint */}
      {scan.score_history && scan.score_history.length > 1 && (
        <Suspense fallback={<ChartFallback height={300} />}>
          <ScoreTrendChart data={scan.score_history} />
        </Suspense>
      )}

      {/* AI Recommendations + Quick Wins */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-10">
        <motion.div custom={1} variants={fadeIn} initial="hidden" animate="visible" className="lg:col-span-2 card p-6 sm:p-9">
          <div className="mb-8 space-y-2">
            <h3 className="text-lg font-semibold text-[var(--text-primary)] flex items-center gap-2.5">
              <Sparkles size={18} className="text-violet-400 shrink-0" />
              Top recommendations
            </h3>
            <p className="text-sm text-zinc-400 leading-relaxed">Highest impact fixes first (up to five).</p>
          </div>
          <div className="space-y-6">
            {top5.map((rec, i) => <RecommendationCard key={i} index={i + 1} rec={rec} />)}
            {top5.length === 0 && <p className="text-zinc-500 text-sm py-8 text-center leading-relaxed">No recommendations for this run.</p>}
          </div>
        </motion.div>

        <motion.div custom={2} variants={fadeIn} initial="hidden" animate="visible" className="card p-6 sm:p-9 flex flex-col">
          <div className="mb-6 space-y-2">
            <div className="flex items-center gap-2.5">
              <Zap className="w-5 h-5 text-amber-400 shrink-0" />
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">Quick wins</h3>
            </div>
            <p className="text-sm text-zinc-400 leading-relaxed">Low-effort items with solid payoff.</p>
          </div>
          <div className="space-y-4 flex-1">
            {quickWins.length === 0 && (
              <div className="flex flex-1 min-h-[140px] flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border)] px-5 py-10 text-center">
                <Zap className="w-8 h-8 text-zinc-600 mb-3" />
                <p className="text-sm text-zinc-400 leading-relaxed">None flagged for this scan. Check the list at left for larger fixes.</p>
              </div>
            )}
            {quickWins.slice(0, 6).map((qw, i) => (
              <div key={i} className="flex items-start gap-3 rounded-xl p-4 sm:p-5 text-sm border border-[var(--border)] bg-[rgba(99,102,241,0.04)]">
                <Zap className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <div className="min-w-0 space-y-2">
                  <p className="text-[var(--text-primary)] font-medium leading-relaxed">{qw.title}</p>
                  <p className="text-sm text-zinc-500 leading-relaxed">{qw.category}</p>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>

      {/* Projected Score */}
      <motion.div custom={3} variants={fadeIn} initial="hidden" animate="visible" className="card p-6 sm:p-8">
        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-2">Projected Score After Fixes</h3>
        <p className="text-xs text-[var(--text-tertiary)] mb-5 leading-relaxed">
          Overall KPI projected: <strong className="text-violet-400">{projectedOverall.toFixed(1)}</strong>
        </p>
        <ResponsiveContainer width="100%" height={220}>
          <BarChart data={projectedData} barGap={4} margin={{ left: -10 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,102,241,0.06)" />
            <XAxis dataKey="name" tick={{ fill: 'var(--text-secondary)', fontSize: 11 }} axisLine={{ stroke: 'rgba(99,102,241,0.1)' }} tickLine={false} />
            <YAxis domain={[0, 100]} tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }} axisLine={{ stroke: 'rgba(99,102,241,0.1)' }} tickLine={false} />
            <Tooltip contentStyle={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-strong)', borderRadius: 12, fontSize: 12, boxShadow: 'var(--shadow-elevated)' }} />
            <Legend iconType="circle" iconSize={8} wrapperStyle={{ fontSize: 11 }} />
            <Bar dataKey="current" name="Current" radius={[6, 6, 0, 0]} maxBarSize={40}>{projectedData.map((_, i) => <Cell key={i} fill="rgba(99,102,241,0.3)" />)}</Bar>
            <Bar dataKey="projected" name="Projected" radius={[6, 6, 0, 0]} maxBarSize={40}>{projectedData.map((_, i) => <Cell key={i} fill="#8b5cf6" />)}</Bar>
          </BarChart>
        </ResponsiveContainer>
      </motion.div>

      {/* Success Matrix */}
      <motion.div custom={4} variants={fadeIn} initial="hidden" animate="visible" className="card p-6 sm:p-8">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">Success Matrix</h3>
          <button onClick={handleExportCSV} className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors rounded-lg px-3 py-1.5" style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid var(--border)' }}>
            <Download className="w-3.5 h-3.5" />Export CSV
          </button>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[11px] text-[var(--text-tertiary)] uppercase tracking-wider border-b" style={{ borderColor: 'var(--border)' }}>
                <th className="py-4 pr-4 w-8">#</th><th className="py-4 pr-4">Issue</th><th className="py-4 pr-4">Category</th>
                <th className="py-4 pr-4">Severity</th><th className="py-4 pr-4">Impact</th><th className="py-4 pr-4">Post-Fix Gain</th>
                <th className="py-4 pr-4">Effort</th><th className="py-4">Confidence</th>
              </tr>
            </thead>
            <tbody>
              {recommendations.map((r, i) => (
                <tr key={i} className="border-b hover:bg-white/[0.01] transition-colors" style={{ borderColor: 'rgba(99,102,241,0.06)' }}>
                  <td className="py-4 pr-4 text-[var(--text-tertiary)] font-mono text-xs align-top">{i + 1}</td>
                  <td className="py-4 pr-4 text-[var(--text-primary)] max-w-[220px] text-sm leading-relaxed align-top">{r.title}</td>
                  <td className="py-4 pr-4 align-top"><CategoryBadge category={r.category} /></td>
                  <td className="py-4 pr-4 align-top"><ScoreBar value={r.risk} /></td>
                  <td className="py-4 pr-4 align-top"><ScoreBar value={r.impact} /></td>
                  <td className="py-4 pr-4 text-violet-400 font-mono text-xs align-top">+{r.projected_gain ?? 0}</td>
                  <td className="py-4 pr-4 align-top"><EffortBadge effort={r.effort} /></td>
                  <td className="py-4 text-[var(--text-secondary)] text-xs font-mono align-top">{r.ease}/10</td>
                </tr>
              ))}
              {recommendations.length === 0 && <tr><td colSpan={8} className="py-10 text-center text-[var(--text-tertiary)] text-sm leading-relaxed">No data available.</td></tr>}
            </tbody>
          </table>
        </div>
      </motion.div>

      {/* Findings + Donut */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <motion.div custom={5} variants={fadeIn} initial="hidden" animate="visible" className="lg:col-span-2 card p-6 sm:p-8">
          <div className="flex items-center justify-between mb-5">
            <h3 className="text-sm font-semibold text-[var(--text-primary)] leading-snug">
              Critical & High Findings <span className="text-[var(--text-tertiary)] font-normal">({critHigh.length})</span>
            </h3>
            {critHigh.length > 8 && (
              <button onClick={() => setFindingsExpanded(!findingsExpanded)} className="flex items-center gap-1 text-xs text-[var(--accent-hover)] hover:text-[var(--accent)] transition-colors font-medium">
                <Eye className="w-3.5 h-3.5" />{findingsExpanded ? 'Show less' : 'View all'}
              </button>
            )}
          </div>
          <div className="space-y-3 max-h-[min(420px,55vh)] overflow-y-auto pr-1">
            {displayFindings.map((f, i) => (
              <div key={i} className="flex items-start gap-3 rounded-xl p-4 sm:p-5" style={{ background: 'rgba(99,102,241,0.03)', border: '1px solid var(--border)' }}>
                <SeverityBadge severity={f.severity} />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <p className="text-sm text-[var(--text-primary)] font-medium leading-relaxed">{f.title}</p>
                  <p className="text-xs text-[var(--text-tertiary)] leading-relaxed">{f.category}</p>
                </div>
              </div>
            ))}
            {critHigh.length === 0 && <p className="text-[var(--text-tertiary)] text-sm text-center py-8 leading-relaxed">No critical or high-severity findings.</p>}
          </div>
        </motion.div>

        <motion.div custom={6} variants={fadeIn} initial="hidden" animate="visible" className="card p-6 sm:p-8">
          <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4 leading-snug">Severity Distribution</h3>
          <SeverityDonut findings={findings} />
        </motion.div>
      </div>

      {/* Executive Summary */}
      {scan.executive_summary && (
        <motion.div custom={7} variants={fadeIn} initial="hidden" animate="visible" className="card">
          <button onClick={() => setSummaryOpen(!summaryOpen)} className="flex items-center justify-between w-full p-6 sm:p-7 text-left">
            <h3 className="text-sm font-semibold text-[var(--text-primary)] leading-snug">Executive Summary</h3>
            {summaryOpen ? <ChevronUp className="w-4 h-4 text-[var(--text-tertiary)]" /> : <ChevronDown className="w-4 h-4 text-[var(--text-tertiary)]" />}
          </button>
          <AnimatePresence>
            {summaryOpen && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <p className="px-6 sm:px-7 pb-6 text-sm text-[var(--text-secondary)] leading-[1.7] whitespace-pre-wrap">{scan.executive_summary}</p>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
      )}
    </div>
  );
}

function RecommendationCard({ index, rec }: { index: number; rec: Recommendation }) {
  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05 }}
      className="flex gap-4 rounded-2xl p-5 sm:p-7 border border-[var(--border)] bg-[rgba(99,102,241,0.04)]"
    >
      <span
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-bold"
        style={{ background: 'rgba(139,92,246,0.18)', color: '#c4b5fd', border: '1px solid rgba(139,92,246,0.28)' }}
      >
        {index}
      </span>
      <div className="min-w-0 flex-1 space-y-4">
        <div className="space-y-3">
          <h4 className="text-base font-semibold text-zinc-100 leading-relaxed pr-2">{rec.title}</h4>
          <div className="flex flex-wrap items-center gap-2">
            <CategoryBadge category={rec.category} />
            {rec.quick_win && (
              <span
                className="inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold border"
                style={{ background: 'rgba(245,158,11,0.12)', color: '#fcd34d', borderColor: 'rgba(245,158,11,0.25)' }}
              >
                <Zap className="w-3 h-3" /> Quick win
              </span>
            )}
          </div>
        </div>
        {rec.description && (
          <p className="text-sm leading-[1.65] text-zinc-400 line-clamp-4">{rec.description}</p>
        )}
        <div className="grid grid-cols-2 gap-3 border-t border-zinc-700/40 pt-4 sm:grid-cols-4 sm:gap-4">
          <div className="rounded-lg bg-black/20 px-3 py-2.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Impact</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-zinc-200">{rec.impact}<span className="text-sm font-normal text-zinc-500">/10</span></p>
          </div>
          <div className="rounded-lg bg-black/20 px-3 py-2.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Risk</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-zinc-200">{rec.risk}<span className="text-sm font-normal text-zinc-500">/10</span></p>
          </div>
          <div className="rounded-lg bg-black/20 px-3 py-2.5">
            <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500">Ease</p>
            <p className="mt-1 text-lg font-semibold tabular-nums text-zinc-200">{rec.ease}<span className="text-sm font-normal text-zinc-500">/10</span></p>
          </div>
          <div className="rounded-lg bg-black/20 px-3 py-2.5 flex flex-col justify-center">
            <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-500 mb-1.5">Effort</p>
            <EffortBadge effort={rec.effort} />
          </div>
        </div>
      </div>
    </motion.div>
  );
}
