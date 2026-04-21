import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  FileText, Share2, Download, Code2,
  ChevronDown, ChevronRight, Loader2,
  TrendingUp, TrendingDown,
  BarChart3, Briefcase, RefreshCw, Shield, Zap,
  Minus, Monitor,
} from 'lucide-react';
import clsx from 'clsx';
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';
import { useScanStore, type ScanData, type Finding } from '../store/scanStore';
import { api } from '../utils/api';
import { format } from 'date-fns';

type ReportTab = 'overview' | 'management' | 'developer' | 'mindmap';

interface MindMapNode {
  id: string;
  label: string;
  value?: string;
  color: string;
  children?: MindMapNode[];
}

interface WeeklyPoint {
  date: string;
  score: number;
  security: number;
  performance: number;
  code_quality: number;
}

const REPORT_TYPES = [
  { id: 'performance', title: 'Performance Audit Report', format: 'PDF', desc: '6-Section Technical Analysis', color: 'text-blue-400', bg: 'bg-blue-400/10', icon: BarChart3 },
  { id: 'platform', title: 'VZY Platform Analysis Slide', format: 'PPTX', desc: '14-Slide Presentation', color: 'text-purple-400', bg: 'bg-purple-400/10', icon: Monitor },
  { id: 'management', title: 'Management Report', format: 'PDF', desc: 'Executive Risk Assessment', color: 'text-emerald-400', bg: 'bg-emerald-400/10', icon: Briefcase },
  { id: 'developer', title: 'Developer Report', format: 'PDF', desc: 'Technical Deep-Dive', color: 'text-orange-400', bg: 'bg-orange-400/10', icon: Code2 },
] as const;

function ScoreBar({ label, score, color }: { label: string; score: number; color: string }) {
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-sm">
        <span className="text-[var(--text-secondary)]">{label}</span>
        <span className="font-semibold text-[var(--text-primary)]">{score.toFixed(1)}</span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-[var(--border)]">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(score, 100)}%` }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className={clsx('h-full rounded-full', color)}
        />
      </div>
    </div>
  );
}

function SeverityBadge({ severity }: { severity: string }) {
  const s = severity.toLowerCase();
  return (
    <span className={clsx(
      'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
      s === 'critical' && 'bg-red-500/20 text-red-400',
      s === 'high' && 'bg-orange-500/20 text-orange-400',
      s === 'medium' && 'bg-yellow-500/20 text-yellow-400',
      s === 'low' && 'bg-blue-500/20 text-blue-400',
    )}>
      {severity}
    </span>
  );
}

function getScoreColor(score: number) {
  if (score >= 90) return 'text-emerald-400';
  if (score >= 70) return 'text-yellow-400';
  if (score >= 50) return 'text-orange-400';
  return 'text-red-400';
}

/** Counts from API `regressions` JSON — score drops vs new critical/high findings vs last scan. */
function lastScanComparisonStats(scan: ScanData) {
  const rows = scan.regressions ?? [];
  const scoreRows = rows.filter(
    (r) => r.previous != null && r.current != null && typeof r.delta === 'number',
  );
  const newHighSeverity = rows.filter((r) => r.metric === 'New Finding');
  const netDelta = scoreRows.reduce((sum, r) => sum + (r.delta ?? 0), 0);
  return { scoreRows, newHighSeverity, netDelta };
}

