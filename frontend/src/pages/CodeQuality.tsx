import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import {
  Code2,
  Copy,
  Check,
  FileSearch,
  AlertTriangle,
} from 'lucide-react';
import { useScanStore } from '../store/scanStore';
import type { CodeQualityResults } from '../store/scanStore';
import ScoreGauge from '../components/Charts/ScoreGauge';
import SeverityBadge from '../components/Charts/SeverityBadge';

type TabId = 'overview' | 'complexity' | 'memory' | 'files' | 'raw';

const tabs: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'complexity', label: 'Complexity' },
  { id: 'memory', label: 'Memory & Async' },
  { id: 'files', label: 'Problematic Files' },
  { id: 'raw', label: 'Raw JSON' },
];

function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex flex-col items-center justify-center py-32 text-center"
    >
      <div className="rounded-full p-6 mb-6" style={{ background: 'linear-gradient(135deg, rgba(99,102,241,0.15) 0%, rgba(139,92,246,0.10) 100%)' }}>
        <FileSearch className="w-12 h-12 text-[var(--text-tertiary)]" />
      </div>
      <h2 className="text-xl font-semibold gradient-text mb-2">No Code Quality Data</h2>
      <p className="text-[var(--text-secondary)] max-w-md">
        Run a verification scan first to view code quality analysis results.
      </p>
    </motion.div>
  );
}

function MetricCard({
  label,
  value,
  color,
}: {
  label: string;
  value: string | number;
  color?: string;
}) {
  return (
    <div className="card rounded-xl p-4">
      <p className="text-xs text-[var(--text-tertiary)] mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color ?? 'text-[var(--text-primary)]'}`}>{value}</p>
    </div>
  );
}

