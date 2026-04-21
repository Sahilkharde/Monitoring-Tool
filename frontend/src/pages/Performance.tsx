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
  Cell,
} from 'recharts';
import {
  Gauge,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Copy,
  Check,
  FileSearch,
  Wrench,
  Activity,
  Zap,
  Globe,
  Timer,
  MousePointerClick,
  LayoutDashboard,
  Eye,
  Clock,
} from 'lucide-react';
import { useScanStore } from '../store/scanStore';
import ScoreGauge from '../components/Charts/ScoreGauge';
import SeverityBadge from '../components/Charts/SeverityBadge';
import ScanPlatformSwitcher from '../components/dashboard/ScanPlatformSwitcher';

type TabId = 'overview' | 'vitals' | 'player' | 'cdn' | 'raw';

const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
  { id: 'overview', label: 'Overview', icon: <LayoutDashboard className="w-3.5 h-3.5" /> },
  { id: 'vitals', label: 'Core Web Vitals', icon: <Activity className="w-3.5 h-3.5" /> },
  { id: 'player', label: 'Player Metrics', icon: <Eye className="w-3.5 h-3.5" /> },
  { id: 'cdn', label: 'CDN & Resources', icon: <Globe className="w-3.5 h-3.5" /> },
  { id: 'raw', label: 'Raw JSON', icon: <FileSearch className="w-3.5 h-3.5" /> },
];

const stagger = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.07 },
  },
};

const fadeUp = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] } },
};

const statusColorMap: Record<string, { bg: string; text: string; ring: string; bar: string }> = {
  good: {
    bg: 'rgba(34,197,94,0.08)',
    text: '#4ade80',
    ring: 'rgba(34,197,94,0.25)',
    bar: '#22c55e',
  },
  'needs-improvement': {
    bg: 'rgba(234,179,8,0.08)',
    text: '#facc15',
    ring: 'rgba(234,179,8,0.25)',
    bar: '#eab308',
  },
  poor: {
    bg: 'rgba(239,68,68,0.08)',
    text: '#f87171',
    ring: 'rgba(239,68,68,0.25)',
    bar: '#ef4444',
  },
};

function getStatusColors(status: string) {
  return statusColorMap[status] ?? statusColorMap['poor'];
}

const vitalMeta: Record<string, { icon: React.ReactNode; description: string }> = {
  lcp: { icon: <Eye className="w-4 h-4" />, description: 'Largest Contentful Paint' },
  fcp: { icon: <Zap className="w-4 h-4" />, description: 'First Contentful Paint' },
  cls: { icon: <LayoutDashboard className="w-4 h-4" />, description: 'Cumulative Layout Shift' },
  fid: { icon: <MousePointerClick className="w-4 h-4" />, description: 'First Input Delay' },
  ttfb: { icon: <Globe className="w-4 h-4" />, description: 'Time to First Byte' },
  inp: { icon: <MousePointerClick className="w-4 h-4" />, description: 'Interaction to Next Paint' },
  si: { icon: <Timer className="w-4 h-4" />, description: 'Speed Index' },
  tbt: { icon: <Clock className="w-4 h-4" />, description: 'Total Blocking Time' },
};

function EmptyState() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.5 }}
      className="flex flex-col items-center justify-center py-32 text-center"
    >
      <div
        className="rounded-2xl p-6 mb-6"
        style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid var(--border)' }}
      >
        <FileSearch className="w-12 h-12" style={{ color: 'var(--text-tertiary)' }} />
      </div>
      <h2 className="text-xl font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>
        No Performance Data
      </h2>
      <p className="max-w-md text-sm" style={{ color: 'var(--text-secondary)' }}>
        Run a verification scan first to view performance analysis results.
      </p>
    </motion.div>
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
      className="flex items-center gap-1.5 text-xs transition-colors rounded-lg px-3 py-1.5"
      style={{
        color: copied ? 'var(--accent)' : 'var(--text-secondary)',
        background: 'rgba(99,102,241,0.06)',
        border: '1px solid var(--border)',
      }}
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

function StatusIcon({ status }: { status: string }) {
  if (status === 'good')
    return <CheckCircle2 className="w-4 h-4 text-green-400" />;
  if (status === 'needs-improvement')
    return <AlertTriangle className="w-4 h-4 text-yellow-400" />;
  return <XCircle className="w-4 h-4 text-red-400" />;
}