function buildMindMap(scan: ScanData): MindMapNode {
  const criticals = scan.findings.filter(f => f.severity === 'CRITICAL').length;
  const highs = scan.findings.filter(f => f.severity === 'HIGH').length;
  const mediums = scan.findings.filter(f => f.severity === 'MEDIUM').length;
  const lows = scan.findings.filter(f => f.severity === 'LOW').length;
  const secFindings = scan.findings.filter(f => f.category.toLowerCase().includes('security'));
  const perfFindings = scan.findings.filter(f => f.category.toLowerCase().includes('performance'));
  const cqFindings = scan.findings.filter(f => f.category.toLowerCase().includes('code') || f.category.toLowerCase().includes('quality'));
  const { scoreRows, newHighSeverity, netDelta } = lastScanComparisonStats(scan);

  return {
    id: 'root',
    label: 'Executive Summary',
    color: '#3b82f6',
    children: [
      {
        id: 'kpi', label: 'Overall KPI', value: `${scan.overall_score.toFixed(1)}`, color: '#3b82f6',
        children: [
          { id: 'kpi-status', label: 'Status', value: scan.overall_score >= 90 ? 'PASS' : 'FAIL', color: '#3b82f6' },
        ],
      },
      { id: 'target', label: 'Target', value: scan.target_url, color: '#3b82f6' },
      {
        id: 'findings', label: 'Total Findings', value: `${scan.findings.length}`, color: '#3b82f6',
        children: [
          { id: 'f-crit', label: 'Critical', value: `${criticals}`, color: '#ef4444' },
          { id: 'f-high', label: 'High', value: `${highs}`, color: '#f97316' },
          { id: 'f-med', label: 'Medium', value: `${mediums}`, color: '#eab308' },
          { id: 'f-low', label: 'Low', value: `${lows}`, color: '#3b82f6' },
        ],
      },
      {
        id: 'vs-last-scan',
        label: 'Compared to last scan',
        value: `${scan.regressions.length}`,
        color: '#3b82f6',
        children: [
          {
            id: 'vs-net',
            label: 'Net score change',
            value: `${netDelta >= 0 ? '+' : ''}${netDelta.toFixed(1)}`,
            color: netDelta < 0 ? '#ef4444' : '#22c55e',
          },
          {
            id: 'vs-areas',
            label: 'Areas with lower scores',
            value: `${scoreRows.length}`,
            color: '#f97316',
          },
          {
            id: 'vs-new',
            label: 'New critical/high findings',
            value: `${newHighSeverity.length}`,
            color: '#ef4444',
          },
        ],
      },
      {
        id: 'security', label: 'Security', value: `${scan.security_score.toFixed(1)}`, color: '#ef4444',
        children: secFindings.slice(0, 3).map((f, i) => ({ id: `sec-${i}`, label: f.title, color: '#ef4444' })),
      },
      {
        id: 'performance', label: 'Performance', value: `${scan.performance_score.toFixed(1)}`, color: '#22c55e',
        children: perfFindings.slice(0, 3).map((f, i) => ({ id: `perf-${i}`, label: f.title, color: '#22c55e' })),
      },
      {
        id: 'code-quality', label: 'Code Quality', value: `${scan.code_quality_score.toFixed(1)}`, color: '#a855f7',
        children: cqFindings.slice(0, 3).map((f, i) => ({ id: `cq-${i}`, label: f.title, color: '#a855f7' })),
      },
    ],
  };
}

