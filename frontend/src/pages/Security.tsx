import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import {
  Shield,
  Lock,
  Unlock,
  CheckCircle2,
  XCircle,
  Copy,
  Check,
  FileSearch,
} from 'lucide-react';
import { useScanStore } from '../store/scanStore';
import type { Finding } from '../store/scanStore';
import ScoreGauge from '../components/Charts/ScoreGauge';
import SeverityBadge from '../components/Charts/SeverityBadge';

type TabId = 'overview' | 'owasp' | 'cve' | 'api' | 'raw';

const tabs: { id: TabId; label: string }[] = [
  { id: 'overview', label: 'Overview' },
  { id: 'owasp', label: 'OWASP Grid' },
  { id: 'cve', label: 'CVE / Dependencies' },
  { id: 'api', label: 'API Exposure' },
  { id: 'raw', label: 'Raw JSON' },
];

const fadeIn = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, ease: 'easeOut' },
};

function EmptyState() {
  return (
    <motion.div
      {...fadeIn}
      className="flex flex-col items-center justify-center py-32 text-center"
    >
      <div
        className="rounded-full p-6 mb-6"
        style={{ background: 'rgba(99,102,241,0.06)' }}
      >
        <FileSearch className="w-12 h-12 text-[var(--text-tertiary)]" />
      </div>
      <h2 className="text-xl font-semibold text-[var(--text-primary)] mb-2">No Security Data</h2>
      <p className="text-[var(--text-secondary)] max-w-md">
        Run a verification scan first to view security analysis results.
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
    <div
      className="rounded-xl p-4"
      style={{ background: 'rgba(99,102,241,0.04)', border: '1px solid var(--border)' }}
    >
      <p className="text-xs text-[var(--text-tertiary)] mb-1">{label}</p>
      <p className={`text-2xl font-bold ${color ?? 'text-[var(--text-primary)]'}`}>{value}</p>
    </div>
  );
}

function StatusCard({
  label,
  ok,
}: {
  label: string;
  ok: boolean;
}) {
  return (
    <div
      className="flex items-center gap-3 rounded-xl p-4"
      style={{ background: 'rgba(99,102,241,0.04)', border: '1px solid var(--border)' }}
    >
      {ok ? (
        <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />
      ) : (
        <XCircle className="w-5 h-5 text-red-400 shrink-0" />
      )}
      <div>
        <p className="text-sm text-[var(--text-primary)]">{label}</p>
        <p className={`text-xs font-medium ${ok ? 'text-green-400' : 'text-red-400'}`}>
          {ok ? 'Protected' : 'Not Protected'}
        </p>
      </div>
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
      style={{ background: 'rgba(99,102,241,0.06)', border: '1px solid var(--border)' }}
    >
      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
      {copied ? 'Copied' : 'Copy'}
    </button>
  );
}