function StatusLabel({ status }: { status: string }) {
  const colors = getStatusColors(status);
  const label = status === 'good' ? 'Good' : status === 'needs-improvement' ? 'Needs Work' : 'Poor';
  return (
    <span
      className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider"
      style={{ background: colors.bg, color: colors.text, border: `1px solid ${colors.ring}` }}
    >
      <StatusIcon status={status} />
      {label}
    </span>
  );
}

function ProgressBar({ value, target, status }: { value: number; target: number; status: string }) {
  const colors = getStatusColors(status);
  const pct = Math.min((target / Math.max(value, 0.001)) * 100, 100);
  return (
    <div className="w-full h-1.5 rounded-full overflow-hidden mt-3" style={{ background: 'rgba(99,102,241,0.06)' }}>
      <motion.div
        className="h-full rounded-full"
        style={{ background: colors.bar }}
        initial={{ width: 0 }}
        animate={{ width: `${pct}%` }}
        transition={{ duration: 0.8, ease: 'easeOut', delay: 0.3 }}
      />
    </div>
  );
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export default function Performance() {
  const { currentScan } = useScanStore();
  const [activeTab, setActiveTab] = useState<TabId>('overview');

  if (!currentScan) return <EmptyState />;

  const scan = currentScan;
  const perf = scan.performance_results ?? {};
  const perfFindings = scan.findings.filter(
    (f) =>
      f.category.toLowerCase().includes('performance') ||
      f.category.toLowerCase().includes('lighthouse') ||
      f.category.toLowerCase().includes('web vital') ||
      f.category.toLowerCase().includes('resource') ||
      f.category.toLowerCase().includes('render') ||
      f.category.toLowerCase().includes('cdn'),
  );

  return (
    <motion.div
      className="space-y-6"
      initial="hidden"
      animate="visible"
      variants={stagger}
    >
      {/* Header */}
      <motion.div variants={fadeUp} className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-3 mb-1.5">
            <div
              className="flex items-center justify-center w-9 h-9 rounded-xl"
              style={{ background: 'var(--gradient-primary, linear-gradient(135deg, #6366f1, #818cf8))' }}
            >
              <Gauge className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-xl font-bold" style={{ color: 'var(--text-primary)' }}>
                Performance Analysis
              </h1>
              <p className="text-xs mt-0.5" style={{ color: 'var(--text-secondary)' }}>
                Lighthouse, Core Web Vitals, player metrics, CDN efficiency
              </p>
            </div>
          </div>
        </div>
        <div className="flex flex-col items-end gap-2 shrink-0">
          <ScanPlatformSwitcher />
          <ScoreGauge score={scan.performance_score} label="Performance" size="sm" />
        </div>
      </motion.div>

      {/* Tabs */}
      <motion.div
        variants={fadeUp}
        className="flex gap-0.5 overflow-x-auto"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
        {tabs.map((t) => (
          <button
            key={t.id}
            onClick={() => setActiveTab(t.id)}
            className="flex items-center gap-1.5 px-4 py-2.5 text-sm font-medium whitespace-nowrap transition-all duration-200"
            style={{
              color: activeTab === t.id ? 'var(--accent)' : 'var(--text-tertiary)',
              borderBottom: activeTab === t.id ? '2px solid var(--accent)' : '2px solid transparent',
              background: activeTab === t.id ? 'rgba(99,102,241,0.06)' : 'transparent',
              borderRadius: '8px 8px 0 0',
            }}
          >
            {t.icon}
            {t.label}
          </button>
        ))}
      </motion.div>

      {activeTab === 'overview' && <OverviewTab perf={perf} />}
      {activeTab === 'vitals' && <VitalsTab perf={perf} />}
      {activeTab === 'player' && <PlayerTab />}
      {activeTab === 'cdn' && <CdnTab perf={perf} />}
      {activeTab === 'raw' && <RawTab data={perf} />}

      {/* Performance Findings */}
      {activeTab !== 'raw' && (
        <motion.div variants={fadeUp} className="card rounded-2xl p-5">
          <h3 className="text-sm font-semibold mb-4" style={{ color: 'var(--text-primary)' }}>
            Performance Findings
            <span
              className="ml-2 inline-flex items-center justify-center rounded-full px-2 py-0.5 text-[10px] font-bold"
              style={{ background: 'rgba(99,102,241,0.06)', color: 'var(--accent)' }}
            >
              {perfFindings.length}
            </span>
          </h3>
          <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
            {perfFindings.map((f, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.04 }}
                className="flex items-start gap-3 rounded-xl p-3 transition-colors"
                style={{
                  background: 'rgba(99,102,241,0.06)',
                  border: '1px solid var(--border)',
                }}
              >
                <SeverityBadge severity={f.severity} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{f.title}</p>
                    {f.auto_fixable && (
                      <span
                        className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                        style={{ background: 'rgba(34,197,94,0.12)', color: '#4ade80' }}
                      >
                        <Wrench className="w-2.5 h-2.5" /> Auto-fix
                      </span>
                    )}
                  </div>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--text-tertiary)' }}>{f.category}</p>
                </div>
              </motion.div>
            ))}
            {perfFindings.length === 0 && (
              <p className="text-sm text-center py-6" style={{ color: 'var(--text-tertiary)' }}>
                No performance findings.
              </p>
            )}
          </div>
        </motion.div>
      )}
    </motion.div>
  );
}