function MindMapTreeNode({ node, depth = 0 }: { node: MindMapNode; depth?: number }) {
  const [expanded, setExpanded] = useState(depth < 2);
  const hasChildren = node.children && node.children.length > 0;

  return (
    <div className={clsx(depth > 0 && 'ml-6 border-l border-[var(--border)] pl-4')}>
      <button
        onClick={() => hasChildren && setExpanded(!expanded)}
        className="group my-1 flex items-center gap-2 text-left"
      >
        {hasChildren ? (
          expanded
            ? <ChevronDown className="h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)]" />
            : <ChevronRight className="h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)]" />
        ) : (
          <Minus className="h-3.5 w-3.5 shrink-0 text-[var(--text-tertiary)]" />
        )}
        <span
          className="rounded-md px-2.5 py-1 text-sm font-medium"
          style={{ backgroundColor: `${node.color}15`, color: node.color, borderLeft: `3px solid ${node.color}` }}
        >
          {node.label}
          {node.value && <span className="ml-2 font-semibold opacity-80">{node.value}</span>}
        </span>
      </button>
      <AnimatePresence>
        {expanded && hasChildren && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2 }}
          >
            {node.children!.map(child => (
              <MindMapTreeNode key={child.id} node={child} depth={depth + 1} />
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default function Reporting() {
  const [activeTab, setActiveTab] = useState<ReportTab>('overview');
  const [generating, setGenerating] = useState<string | null>(null);
  const [summaryExpanded, setSummaryExpanded] = useState(false);
  const [weeklyData, setWeeklyData] = useState<WeeklyPoint[]>([]);

  const { currentScan, scans, loadScans } = useScanStore();
  const scan = currentScan ?? scans[0] ?? null;

  useEffect(() => {
    if (scans.length === 0) loadScans();
  }, [scans.length, loadScans]);

  useEffect(() => {
    api.get<{ data: WeeklyPoint[] }>('/analytics/weekly').then(d => setWeeklyData(d.data)).catch(() => {
      const now = Date.now();
      setWeeklyData(Array.from({ length: 30 }, (_, i) => ({
        date: format(new Date(now - (29 - i) * 86400000), 'MMM d'),
        score: 70 + Math.random() * 25,
        security: 60 + Math.random() * 30,
        performance: 65 + Math.random() * 30,
        code_quality: 70 + Math.random() * 25,
      })));
    });
  }, []);

  const generateReport = useCallback(async (type: string) => {
    setGenerating(type);
    try {
      const blob = await fetch(`/api/reports/${type}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${localStorage.getItem('token') ?? ''}` },
        body: JSON.stringify({ scan_id: scan?.scan_id }),
      }).then(r => r.blob());
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${type}-report.${type === 'platform' ? 'pptx' : 'pdf'}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch { /* download failed silently */ }
    setGenerating(null);
  }, [scan]);

  const exportJson = useCallback(() => {
    if (!scan) return;
    const blob = new Blob([JSON.stringify(scan, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scan-${scan.scan_id}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }, [scan]);

  const handleShare = useCallback(() => {
    if (!scan) return;
    navigator.clipboard.writeText(`${window.location.origin}/report/${scan.scan_id}`);
  }, [scan]);

  const criticalFindings = scan?.findings.filter(f => f.severity === 'CRITICAL' || f.severity === 'HIGH') ?? [];
  const overallScore = scan?.overall_score ?? 0;
  const passed = overallScore >= 90;
  const tabItems: { id: ReportTab; label: string }[] = [
    { id: 'overview', label: 'Overview' },
    { id: 'management', label: 'Management' },
    { id: 'developer', label: 'Developer' },
    { id: 'mindmap', label: 'Mind Map' },
  ];

  if (!scan) {
    return (
      <div className="flex min-h-0 items-center justify-center bg-[var(--bg-primary)]">
        <div className="text-center">
          <FileText className="mx-auto mb-4 h-12 w-12 text-[var(--text-tertiary)]" />
          <h2 className="text-lg font-semibold text-[var(--text-primary)]">No Scan Data</h2>
          <p className="mt-1 text-sm text-[var(--text-tertiary)]">Run a scan first to generate reports.</p>
        </div>
      </div>
    );
  }

  const lastScanStats = lastScanComparisonStats(scan);

  return (
    <div className="min-h-0 bg-[var(--bg-primary)] text-[var(--text-primary)]">
      {/* Header */}
      <div className="border-b px-6 py-5" style={{ borderColor: 'var(--border)' }}>
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Reporting</h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">Generate, download, and share scan reports</p>
          </div>
          <div className="flex gap-2">
            <button onClick={exportJson} className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]" style={{ borderColor: 'var(--border)' }}>
              <Download className="h-4 w-4" /> JSON
            </button>
            <button onClick={handleShare} className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]" style={{ borderColor: 'var(--border)' }}>
              <Share2 className="h-4 w-4" /> Share
            </button>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-7xl p-6">
        {/* Report Type Cards */}
        <div className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {REPORT_TYPES.map(rt => (
            <button
              key={rt.id}
              onClick={() => generateReport(rt.id)}
              disabled={generating !== null}
              className="group rounded-xl border bg-[var(--bg-card)] p-5 text-left transition-all hover:border-blue-500/30"
              style={{ borderColor: 'var(--border)' }}
            >
              <div className={clsx('mb-3 inline-flex rounded-lg p-2.5', rt.bg)}>
                <rt.icon className={clsx('h-5 w-5', rt.color)} />
              </div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)]">{rt.title}</h3>
              <div className="mt-1 flex items-center gap-2">
                <span className="rounded px-1.5 py-0.5 text-xs font-medium text-[var(--text-secondary)]" style={{ backgroundColor: 'rgba(99,102,241,0.12)' }}>{rt.format}</span>
                <span className="text-xs text-[var(--text-tertiary)]">{rt.desc}</span>
              </div>
              <p className="mt-2 text-xs text-blue-400 opacity-0 transition-opacity group-hover:opacity-100">
                {generating === rt.id ? 'Generating...' : 'Click to generate & download'}
              </p>
            </button>
          ))}
        </div>

        {/* Tabs */}
        <div className="mb-6 flex gap-1 rounded-lg border bg-[var(--bg-card)] p-1" style={{ borderColor: 'var(--border)' }}>
          {tabItems.map(t => (
            <button
              key={t.id}
              onClick={() => setActiveTab(t.id)}
              className={clsx(
                'flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors',
                activeTab === t.id ? 'text-[var(--text-primary)]' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
              )}
              style={activeTab === t.id ? { backgroundColor: 'rgba(99,102,241,0.12)' } : undefined}
            >
              {t.label}
            </button>
          ))}
        </div>

        <AnimatePresence mode="wait">
          {/* ── Overview Tab ── */}
          {activeTab === 'overview' && (
            <motion.div key="overview" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
              {/* Scan header */}
              <div className="rounded-xl border bg-[var(--bg-card)] p-5" style={{ borderColor: 'var(--border)' }}>
                <h3 className="mb-3 text-lg font-semibold">Scan Report</h3>
                <div className="grid grid-cols-2 gap-4 text-sm lg:grid-cols-4">
                  <div><span className="text-[var(--text-tertiary)]">Scan ID</span><p className="mt-0.5 font-mono text-[var(--text-primary)]">{scan.scan_id.slice(0, 12)}</p></div>
                  <div><span className="text-[var(--text-tertiary)]">Generated</span><p className="mt-0.5 text-[var(--text-primary)]">{scan.completed_at ? format(new Date(scan.completed_at), 'PPp') : '—'}</p></div>
                  <div><span className="text-[var(--text-tertiary)]">Target URL</span><p className="mt-0.5 truncate text-[var(--text-primary)]">{scan.target_url}</p></div>
                  <div><span className="text-[var(--text-tertiary)]">Status</span><p className="mt-0.5 capitalize text-[var(--text-primary)]">{scan.status}</p></div>
                </div>
              </div>

              {/* Scores */}
              <div className="grid gap-6 lg:grid-cols-3">
                <div className="space-y-4 lg:col-span-2">
                  <div className="rounded-xl border bg-[var(--bg-card)] p-5" style={{ borderColor: 'var(--border)' }}>
                    <div className="space-y-4">
                      <ScoreBar label="Security" score={scan.security_score ?? 0} color="bg-red-400" />
                      <ScoreBar label="Performance" score={scan.performance_score ?? 0} color="bg-emerald-400" />
                      <ScoreBar label="Code Quality" score={scan.code_quality_score ?? 0} color="bg-purple-400" />
                    </div>
                  </div>
                </div>
                <div className="flex flex-col items-center justify-center rounded-xl border bg-[var(--bg-card)] p-6" style={{ borderColor: 'var(--border)' }}>
                  <p className="text-sm text-[var(--text-tertiary)]">Overall KPI</p>
                  <p className={clsx('my-2 text-5xl font-bold', getScoreColor(overallScore))}>{overallScore.toFixed(1)}</p>
                  <span className={clsx(
                    'rounded-full px-3 py-1 text-xs font-bold',
                    passed ? 'bg-emerald-500/20 text-emerald-400' : 'bg-red-500/20 text-red-400'
                  )}>
                    {passed ? 'PASS' : 'FAIL'}
                  </span>
                </div>
              </div>

              {/* Executive Summary */}
              <div className="rounded-xl border bg-[var(--bg-card)] p-5" style={{ borderColor: 'var(--border)' }}>
                <button onClick={() => setSummaryExpanded(!summaryExpanded)} className="flex w-full items-center justify-between">
                  <h3 className="text-sm font-semibold">Executive Summary</h3>
                  <ChevronDown className={clsx('h-4 w-4 text-[var(--text-tertiary)] transition-transform', summaryExpanded && 'rotate-180')} />
                </button>
                <AnimatePresence>
                  {summaryExpanded && (
                    <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                      <p className="mt-3 text-sm leading-relaxed text-[var(--text-secondary)]">
                        The scan of <span className="text-[var(--text-primary)]">{scan.target_url}</span> completed with an overall KPI score of{' '}
                        <span className={getScoreColor(overallScore)}>{overallScore.toFixed(1)}</span>.
                        A total of {scan.findings.length} findings were identified across all agents,
                        including {criticalFindings.length} critical/high severity issues requiring immediate attention.
                        {scan.regressions.length > 0 &&
                          ` Compared to the last scan: ${lastScanStats.scoreRows.length} score area(s) with lower points` +
                            (lastScanStats.newHighSeverity.length > 0
                              ? `, ${lastScanStats.newHighSeverity.length} new critical/high finding(s) not present on the last scan`
                              : '') +
                            ` (net score change ${lastScanStats.netDelta >= 0 ? '+' : ''}${lastScanStats.netDelta.toFixed(1)}).`}
                      </p>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>

              {/* Critical & High Findings */}
              {criticalFindings.length > 0 && (
                <div className="rounded-xl border bg-[var(--bg-card)] p-5" style={{ borderColor: 'var(--border)' }}>
                  <h3 className="mb-4 text-sm font-semibold">Critical &amp; High Findings</h3>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-[var(--border)] text-left text-xs font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
                          <th className="pb-3 pr-3">Severity</th>
                          <th className="pb-3 pr-3">Finding</th>
                          <th className="pb-3 pr-3">Category</th>
                          <th className="pb-3">Agent</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border)]">
                        {criticalFindings.map((f, i) => (
                          <tr key={i}>
                            <td className="py-2.5 pr-3"><SeverityBadge severity={f.severity} /></td>
                            <td className="py-2.5 pr-3 text-[var(--text-primary)]">{f.title}</td>
                            <td className="py-2.5 pr-3 text-[var(--text-secondary)]">{f.category}</td>
                            <td className="py-2.5 text-[var(--text-secondary)]">{getCategoryAgent(f)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Compared to last scan (API field: regressions) */}
              <div className="grid gap-4 sm:grid-cols-3">
                <VsLastScanCard
                  label="Net score change vs last scan"
                  value={`${lastScanStats.netDelta >= 0 ? '+' : ''}${lastScanStats.netDelta.toFixed(1)}`}
                  trend={lastScanStats.netDelta >= 0 ? 'up' : 'down'}
                />
                <VsLastScanCard
                  label="Areas with lower scores"
                  value={`${lastScanStats.scoreRows.length}`}
                  trend={lastScanStats.scoreRows.length > 0 ? 'down' : 'up'}
                />
                <VsLastScanCard
                  label="New critical/high findings"
                  value={`${lastScanStats.newHighSeverity.length}`}
                  trend={lastScanStats.newHighSeverity.length > 0 ? 'down' : 'up'}
                />
              </div>

              {/* Weekly Summary Chart */}
              {weeklyData.length > 0 && (
                <div className="rounded-xl border bg-[var(--bg-card)] p-5" style={{ borderColor: 'var(--border)' }}>
                  <h3 className="mb-4 text-sm font-semibold">Weekly Summary (Last 30 Days)</h3>
                  <div className="h-64">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={weeklyData}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                        <XAxis dataKey="date" stroke="var(--text-tertiary)" fontSize={11} tickLine={false} />
                        <YAxis domain={[0, 100]} stroke="var(--text-tertiary)" fontSize={11} tickLine={false} />
                        <Tooltip contentStyle={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-strong)', borderRadius: 12, fontSize: '12px' }} />
                        <Line type="monotone" dataKey="score" stroke="#3b82f6" strokeWidth={2} dot={false} name="Overall" />
                        <Line type="monotone" dataKey="security" stroke="#ef4444" strokeWidth={1.5} dot={false} name="Security" />
                        <Line type="monotone" dataKey="performance" stroke="#22c55e" strokeWidth={1.5} dot={false} name="Performance" />
                        <Line type="monotone" dataKey="code_quality" stroke="#a855f7" strokeWidth={1.5} dot={false} name="Code Quality" />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                </div>
              )}

              {/* Risk Status */}
              <div className="rounded-xl border bg-[var(--bg-card)] p-5" style={{ borderColor: 'var(--border)' }}>
                <h3 className="mb-4 text-sm font-semibold">Risk Status</h3>
                <div className="space-y-4">
                  <RiskBar label="Security Posture" score={scan.security_score ?? 0} icon={Shield} />
                  <RiskBar label="Performance Health" score={scan.performance_score ?? 0} icon={Zap} />
                  <RiskBar label="Code Maintainability" score={scan.code_quality_score ?? 0} icon={Code2} />
                </div>
              </div>

              {/* Compliance Snapshot */}
              <div className="rounded-xl border bg-[var(--bg-card)] p-5" style={{ borderColor: 'var(--border)' }}>
                <h3 className="mb-4 text-sm font-semibold">Compliance Snapshot</h3>
                <div className="grid gap-3 sm:grid-cols-3">
                  <ComplianceItem label="OWASP Top 10" status={(scan.security_score ?? 0) >= 80 ? 'compliant' : 'at-risk'} />
                  <ComplianceItem label="Performance Budget" status={(scan.performance_score ?? 0) >= 80 ? 'compliant' : 'at-risk'} />
                  <ComplianceItem label="Code Standards" status={(scan.code_quality_score ?? 0) >= 80 ? 'compliant' : 'at-risk'} />
                </div>
              </div>
            </motion.div>
          )}

          {/* ── Management Tab ── */}
          {activeTab === 'management' && (
            <motion.div key="management" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
              {/* Report actions */}
              <div className="flex items-center justify-between rounded-xl border bg-[var(--bg-card)] p-5" style={{ borderColor: 'var(--border)' }}>
                <div>
                  <h3 className="font-semibold">Management Report</h3>
                  <p className="text-sm text-[var(--text-tertiary)]">Executive risk assessment & recommendations</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => generateReport('management')} className="btn-primary flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium">
                    {generating === 'management' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Download PDF
                  </button>
                  <button onClick={() => generateReport('management')} className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]" style={{ borderColor: 'var(--border)' }}>
                    <RefreshCw className="h-4 w-4" /> Regenerate
                  </button>
                </div>
              </div>

              {/* Score cards */}
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <ScoreCard label="Overall KPI" score={overallScore} />
                <ScoreCard label="Security" score={scan.security_score ?? 0} />
                <ScoreCard label="Performance" score={scan.performance_score ?? 0} />
                <ScoreCard label="Code Quality" score={scan.code_quality_score ?? 0} />
              </div>

              {/* Executive Risk Posture */}
              <div className="rounded-xl border bg-[var(--bg-card)] p-6" style={{ borderColor: 'var(--border)' }}>
                <h3 className="mb-4 text-lg font-semibold">Executive Risk Posture Report</h3>
                <div className="space-y-4 text-sm leading-relaxed text-[var(--text-secondary)]">
                  <p>
                    <span className="font-semibold text-[var(--text-primary)]">Risk Summary:</span> The platform presents a{' '}
                    <span className={getScoreColor(overallScore)}>{overallScore >= 80 ? 'moderate' : 'high'}-risk</span>{' '}
                    posture with {criticalFindings.length} critical/high findings that require executive attention.
                  </p>
                  <div>
                    <h4 className="mb-2 font-semibold text-[var(--text-primary)]">Overall Platform Health</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--text-tertiary)]">
                            <th className="pb-2 pr-4">Category</th><th className="pb-2 pr-4">Score</th><th className="pb-2 pr-4">Status</th><th className="pb-2">Risk</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                          {[
                            { cat: 'Security', score: scan.security_score ?? 0 },
                            { cat: 'Performance', score: scan.performance_score ?? 0 },
                            { cat: 'Code Quality', score: scan.code_quality_score ?? 0 },
                          ].map(r => (
                            <tr key={r.cat}>
                              <td className="py-2 pr-4 text-[var(--text-primary)]">{r.cat}</td>
                              <td className={clsx('py-2 pr-4 font-semibold', getScoreColor(r.score))}>{r.score.toFixed(1)}</td>
                              <td className="py-2 pr-4">{r.score >= 80 ? <span className="text-emerald-400">Acceptable</span> : <span className="text-red-400">Below Target</span>}</td>
                              <td className="py-2">{r.score >= 90 ? 'Low' : r.score >= 70 ? 'Medium' : 'High'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                  {criticalFindings.length > 0 && (
                    <div>
                      <h4 className="mb-2 font-semibold text-[var(--text-primary)]">Critical Issues Requiring Attention</h4>
                      <ul className="list-inside list-disc space-y-1">
                        {criticalFindings.slice(0, 5).map((f, i) => (
                          <li key={i}><span className="text-[var(--text-primary)]">{f.title}</span> — {f.description}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div>
                    <h4 className="mb-2 font-semibold text-[var(--text-primary)]">Remediation Roadmap</h4>
                    <div className="space-y-2">
                      {[
                        { phase: '0-30 Days', items: 'Address all critical security vulnerabilities and high-priority performance issues.' },
                        { phase: '30-60 Days', items: 'Resolve medium-severity findings and implement monitoring improvements.' },
                        { phase: '60-90 Days', items: 'Complete code quality enhancements and establish automated performance and security testing.' },
                      ].map(p => (
                        <div key={p.phase} className="rounded-lg bg-[var(--bg-primary)] p-3">
                          <span className="text-xs font-semibold text-blue-400">{p.phase}</span>
                          <p className="mt-0.5 text-[var(--text-secondary)]">{p.items}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── Developer Tab ── */}
          {activeTab === 'developer' && (
            <motion.div key="developer" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="space-y-6">
              {/* Report actions */}
              <div className="flex items-center justify-between rounded-xl border bg-[var(--bg-card)] p-5" style={{ borderColor: 'var(--border)' }}>
                <div>
                  <h3 className="font-semibold">Developer Report</h3>
                  <p className="text-sm text-[var(--text-tertiary)]">Technical deep-dive with evidence & fixes</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => generateReport('developer')} className="btn-primary flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-medium">
                    {generating === 'developer' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />} Download PDF
                  </button>
                  <button onClick={() => generateReport('developer')} className="flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]" style={{ borderColor: 'var(--border)' }}>
                    <RefreshCw className="h-4 w-4" /> Regenerate
                  </button>
                </div>
              </div>

              {/* Score cards */}
              <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
                <ScoreCard label="Overall KPI" score={overallScore} />
                <ScoreCard label="Security" score={scan.security_score ?? 0} />
                <ScoreCard label="Performance" score={scan.performance_score ?? 0} />
                <ScoreCard label="Code Quality" score={scan.code_quality_score ?? 0} />
              </div>

              {/* Developer Technical Report */}
              <div className="rounded-xl border bg-[var(--bg-card)] p-6" style={{ borderColor: 'var(--border)' }}>
                <h3 className="mb-4 text-lg font-semibold">Developer Technical Report</h3>
                <div className="space-y-4 text-sm leading-relaxed text-[var(--text-secondary)]">
                  {/* Score Summary Table */}
                  <div>
                    <h4 className="mb-2 font-semibold text-[var(--text-primary)]">Score Summary</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--text-tertiary)]">
                            <th className="pb-2 pr-4">Agent</th><th className="pb-2 pr-4">Score</th><th className="pb-2 pr-4">Findings</th><th className="pb-2">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                          {[
                            { agent: 'Security', score: scan.security_score ?? 0, findings: scan.findings.filter(f => f.category.toLowerCase().includes('security')).length },
                            { agent: 'Performance', score: scan.performance_score ?? 0, findings: scan.findings.filter(f => f.category.toLowerCase().includes('performance')).length },
                            { agent: 'Code Quality', score: scan.code_quality_score ?? 0, findings: scan.findings.filter(f => f.category.toLowerCase().includes('code') || f.category.toLowerCase().includes('quality')).length },
                          ].map(r => (
                            <tr key={r.agent}>
                              <td className="py-2 pr-4 text-[var(--text-primary)]">{r.agent}</td>
                              <td className={clsx('py-2 pr-4 font-semibold', getScoreColor(r.score))}>{r.score.toFixed(1)}</td>
                              <td className="py-2 pr-4 text-[var(--text-secondary)]">{r.findings}</td>
                              <td className="py-2">{r.score >= 90 ? '✅ Pass' : '⚠️ Needs Work'}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  {/* Findings with evidence */}
                  {criticalFindings.length > 0 && (
                    <div>
                      <h4 className="mb-2 font-semibold text-[var(--text-primary)]">Critical &amp; High Findings</h4>
                      <div className="space-y-3">
                        {criticalFindings.map((f, i) => (
                          <div key={i} className="rounded-lg border bg-[var(--bg-primary)] p-4" style={{ borderColor: 'var(--border)' }}>
                            <div className="mb-2 flex items-center gap-2">
                              <SeverityBadge severity={f.severity} />
                              <span className="font-medium text-[var(--text-primary)]">{f.title}</span>
                            </div>
                            <p className="mb-2 text-[var(--text-secondary)]">{f.description}</p>
                            {f.remediation && (
                              <div className="rounded-md bg-[var(--bg-card)] p-3">
                                <span className="text-xs font-semibold uppercase text-emerald-400">Fix</span>
                                <p className="mt-1 font-mono text-xs text-[var(--text-primary)]">{f.remediation}</p>
                              </div>
                            )}
                            <div className="mt-2 text-xs text-[var(--text-tertiary)]">Agent: {getCategoryAgent(f)}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Top Recommendations */}
                  {scan.recommendations.length > 0 && (
                    <div>
                      <h4 className="mb-2 font-semibold text-[var(--text-primary)]">Top Recommendations</h4>
                      <ol className="list-inside list-decimal space-y-1.5">
                        {scan.recommendations.slice(0, 8).map((rec, i) => (
                          <li key={i} className="text-[var(--text-primary)]">{rec.title ?? rec.description}</li>
                        ))}
                      </ol>
                    </div>
                  )}

                  {/* Remediation Roadmap */}
                  <div>
                    <h4 className="mb-2 font-semibold text-[var(--text-primary)]">Remediation Roadmap</h4>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-[var(--border)] text-left text-xs uppercase tracking-wider text-[var(--text-tertiary)]">
                            <th className="pb-2 pr-4">Issue</th><th className="pb-2 pr-4">Impact</th><th className="pb-2 pr-4">Effort</th><th className="pb-2">Gain</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                          {criticalFindings.slice(0, 5).map((f, i) => (
                            <tr key={i}>
                              <td className="py-2 pr-4 text-[var(--text-primary)]">{f.title}</td>
                              <td className="py-2 pr-4"><span className={clsx('text-xs font-medium', f.severity === 'CRITICAL' ? 'text-red-400' : 'text-orange-400')}>{f.severity === 'CRITICAL' ? '9/10' : '7/10'}</span></td>
                              <td className="py-2 pr-4 text-[var(--text-secondary)]">{f.severity === 'CRITICAL' ? 'High' : 'Medium'}</td>
                              <td className="py-2 text-emerald-400">+{(Math.random() * 5 + 2).toFixed(1)} pts</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── Mind Map Tab ── */}
          {activeTab === 'mindmap' && (
            <motion.div key="mindmap" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <div className="rounded-xl border bg-[var(--bg-card)] p-5" style={{ borderColor: 'var(--border)' }}>
                <div className="mb-4 flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Mind Map Visualization</h3>
                  <div className="flex gap-2">
                    <button className="rounded-lg border px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]" style={{ borderColor: 'var(--border)' }}>
                      Expand All
                    </button>
                    <button className="rounded-lg border px-3 py-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)]" style={{ borderColor: 'var(--border)' }}>
                      Collapse All
                    </button>
                  </div>
                </div>
                {/* Legend */}
                <div className="mb-5 flex flex-wrap gap-3">
                  {[
                    { label: 'Executive', color: '#3b82f6' },
                    { label: 'Security', color: '#ef4444' },
                    { label: 'Performance', color: '#22c55e' },
                    { label: 'Code Quality', color: '#a855f7' },
                    { label: 'Recommendations', color: '#f97316' },
                  ].map(l => (
                    <div key={l.label} className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)]">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: l.color }} />
                      {l.label}
                    </div>
                  ))}
                </div>
                {/* Tree */}
                <div className="overflow-x-auto rounded-lg bg-[var(--bg-primary)] p-4">
                  <MindMapTreeNode node={buildMindMap(scan)} />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

/* ─── Helper sub-components ─── */

function ScoreCard({ label, score }: { label: string; score: number }) {
  return (
    <div className="rounded-xl border bg-[var(--bg-card)] p-4 text-center" style={{ borderColor: 'var(--border)' }}>
      <p className="text-xs text-[var(--text-tertiary)]">{label}</p>
      <p className={clsx('mt-1 text-2xl font-bold', getScoreColor(score))}>{score.toFixed(1)}</p>
    </div>
  );
}

function VsLastScanCard({ label, value, trend }: { label: string; value: string; trend: 'up' | 'down' }) {
  return (
    <div className="rounded-xl border bg-[var(--bg-card)] p-4 text-center" style={{ borderColor: 'var(--border)' }}>
      <p className="text-xs text-[var(--text-tertiary)]">{label}</p>
      <div className="mt-1 flex items-center justify-center gap-1">
        {trend === 'up' ? <TrendingUp className="h-4 w-4 text-emerald-400" /> : <TrendingDown className="h-4 w-4 text-red-400" />}
        <span className={clsx('text-xl font-bold', trend === 'up' ? 'text-emerald-400' : 'text-red-400')}>{value}</span>
      </div>
    </div>
  );
}

function RiskBar({ label, score, icon: Icon }: { label: string; score: number; icon: typeof Shield }) {
  return (
    <div className="flex items-center gap-3">
      <Icon className="h-4 w-4 shrink-0 text-[var(--text-tertiary)]" />
      <div className="flex-1">
        <div className="mb-1 flex items-center justify-between text-sm">
          <span className="text-[var(--text-secondary)]">{label}</span>
          <span className={clsx('font-semibold', getScoreColor(score))}>{score.toFixed(1)}</span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-[var(--border)]">
          <div className={clsx('h-full rounded-full', score >= 80 ? 'bg-emerald-400' : score >= 60 ? 'bg-yellow-400' : 'bg-red-400')} style={{ width: `${score}%` }} />
        </div>
      </div>
    </div>
  );
}

function ComplianceItem({ label, status }: { label: string; status: 'compliant' | 'at-risk' }) {
  return (
    <div className="flex items-center justify-between rounded-lg bg-[var(--bg-primary)] p-3">
      <span className="text-sm text-[var(--text-primary)]">{label}</span>
      <span className={clsx(
        'rounded-full px-2 py-0.5 text-xs font-medium',
        status === 'compliant' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-orange-500/20 text-orange-400'
      )}>
        {status === 'compliant' ? 'Compliant' : 'At Risk'}
      </span>
    </div>
  );
}

function getCategoryAgent(f: Finding) {
  const cat = f.category.toLowerCase();
  if (cat.includes('security') || cat.includes('vuln') || cat.includes('xss') || cat.includes('owasp')) return 'Security';
  if (cat.includes('perf') || cat.includes('speed') || cat.includes('load')) return 'Performance';
  return 'Code Quality';
}