function CopyJsonButton({ json }: { json: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(json);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <button
      onClick={handleCopy}
      className="flex items-center gap-1.5 text-xs text-[var(--text-secondary)] hover:text-[var(--text-primary)] transition-colors rounded-lg px-3 py-1.5"
      style={{ background: 'rgba(99,102,241,0.04)', border: '1px solid var(--border)' }}
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function heatColor(count: number, max: number): string {
  if (max === 0) return 'bg-[var(--bg-elevated)]';
  const ratio = count / max;
  if (ratio >= 0.75) return 'bg-red-500';
  if (ratio >= 0.5) return 'bg-orange-500';
  if (ratio >= 0.25) return 'bg-yellow-500';
  return 'bg-blue-500/60';
}

export default function CodeQuality() {
  const { currentScan } = useScanStore();
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  if (!currentScan) return <EmptyState />;

  const scan = currentScan;
  const cq = scan.code_quality_results ?? {};

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Code2 className="w-5 h-5 text-emerald-400" />
            <h1 className="text-xl font-bold gradient-text">Code Quality Analysis</h1>
          </div>
          <p className="text-sm text-[var(--text-secondary)]">
            Static analysis, dead code, memory leaks, anti-patterns, complexity
          </p>
        </div>
        <ScoreGauge score={scan.code_quality_score} label="Code Quality" size="sm" />
      </div>

      {/* Tabs */}
      <div className="flex gap-1 overflow-x-auto" style={{ borderBottom: '1px solid var(--border)' }}>
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className={`px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-colors border-b-2 ${
              activeTab === t.id
                ? 'text-[var(--text-primary)] border-[var(--accent)]'
                : 'text-[var(--text-tertiary)] border-transparent hover:text-[var(--text-secondary)]'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && <OverviewTab cq={cq} findings={scan.findings} />}
      {activeTab === 'complexity' && <ComplexityTab cq={cq} />}
      {activeTab === 'memory' && <MemoryTab cq={cq} />}
      {activeTab === 'files' && <FilesTab cq={cq} />}
      {activeTab === 'raw' && <RawTab data={cq} />}
    </div>
  );
}

function OverviewTab({
  cq,
  findings,
}: {
  cq: CodeQualityResults;
  findings: Array<{ severity: string; title: string; category: string }>;
}) {
  const categoryData = Object.entries(cq.findings_by_category ?? {}).map(
    ([name, value]) => ({ name, value }),
  );

  const cqFindings = findings.filter(
    (f) =>
      f.category.toLowerCase().includes('code') ||
      f.category.toLowerCase().includes('lint') ||
      f.category.toLowerCase().includes('complexity') ||
      f.category.toLowerCase().includes('memory') ||
      f.category.toLowerCase().includes('async') ||
      f.category.toLowerCase().includes('dead code') ||
      f.category.toLowerCase().includes('anti-pattern'),
  );

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      {/* Row 1 */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard
          label="Lint Errors"
          value={cq.lint_errors ?? 0}
          color={(cq.lint_errors ?? 0) > 0 ? 'text-red-400' : 'text-emerald-400'}
        />
        <MetricCard
          label="Lint Warnings"
          value={cq.lint_warnings ?? 0}
          color={(cq.lint_warnings ?? 0) > 0 ? 'text-yellow-400' : 'text-emerald-400'}
        />
        <MetricCard
          label="Auto-Fixable"
          value={cq.auto_fixable ?? 0}
          color="text-blue-400"
        />
        <MetricCard
          label="Dead Code"
          value={cq.dead_code ?? 0}
          color={(cq.dead_code ?? 0) > 0 ? 'text-orange-400' : 'text-emerald-400'}
        />
        <MetricCard
          label="Memory Leaks"
          value={cq.memory_leaks ?? 0}
          color={(cq.memory_leaks ?? 0) > 0 ? 'text-red-400' : 'text-emerald-400'}
        />
        <MetricCard
          label="Tech Debt (hrs)"
          value={cq.tech_debt_hours ?? 0}
          color="text-violet-400"
        />
      </div>

      {/* Row 2 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard
          label="Anti-Patterns"
          value={cq.anti_patterns ?? 0}
          color={(cq.anti_patterns ?? 0) > 0 ? 'text-orange-400' : 'text-emerald-400'}
        />
        <MetricCard
          label="Async Issues"
          value={cq.async_issues ?? 0}
          color={(cq.async_issues ?? 0) > 0 ? 'text-orange-400' : 'text-emerald-400'}
        />
        <MetricCard
          label="Avg Complexity"
          value={cq.avg_complexity?.toFixed(1) ?? '—'}
        />
        <MetricCard
          label="Max Complexity"
          value={cq.max_complexity ?? '—'}
          color={(cq.max_complexity ?? 0) > 15 ? 'text-red-400' : 'text-[var(--text-primary)]'}
        />
      </div>

      {/* Findings by Category Chart */}
      {categoryData.length > 0 && (
        <div className="card rounded-xl p-5">
          <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Findings by Category</h3>
          <ResponsiveContainer width="100%" height={Math.max(200, categoryData.length * 36)}>
            <BarChart data={categoryData} layout="vertical" margin={{ left: 120 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="rgba(99,102,241,0.06)" horizontal={false} />
              <XAxis
                type="number"
                tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }}
                axisLine={{ stroke: 'rgba(99,102,241,0.06)' }}
                tickLine={false}
              />
              <YAxis
                type="category"
                dataKey="name"
                tick={{ fill: 'var(--text-secondary)', fontSize: 11 }}
                axisLine={false}
                tickLine={false}
                width={110}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: 'var(--bg-card)',
                  border: '1px solid var(--border-strong)',
                  borderRadius: 12,
                  boxShadow: 'var(--shadow-elevated)',
                  fontSize: 12,
                }}
              />
              <Bar dataKey="value" fill="var(--accent)" radius={[0, 4, 4, 0]} maxBarSize={20} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Code Quality Findings */}
      {cqFindings.length > 0 && (
        <div className="card rounded-xl p-5">
          <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">
            Code Quality Findings ({cqFindings.length})
          </h3>
          <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
            {cqFindings.map((f, i) => (
              <div
                key={i}
                className="flex items-start gap-3 rounded-lg p-3"
                style={{ background: 'rgba(99,102,241,0.04)', border: '1px solid var(--border)' }}
              >
                <SeverityBadge
                  severity={f.severity as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO'}
                />
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-[var(--text-primary)]">{f.title}</p>
                  <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{f.category}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}

function ComplexityTab({ cq }: { cq: CodeQualityResults }) {
  const hcf = cq.high_complexity_functions ?? [];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Avg Cyclomatic" value={cq.avg_complexity?.toFixed(1) ?? '—'} />
        <MetricCard
          label="Max Cyclomatic"
          value={cq.max_complexity ?? '—'}
          color={(cq.max_complexity ?? 0) > 15 ? 'text-red-400' : 'text-[var(--text-primary)]'}
        />
        <MetricCard label="Avg Cognitive" value={cq.avg_cognitive?.toFixed(1) ?? '—'} />
        <MetricCard label="Duplicate Blocks" value={cq.duplicate_blocks ?? 0} color={(cq.duplicate_blocks ?? 0) > 0 ? 'text-orange-400' : 'text-emerald-400'} />
      </div>

      {/* High Complexity Functions */}
      <div className="card rounded-xl p-5">
        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">
          High Complexity Functions ({hcf.length})
        </h3>
        {hcf.length === 0 ? (
          <p className="text-[var(--text-tertiary)] text-sm text-center py-6">
            No high-complexity functions detected.
          </p>
        ) : (
          <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
            {hcf.map((fn, i) => (
              <div
                key={i}
                className="flex items-center justify-between rounded-lg p-3"
                style={{ background: 'rgba(99,102,241,0.04)', border: '1px solid var(--border)' }}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-[var(--text-primary)] font-mono">{fn.name}</p>
                  <p className="text-xs text-[var(--text-tertiary)] mt-0.5 truncate">{fn.file}</p>
                </div>
                <div className="flex items-center gap-2 shrink-0 ml-4">
                  <AlertTriangle
                    className={`w-4 h-4 ${fn.complexity > 20 ? 'text-red-400' : 'text-yellow-400'}`}
                  />
                  <span
                    className={`text-sm font-bold ${fn.complexity > 20 ? 'text-red-400' : 'text-yellow-400'}`}
                  >
                    {fn.complexity}
                  </span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function MemoryTab({ cq }: { cq: CodeQualityResults }) {
  const memDetails = cq.memory_leak_details ?? [];
  const asyncDetails = cq.async_issue_details ?? [];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      {/* Memory Leak Flags */}
      <div className="card rounded-xl p-5">
        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1">Memory Leak Flags</h3>
        <p className="text-xs text-[var(--text-tertiary)] mb-4">{cq.memory_leaks ?? 0} potential leaks detected</p>
        {memDetails.length === 0 ? (
          <p className="text-[var(--text-tertiary)] text-sm text-center py-6">No memory leak details available.</p>
        ) : (
          <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
            {memDetails.map((d, i) => (
              <div
                key={i}
                className="rounded-lg p-3"
                style={{ background: 'rgba(99,102,241,0.04)', border: '1px solid var(--border)' }}
              >
                <p className="text-sm text-[var(--text-primary)]">{d.description}</p>
                {d.file && <p className="text-xs text-[var(--text-tertiary)] mt-1 font-mono">{d.file}</p>}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Async Issues */}
      <div className="card rounded-xl p-5">
        <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-1">Async Issues</h3>
        <p className="text-xs text-[var(--text-tertiary)] mb-4">{cq.async_issues ?? 0} issues detected</p>
        {asyncDetails.length === 0 ? (
          <p className="text-[var(--text-tertiary)] text-sm text-center py-6">No async issue details available.</p>
        ) : (
          <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
            {asyncDetails.map((d, i) => (
              <div
                key={i}
                className="rounded-lg p-3"
                style={{ background: 'rgba(99,102,241,0.04)', border: '1px solid var(--border)' }}
              >
                <p className="text-sm text-[var(--text-primary)]">{d.description}</p>
                {d.file && <p className="text-xs text-[var(--text-tertiary)] mt-1 font-mono">{d.file}</p>}
              </div>
            ))}
          </div>
        )}
      </div>
    </motion.div>
  );
}

function FilesTab({ cq }: { cq: CodeQualityResults }) {
  const files = cq.problematic_files ?? [];
  const maxTotal = Math.max(...files.map((f) => f.total), 1);

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      {/* Risk Heatmap */}
      {files.length > 0 && (
        <div className="card rounded-xl p-5">
          <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">Risk Heatmap</h3>
          <div className="flex flex-wrap gap-1.5">
            {files.map((f, i) => (
              <div
                key={i}
                title={`${f.file} — ${f.total} findings`}
                className={`w-8 h-8 rounded ${heatColor(f.total, maxTotal)} cursor-default transition-transform hover:scale-110`}
              />
            ))}
          </div>
          <div className="flex items-center gap-4 mt-3 text-[10px] text-[var(--text-tertiary)]">
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-blue-500/60" /> Low
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-yellow-500" /> Medium
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-orange-500" /> High
            </div>
            <div className="flex items-center gap-1">
              <div className="w-3 h-3 rounded bg-red-500" /> Critical
            </div>
          </div>
        </div>
      )}

      {/* File Table */}
      <div className="card rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr
              className="text-left text-xs text-[var(--text-tertiary)]"
              style={{ background: 'rgba(99,102,241,0.04)', borderBottom: '1px solid var(--border)' }}
            >
              <th className="p-3">File</th>
              <th className="p-3 w-20 text-center">Total</th>
              <th className="p-3 w-20 text-center">Critical</th>
              <th className="p-3 w-20 text-center">High</th>
            </tr>
          </thead>
          <tbody>
            {files.length === 0 && (
              <tr>
                <td colSpan={4} className="p-6 text-center text-[var(--text-tertiary)]">
                  No problematic files identified.
                </td>
              </tr>
            )}
            {files.map((f, i) => (
              <tr
                key={i}
                className="transition-colors hover:bg-[var(--bg-card-hover)]"
                style={{ borderBottom: '1px solid rgba(99,102,241,0.06)' }}
              >
                <td className="p-3 text-[var(--text-primary)] font-mono text-xs truncate max-w-[300px]">
                  {f.file}
                </td>
                <td className="p-3 text-center text-[var(--text-primary)] font-mono">{f.total}</td>
                <td className="p-3 text-center">
                  <span
                    className={`font-mono ${f.critical > 0 ? 'text-red-400 font-bold' : 'text-[var(--text-tertiary)]'}`}
                  >
                    {f.critical}
                  </span>
                </td>
                <td className="p-3 text-center">
                  <span
                    className={`font-mono ${f.high > 0 ? 'text-orange-400 font-bold' : 'text-[var(--text-tertiary)]'}`}
                  >
                    {f.high}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}

function RawTab({ data }: { data: unknown }) {
  const json = JSON.stringify(data, null, 2);
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
      <div className="card rounded-xl p-5">
        <div className="flex justify-end mb-3">
          <CopyJsonButton json={json} />
        </div>
        <pre className="text-xs text-[var(--text-primary)] font-mono overflow-auto max-h-[600px] whitespace-pre-wrap leading-relaxed">
          {json}
        </pre>
      </div>
    </motion.div>
  );
}