function OverviewTab({
  perf,
}: {
  perf: NonNullable<ReturnType<typeof useScanStore>['currentScan']>['performance_results'];
}) {
  const lh = perf.lighthouse;
  if (!lh) {
    return (
      <motion.div variants={fadeUp} className="card rounded-2xl p-8 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
        No Lighthouse data available.
      </motion.div>
    );
  }

  const scores = [
    { label: 'Performance', value: lh.performance },
    { label: 'Accessibility', value: lh.accessibility },
    { label: 'Best Practices', value: lh.best_practices },
    { label: 'SEO', value: lh.seo },
    { label: 'PWA', value: lh.pwa },
  ];

  return (
    <motion.div variants={stagger} initial="hidden" animate="visible">
      <motion.div variants={fadeUp} className="card rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-6">
          <div
            className="w-1 h-5 rounded-full"
            style={{ background: 'var(--gradient-primary, var(--accent))' }}
          />
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Lighthouse Scores
          </h3>
        </div>
        <div className="flex flex-wrap items-end justify-center gap-8">
          {scores.map((s, i) => (
            <motion.div
              key={s.label}
              initial={{ opacity: 0, scale: 0.85 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.1, duration: 0.4 }}
            >
              <ScoreGauge score={s.value} label={s.label} size="md" />
            </motion.div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
}

function VitalsTab({
  perf,
}: {
  perf: NonNullable<ReturnType<typeof useScanStore>['currentScan']>['performance_results'];
}) {
  const cwv = perf.core_web_vitals;
  if (!cwv) {
    return (
      <motion.div variants={fadeUp} className="card rounded-2xl p-8 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
        No Core Web Vitals data available.
      </motion.div>
    );
  }

  const metrics: Array<{
    key: string;
    label: string;
    data: { value: number; unit: string; target: number; status: string } | undefined;
  }> = [
    { key: 'lcp', label: 'LCP', data: cwv.lcp },
    { key: 'fcp', label: 'FCP', data: cwv.fcp },
    { key: 'cls', label: 'CLS', data: cwv.cls },
    { key: 'fid', label: 'FID', data: cwv.fid },
    { key: 'ttfb', label: 'TTFB', data: cwv.ttfb },
    { key: 'inp', label: 'INP', data: cwv.inp },
    { key: 'si', label: 'SI', data: cwv.si },
    { key: 'tbt', label: 'TBT', data: cwv.tbt },
  ];

  return (
    <motion.div variants={stagger} initial="hidden" animate="visible">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {metrics.map(
          (m) =>
            m.data && (
              <motion.div
                key={m.key}
                variants={fadeUp}
                className="card rounded-xl p-4 group hover:scale-[1.02] transition-transform duration-200"
                style={{
                  borderColor: getStatusColors(m.data.status).ring,
                }}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div
                      className="flex items-center justify-center w-7 h-7 rounded-lg"
                      style={{
                        background: getStatusColors(m.data.status).bg,
                        color: getStatusColors(m.data.status).text,
                      }}
                    >
                      {vitalMeta[m.key]?.icon ?? <Activity className="w-4 h-4" />}
                    </div>
                    <span className="text-xs font-bold tracking-wide" style={{ color: 'var(--text-secondary)' }}>
                      {m.label}
                    </span>
                  </div>
                  <StatusLabel status={m.data.status} />
                </div>

                <p className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
                  {m.data.value}
                  <span className="text-sm ml-1 font-normal" style={{ color: 'var(--text-tertiary)' }}>
                    {m.data.unit}
                  </span>
                </p>

                <p className="text-[11px] mt-1" style={{ color: 'var(--text-tertiary)' }}>
                  {vitalMeta[m.key]?.description} · Target: {m.data.target} {m.data.unit}
                </p>

                <ProgressBar value={m.data.value} target={m.data.target} status={m.data.status} />
              </motion.div>
            ),
        )}
      </div>
    </motion.div>
  );
}

function PlayerTab() {
  return (
    <motion.div variants={fadeUp} initial="hidden" animate="visible">
      <div className="card rounded-2xl p-8 text-center">
        <div
          className="inline-flex items-center justify-center w-12 h-12 rounded-xl mb-4"
          style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid var(--border)' }}
        >
          <Eye className="w-6 h-6" style={{ color: 'var(--text-tertiary)' }} />
        </div>
        <p className="text-sm max-w-sm mx-auto" style={{ color: 'var(--text-secondary)' }}>
          Player metrics will appear here when available from the scan data. Metrics include
          startup time, buffering ratio, bitrate adaptation, and error rates.
        </p>
      </div>
    </motion.div>
  );
}

function CdnTab({
  perf,
}: {
  perf: NonNullable<ReturnType<typeof useScanStore>['currentScan']>['performance_results'];
}) {
  const res = perf.resource_summary;
  if (!res) {
    return (
      <motion.div variants={fadeUp} className="card rounded-2xl p-8 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>
        No resource data available.
      </motion.div>
    );
  }

  const breakdown = [
    { name: 'JavaScript', value: res.js, color: '#eab308' },
    { name: 'CSS', value: res.css, color: '#6366f1' },
    { name: 'Images', value: res.images, color: '#22c55e' },
    { name: 'Fonts', value: res.fonts, color: '#a855f7' },
    { name: 'Other', value: res.other, color: '#6b7280' },
  ];

  return (
    <motion.div variants={stagger} initial="hidden" animate="visible" className="space-y-4">
      {/* Weight summary badges */}
      <motion.div variants={fadeUp} className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        {breakdown.map((b) => (
          <div
            key={b.name}
            className="card rounded-xl p-3 flex flex-col items-center gap-1"
          >
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: b.color }} />
            <span className="text-[11px] font-medium" style={{ color: 'var(--text-secondary)' }}>
              {b.name}
            </span>
            <span className="text-sm font-bold" style={{ color: 'var(--text-primary)' }}>
              {formatBytes(b.value)}
            </span>
          </div>
        ))}
      </motion.div>

      {/* Chart */}
      <motion.div variants={fadeUp} className="card rounded-2xl p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <div
              className="w-1 h-5 rounded-full"
              style={{ background: 'var(--gradient-primary, var(--accent))' }}
            />
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
              Total Page Weight
            </h3>
          </div>
          <span className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            {formatBytes(res.total_weight)}
          </span>
        </div>
        <ResponsiveContainer width="100%" height={240}>
          <BarChart data={breakdown} layout="vertical" margin={{ left: 70 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" horizontal={false} />
            <XAxis
              type="number"
              tick={{ fill: 'var(--text-tertiary)', fontSize: 11 }}
              axisLine={{ stroke: 'var(--border)' }}
              tickLine={false}
              tickFormatter={(v: number) => formatBytes(v)}
            />
            <YAxis
              type="category"
              dataKey="name"
              tick={{ fill: 'var(--text-secondary)', fontSize: 12 }}
              axisLine={false}
              tickLine={false}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: 'var(--bg-card)',
                border: '1px solid var(--border-strong)',
                borderRadius: 12,
                fontSize: 12,
                color: 'var(--text-primary)',
              }}
              formatter={(value: number) => [formatBytes(value), 'Size']}
            />
            <Bar dataKey="value" radius={[0, 6, 6, 0]} maxBarSize={24}>
              {breakdown.map((b) => (
                <Cell key={b.name} fill={b.color} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </motion.div>
    </motion.div>
  );
}

function RawTab({ data }: { data: unknown }) {
  const json = JSON.stringify(data, null, 2);
  return (
    <motion.div variants={fadeUp} initial="hidden" animate="visible">
      <div className="card rounded-2xl p-5">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Raw Performance Data
          </h3>
          <CopyJsonButton json={json} />
        </div>
        <pre
          className="text-xs font-mono overflow-auto max-h-[600px] whitespace-pre-wrap leading-relaxed rounded-xl p-4"
          style={{
            color: 'var(--text-secondary)',
            background: 'rgba(99,102,241,0.06)',
            border: '1px solid var(--border)',
          }}
        >
          {json}
        </pre>
      </div>
    </motion.div>
  );
}