export default function Security() {
  const { currentScan } = useScanStore();
  const [activeTab, setActiveTab] = useState<TabId>('overview');
  const [severityFilter, setSeverityFilter] = useState<string>('all');

  if (!currentScan) return <EmptyState />;

  const scan = currentScan;
  const sec = scan.security_results ?? {};
  const secFindings = scan.findings.filter(
    (f) => f.category.toLowerCase().includes('security') || f.category.toLowerCase().includes('owasp'),
  );
  const filtered =
    severityFilter === 'all'
      ? secFindings
      : secFindings.filter((f) => f.severity === severityFilter);

  const sslGrade = sec.ssl_grade ?? '—';
  const headersScore = sec.headers_score ?? 0;
  const missingHeaders = sec.missing_headers?.length ?? 0;
  const corsIssues = sec.cors_issues?.length ?? 0;
  const tokenLeaks = sec.token_leaks?.length ?? 0;
  const depVulns = sec.dependency_vulnerabilities?.length ?? 0;
  const drm = sec.drm_protection;

  return (
    <motion.div {...fadeIn} className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Shield className="w-5 h-5 text-[var(--accent)]" />
            <h1 className="text-xl font-bold gradient-text">Security Analysis</h1>
          </div>
          <p className="text-sm text-[var(--text-secondary)]">
            OWASP Top 10, API exposure, DRM, tokens, dependencies
          </p>
        </div>
        <ScoreGauge score={scan.security_score} label="Security" size="sm" />
      </div>

      {/* Tabs */}
      <div
        className="flex gap-1 overflow-x-auto"
        style={{ borderBottom: '1px solid var(--border)' }}
      >
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

      {/* Tab Content */}
      {activeTab === 'overview' && (
        <OverviewTab
          sslGrade={sslGrade}
          headersScore={headersScore}
          missingHeaders={missingHeaders}
          corsIssues={corsIssues}
          tokenLeaks={tokenLeaks}
          depVulns={depVulns}
          drm={drm}
          findings={filtered}
          severityFilter={severityFilter}
          onFilterChange={setSeverityFilter}
        />
      )}
      {activeTab === 'owasp' && <OwaspTab owasp={sec.owasp_mapping} />}
      {activeTab === 'cve' && <CveTab vulns={sec.dependency_vulnerabilities} />}
      {activeTab === 'api' && <ApiTab endpoints={sec.api_endpoints} />}
      {activeTab === 'raw' && <RawTab data={sec} />}
    </motion.div>
  );
}

function OverviewTab({
  sslGrade,
  headersScore,
  missingHeaders,
  corsIssues,
  tokenLeaks,
  depVulns,
  drm,
  findings,
  severityFilter,
  onFilterChange,
}: {
  sslGrade: string;
  headersScore: number;
  missingHeaders: number;
  corsIssues: number;
  tokenLeaks: number;
  depVulns: number;
  drm?: { widevine: boolean; fairplay: boolean; key_rotation: boolean; license_url_safe: boolean };
  findings: Finding[];
  severityFilter: string;
  onFilterChange: (v: string) => void;
}) {
  const gradeColor =
    sslGrade === 'A' || sslGrade === 'A+'
      ? 'text-green-400'
      : sslGrade === 'B'
        ? 'text-yellow-400'
        : 'text-red-400';

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.3 }}
      className="space-y-6"
    >
      {/* Metric Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <MetricCard label="SSL Grade" value={sslGrade} color={gradeColor} />
        <MetricCard
          label="Headers Score"
          value={`${headersScore}%`}
          color={headersScore >= 80 ? 'text-green-400' : 'text-orange-400'}
        />
        <MetricCard label="Missing Headers" value={missingHeaders} color={missingHeaders > 0 ? 'text-orange-400' : 'text-green-400'} />
        <MetricCard label="CORS Issues" value={corsIssues} color={corsIssues > 0 ? 'text-red-400' : 'text-green-400'} />
        <MetricCard label="Token Leaks" value={tokenLeaks} color={tokenLeaks > 0 ? 'text-red-400' : 'text-green-400'} />
        <MetricCard label="Dep. Vulns" value={depVulns} color={depVulns > 0 ? 'text-orange-400' : 'text-green-400'} />
      </div>

      {/* DRM Protection */}
      {drm && (
        <div className="card rounded-xl p-5">
          <h3 className="text-sm font-semibold text-[var(--text-primary)] mb-4">DRM Protection Status</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <StatusCard label="Widevine" ok={drm.widevine} />
            <StatusCard label="FairPlay" ok={drm.fairplay} />
            <StatusCard label="Key Rotation" ok={drm.key_rotation} />
            <StatusCard label="License URL Safe" ok={drm.license_url_safe} />
          </div>
        </div>
      )}

      {/* Findings */}
      <div className="card rounded-xl p-5">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-[var(--text-primary)]">
            Security Findings ({findings.length})
          </h3>
          <select
            value={severityFilter}
            onChange={(e) => onFilterChange(e.target.value)}
            className="rounded-lg px-3 py-1.5 text-xs text-[var(--text-secondary)] focus:outline-none focus:ring-1 focus:ring-[var(--accent)]"
            style={{
              background: 'rgba(99,102,241,0.04)',
              border: '1px solid var(--border)',
              boxShadow: 'var(--shadow-elevated)',
            }}
          >
            <option value="all">All Severities</option>
            <option value="CRITICAL">Critical</option>
            <option value="HIGH">High</option>
            <option value="MEDIUM">Medium</option>
            <option value="LOW">Low</option>
            <option value="INFO">Info</option>
          </select>
        </div>
        <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
          {findings.map((f, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.03, duration: 0.25 }}
              className="flex items-start gap-3 rounded-lg p-3"
              style={{ background: 'rgba(99,102,241,0.04)', border: '1px solid var(--border)' }}
            >
              <SeverityBadge severity={f.severity} />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-[var(--text-primary)]">{f.title}</p>
                <p className="text-xs text-[var(--text-tertiary)] mt-0.5">{f.category}</p>
              </div>
            </motion.div>
          ))}
          {findings.length === 0 && (
            <p className="text-[var(--text-tertiary)] text-sm text-center py-6">No findings match the filter.</p>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function OwaspTab({
  owasp,
}: {
  owasp?: Array<{ category: string; id: string; findings: Finding[] }>;
}) {
  if (!owasp || owasp.length === 0) {
    return (
      <div
        className="card rounded-xl p-8 text-center text-[var(--text-tertiary)] text-sm"
      >
        No OWASP mapping data available.
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }} className="space-y-4">
      <div className="card rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr
              className="text-left text-xs text-[var(--text-tertiary)]"
              style={{ background: 'rgba(99,102,241,0.06)', borderBottom: '1px solid var(--border)' }}
            >
              <th className="p-3 w-24">ID</th>
              <th className="p-3">Category</th>
              <th className="p-3 w-20 text-center">Findings</th>
              <th className="p-3">Details</th>
            </tr>
          </thead>
          <tbody>
            {owasp.map((entry) => (
              <tr
                key={entry.id}
                className="transition-colors"
                style={{ borderBottom: '1px solid var(--border)' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(99,102,241,0.06)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <td className="p-3 text-[var(--accent)] font-mono text-xs">{entry.id}</td>
                <td className="p-3 text-[var(--text-primary)]">{entry.category}</td>
                <td className="p-3 text-center">
                  <span
                    className={`inline-flex items-center justify-center w-6 h-6 rounded-full text-xs font-bold ${
                      entry.findings.length > 0
                        ? 'bg-red-500/20 text-red-400'
                        : 'bg-green-500/20 text-green-400'
                    }`}
                  >
                    {entry.findings.length}
                  </span>
                </td>
                <td className="p-3">
                  {entry.findings.length > 0 ? (
                    <div className="flex flex-wrap gap-1">
                      {entry.findings.slice(0, 3).map((f, i) => (
                        <SeverityBadge key={i} severity={f.severity} />
                      ))}
                      {entry.findings.length > 3 && (
                        <span className="text-xs text-[var(--text-tertiary)]">
                          +{entry.findings.length - 3} more
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="text-xs text-green-400">No issues</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}

function CveTab({
  vulns,
}: {
  vulns?: Array<{
    package: string;
    severity: string;
    version: string;
    fixed_version?: string;
    cve?: string;
  }>;
}) {
  if (!vulns || vulns.length === 0) {
    return (
      <div
        className="card rounded-xl p-8 text-center text-[var(--text-tertiary)] text-sm"
      >
        No dependency vulnerabilities found.
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
      <div className="card rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr
              className="text-left text-xs text-[var(--text-tertiary)]"
              style={{ background: 'rgba(99,102,241,0.06)', borderBottom: '1px solid var(--border)' }}
            >
              <th className="p-3">Package</th>
              <th className="p-3">CVE</th>
              <th className="p-3">Severity</th>
              <th className="p-3">Version</th>
              <th className="p-3">Fix Available</th>
            </tr>
          </thead>
          <tbody>
            {vulns.map((v, i) => (
              <tr
                key={i}
                className="transition-colors"
                style={{ borderBottom: '1px solid var(--border)' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(99,102,241,0.06)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <td className="p-3 text-[var(--text-primary)] font-mono text-xs">{v.package}</td>
                <td className="p-3 text-[var(--accent)] font-mono text-xs">
                  {v.cve ?? '—'}
                </td>
                <td className="p-3">
                  <SeverityBadge
                    severity={
                      (v.severity.toUpperCase() as 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO') ??
                      'INFO'
                    }
                  />
                </td>
                <td className="p-3 text-[var(--text-secondary)] font-mono text-xs">{v.version}</td>
                <td className="p-3">
                  {v.fixed_version ? (
                    <span className="text-green-400 font-mono text-xs">
                      {v.fixed_version}
                    </span>
                  ) : (
                    <span className="text-[var(--text-tertiary)] text-xs">None</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </motion.div>
  );
}

function ApiTab({
  endpoints,
}: {
  endpoints?: Array<{
    url: string;
    method: string;
    authenticated: boolean;
    description?: string;
  }>;
}) {
  const sorted = useMemo(
    () =>
      [...(endpoints ?? [])].sort((a, b) =>
        a.authenticated === b.authenticated ? 0 : a.authenticated ? 1 : -1,
      ),
    [endpoints],
  );

  if (sorted.length === 0) {
    return (
      <div
        className="card rounded-xl p-8 text-center text-[var(--text-tertiary)] text-sm"
      >
        No API endpoints discovered.
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
      <div className="card rounded-xl overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr
              className="text-left text-xs text-[var(--text-tertiary)]"
              style={{ background: 'rgba(99,102,241,0.06)', borderBottom: '1px solid var(--border)' }}
            >
              <th className="p-3 w-20">Method</th>
              <th className="p-3">Endpoint</th>
              <th className="p-3 w-32">Auth Status</th>
              <th className="p-3">Description</th>
            </tr>
          </thead>
          <tbody>
            {sorted.map((ep, i) => (
              <tr
                key={i}
                className="transition-colors"
                style={{ borderBottom: '1px solid var(--border)' }}
                onMouseEnter={(e) => (e.currentTarget.style.background = 'rgba(99,102,241,0.06)')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                <td className="p-3">
                  <span
                    className="inline-flex items-center rounded px-2 py-0.5 text-xs font-mono font-bold text-[var(--accent)]"
                    style={{ background: 'rgba(99,102,241,0.15)' }}
                  >
                    {ep.method}
                  </span>
                </td>
                <td className="p-3 text-[var(--text-primary)] font-mono text-xs break-all">
                  {ep.url}
                </td>
                <td className="p-3">
                  <span
                    className={`inline-flex items-center gap-1.5 text-xs font-medium ${
                      ep.authenticated ? 'text-green-400' : 'text-red-400'
                    }`}
                  >
                    {ep.authenticated ? (
                      <Lock className="w-3 h-3" />
                    ) : (
                      <Unlock className="w-3 h-3" />
                    )}
                    {ep.authenticated ? 'Authenticated' : 'Unauthenticated'}
                  </span>
                </td>
                <td className="p-3 text-[var(--text-secondary)] text-xs">{ep.description ?? '—'}</td>
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
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.3 }}>
      <div className="card rounded-xl p-5">
        <div className="flex justify-end mb-3">
          <CopyJsonButton json={json} />
        </div>
        <pre
          className="text-xs text-[var(--text-secondary)] font-mono overflow-auto max-h-[600px] whitespace-pre-wrap leading-relaxed rounded-lg p-4"
          style={{ background: 'rgba(99,102,241,0.04)', border: '1px solid var(--border)' }}
        >
          {json}
        </pre>
      </div>
    </motion.div>
  );
}
