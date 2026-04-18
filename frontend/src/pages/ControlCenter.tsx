import { useState, useEffect, useCallback, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Play, Calendar, Gauge, Bell, Link2,
  Monitor, Smartphone, Shield, Zap, Code2,
  RefreshCw, Square, ChevronDown, Loader2,
  Clock, CheckCircle2, AlertCircle, Activity,
  Globe, Hash, Lock,
} from 'lucide-react';
import clsx from 'clsx';
import { useScanStore, type BrowserScanOptionsPayload } from '../store/scanStore';
import { api } from '../utils/api';
import { formatDistanceToNow } from 'date-fns';

type NavTab = 'run-scan' | 'schedule' | 'thresholds' | 'notifications' | 'webhooks';
type InputMode = 'single' | 'multiple' | 'source';
type Platform = 'desktop' | 'mweb' | 'both';

interface ScheduleConfig {
  cron: string;
  timezone: string;
  enabled: boolean;
}

interface ThresholdConfig {
  overall: number;
  security: number;
  performance: number;
  code_quality: number;
}

interface NotifConfig {
  slack: boolean;
  email: boolean;
  jira: boolean;
}

interface WebhookLog {
  time: string;
  event: string;
  source: string;
  status: 'success' | 'error' | 'pending';
}

const NAV_ITEMS: { id: NavTab; label: string; icon: typeof Play }[] = [
  { id: 'run-scan', label: 'Run Scan', icon: Play },
  { id: 'schedule', label: 'Schedule', icon: Calendar },
  { id: 'thresholds', label: 'KPI Thresholds', icon: Gauge },
  { id: 'notifications', label: 'Notifications', icon: Bell },
  { id: 'webhooks', label: 'Webhook Logs', icon: Link2 },
];

const OTT_SITES = [
  { label: 'JioCinema', url: 'https://www.jiocinema.com' },
  { label: 'Hotstar', url: 'https://www.hotstar.com' },
  { label: 'SonyLIV', url: 'https://www.sonyliv.com' },
  { label: 'ZEE5', url: 'https://www.zee5.com' },
  { label: 'MX Player', url: 'https://www.mxplayer.in' },
  { label: 'Voot', url: 'https://www.voot.com' },
  { label: 'ALTBalaji', url: 'https://www.altbalaji.com' },
  { label: 'Eros Now', url: 'https://www.erosnow.com' },
];

const TIMEZONES = [
  'Asia/Kolkata', 'UTC', 'America/New_York', 'America/Los_Angeles',
  'Europe/London', 'Europe/Berlin', 'Asia/Tokyo', 'Asia/Singapore',
];

const AGENTS = [
  { id: 'security', label: 'Security', icon: Shield, color: 'text-red-400 bg-red-400/10 border-red-400/30', glow: 'shadow-[0_0_15px_rgba(248,113,113,0.2)]' },
  { id: 'performance', label: 'Performance', icon: Zap, color: 'text-emerald-400 bg-emerald-400/10 border-emerald-400/30', glow: 'shadow-[0_0_15px_rgba(52,211,153,0.2)]' },
  { id: 'code_quality', label: 'Code Quality', icon: Code2, color: 'text-purple-400 bg-purple-400/10 border-purple-400/30', glow: 'shadow-[0_0_15px_rgba(192,132,252,0.2)]' },
];

function Toggle({ enabled, onChange }: { enabled: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={enabled}
      onClick={() => onChange(!enabled)}
      className={clsx(
        'relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors',
        enabled ? 'bg-[var(--accent)]' : 'bg-[rgba(99,102,241,0.12)]'
      )}
    >
      <span className={clsx(
        'pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg transition-transform',
        enabled ? 'translate-x-5' : 'translate-x-0'
      )} />
    </button>
  );
}

export default function ControlCenter() {
  const [activeTab, setActiveTab] = useState<NavTab>('run-scan');

  // Run Scan state
  const [inputMode, setInputMode] = useState<InputMode>('single');
  const [url, setUrl] = useState('');
  const [multiUrls, setMultiUrls] = useState('');
  const [sourceCode, setSourceCode] = useState('');
  const [platform, setPlatform] = useState<Platform>('desktop');
  const [selectedAgents, setSelectedAgents] = useState<string[]>(['security', 'performance', 'code_quality']);
  const [showOttDropdown, setShowOttDropdown] = useState(false);
  const ottRef = useRef<HTMLDivElement>(null);

  const [browserAdvancedOpen, setBrowserAdvancedOpen] = useState(false);
  const [useBrowser, setUseBrowser] = useState(true);
  const [headless, setHeadless] = useState(true);
  const [loginEnabled, setLoginEnabled] = useState(false);
  const [loginUrl, setLoginUrl] = useState('');
  const [loginUser, setLoginUser] = useState('');
  const [loginPass, setLoginPass] = useState('');
  const [emailSelector, setEmailSelector] = useState('');
  const [passwordSelector, setPasswordSelector] = useState('');
  const [submitSelector, setSubmitSelector] = useState('');
  const [postLoginWaitMs, setPostLoginWaitMs] = useState(2000);

  // Schedule state
  const [schedule, setSchedule] = useState<ScheduleConfig>({ cron: '0 2 * * *', timezone: 'Asia/Kolkata', enabled: false });

  // Thresholds state
  const [thresholds, setThresholds] = useState<ThresholdConfig>({ overall: 95, security: 90, performance: 95, code_quality: 85 });

  // Notifications state
  const [notifConfig, setNotifConfig] = useState<NotifConfig>({ slack: false, email: false, jira: false });

  // Webhook state
  const [webhookLogs, setWebhookLogs] = useState<WebhookLog[]>([]);
  const [webhooksLoading, setWebhooksLoading] = useState(false);

  // System state
  const [uptime, setUptime] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  const { startScan, scanning, currentScan, abortScan, scans, loadScans, pollScan } = useScanStore();
  const scanError = useScanStore((s) => s.error);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    loadScans();
    api.get<{ uptime_hours: number }>('/system/status').then(d => setUptime(d.uptime_hours)).catch(() => setUptime(null));
    api.get<ScheduleConfig>('/config/schedule').then(setSchedule).catch(() => {});
    api.get<ThresholdConfig>('/config/thresholds').then(setThresholds).catch(() => {});
    api.get<NotifConfig>('/config/notifications').then(setNotifConfig).catch(() => {});
  }, [loadScans]);

  useEffect(() => {
    if (scanning && currentScan) {
      pollRef.current = setInterval(() => { pollScan(currentScan.scan_id); }, 3000);
    } else if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    return () => { if (pollRef.current) clearInterval(pollRef.current); };
  }, [scanning, currentScan, pollScan]);

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ottRef.current && !ottRef.current.contains(e.target as Node)) setShowOttDropdown(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const toggleAgent = useCallback((id: string) => {
    setSelectedAgents(prev => prev.includes(id) ? prev.filter(a => a !== id) : [...prev, id]);
  }, []);

  const buildBrowserOptions = useCallback((): BrowserScanOptionsPayload => {
    const login: BrowserScanOptionsPayload['login'] = loginEnabled
      ? {
          enabled: true,
          ...(loginUrl.trim() ? { login_url: loginUrl.trim() } : {}),
          ...(loginUser.trim() ? { username: loginUser.trim() } : {}),
          ...(loginPass ? { password: loginPass } : {}),
          ...(emailSelector.trim() ? { email_selector: emailSelector.trim() } : {}),
          ...(passwordSelector.trim() ? { password_selector: passwordSelector.trim() } : {}),
          ...(submitSelector.trim() ? { submit_selector: submitSelector.trim() } : {}),
          post_login_wait_ms: postLoginWaitMs,
        }
      : { enabled: false };
    return {
      use_browser: useBrowser,
      headless,
      login,
    };
  }, [
    useBrowser,
    headless,
    loginEnabled,
    loginUrl,
    loginUser,
    loginPass,
    emailSelector,
    passwordSelector,
    submitSelector,
    postLoginWaitMs,
  ]);

  const handleRunScan = useCallback(async () => {
    const target = inputMode === 'single' ? url : inputMode === 'multiple' ? multiUrls : sourceCode;
    if (!target.trim() || selectedAgents.length === 0) return;
    try {
      const scanId = await startScan(target, platform, selectedAgents, buildBrowserOptions());
      pollScan(scanId);
    } catch { /* handled by store */ }
  }, [
    inputMode,
    url,
    multiUrls,
    sourceCode,
    platform,
    selectedAgents,
    startScan,
    pollScan,
    buildBrowserOptions,
  ]);

  const handleAbort = useCallback(async () => {
    if (currentScan) await abortScan(currentScan.scan_id);
  }, [currentScan, abortScan]);

  const handleSave = useCallback(async (endpoint: string, data: unknown) => {
    setSaving(true);
    try { await api.post(endpoint, data); } catch { /* silent */ } finally { setSaving(false); }
  }, []);

  const loadWebhooks = useCallback(async () => {
    setWebhooksLoading(true);
    try {
      const data = await api.get<{ logs: WebhookLog[] }>('/webhooks/logs');
      setWebhookLogs(data.logs);
    } catch { setWebhookLogs([]); } finally { setWebhooksLoading(false); }
  }, []);

  useEffect(() => {
    if (activeTab === 'webhooks') loadWebhooks();
  }, [activeTab, loadWebhooks]);

  const getAgentStatus = (agentId: string) => {
    if (!currentScan) return 'queued';
    const resultsKey = (
      agentId === 'code_quality' ? 'code_quality_results' : `${agentId}_results`
    ) as keyof typeof currentScan;
    const scoreKey = `${agentId}_score` as keyof typeof currentScan;
    const score = currentScan[scoreKey];
    const hasResult = currentScan[resultsKey] != null;
    const terminal = currentScan.status === 'completed' || currentScan.status === 'failed' || currentScan.status === 'aborted';
    if (score !== null && score !== undefined) return 'done';
    if (terminal && hasResult) return 'done';
    if (terminal) return 'queued';
    if (!scanning) return 'queued';
    const idx = selectedAgents.indexOf(agentId);
    const prevAgent = idx > 0 ? selectedAgents[idx - 1] : null;
    if (prevAgent) {
      const prevScore = currentScan[`${prevAgent}_score` as keyof typeof currentScan];
      const prevResKey = (
        prevAgent === 'code_quality' ? 'code_quality_results' : `${prevAgent}_results`
      ) as keyof typeof currentScan;
      const prevDone =
        (prevScore !== null && prevScore !== undefined) || currentScan[prevResKey] != null;
      if (prevDone) return 'running';
    }
    if (idx === 0) return 'running';
    return 'queued';
  };

  const recentScans = scans.slice(0, 8);
  const panelVariants = { hidden: { opacity: 0, x: 20 }, visible: { opacity: 1, x: 0 }, exit: { opacity: 0, x: -20 } };

  return (
    <div className="min-h-0 bg-[var(--bg-primary)] text-[var(--text-primary)]">
      {/* Header */}
      <div className="border-b border-[var(--border)] px-6 py-5">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-[var(--text-primary)]">Control Center</h1>
            <p className="mt-1 text-sm text-[var(--text-secondary)]">Scan management, scheduling, configuration, and integrations</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2 rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-1.5">
              <Activity className="h-4 w-4 text-emerald-400" />
              <span className="text-sm font-medium text-emerald-400">System Online</span>
            </div>
            {uptime !== null && (
              <div className="flex items-center gap-1.5 text-sm text-[var(--text-secondary)]">
                <Clock className="h-3.5 w-3.5" />
                <span>Uptime: {uptime}h</span>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="mx-auto flex max-w-7xl gap-6 p-6">
        {/* Sidebar */}
        <nav className="w-56 shrink-0 space-y-1">
          {NAV_ITEMS.map(item => (
            <button
              key={item.id}
              onClick={() => setActiveTab(item.id)}
              className={clsx(
                'flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
                activeTab === item.id
                  ? 'bg-gradient-to-r from-[#6366f1] via-[#8b5cf6] to-[#a855f7] text-white shadow-lg shadow-indigo-500/20'
                  : 'text-[var(--text-secondary)] hover:bg-white/[0.03] hover:text-[var(--text-primary)]'
              )}
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </button>
          ))}
        </nav>

        {/* Main panel */}
        <div className="min-w-0 flex-1">
          <AnimatePresence mode="wait">
            {/* ── Run Scan ── */}
            {activeTab === 'run-scan' && (
              <motion.div key="run-scan" variants={panelVariants} initial="hidden" animate="visible" exit="exit" transition={{ duration: 0.2 }} className="space-y-5">
                {/* Scan Target */}
                <div className="card rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
                  <h3 className="mb-4 text-lg font-semibold text-[var(--text-primary)]">Scan Target</h3>
                  <div className="mb-4 flex gap-1 rounded-lg bg-[rgba(99,102,241,0.06)] p-1">
                    {(['single', 'multiple', 'source'] as const).map(mode => (
                      <button
                        key={mode}
                        onClick={() => setInputMode(mode)}
                        className={clsx(
                          'flex-1 rounded-md px-3 py-1.5 text-sm font-medium transition-colors',
                          inputMode === mode ? 'bg-[var(--bg-card)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                        )}
                      >
                        {mode === 'single' ? 'Single URL' : mode === 'multiple' ? 'Multiple URLs' : 'Source Code'}
                      </button>
                    ))}
                  </div>

                  {inputMode === 'single' && (
                    <div className="flex gap-2">
                      <div className="relative flex-1">
                        <Globe className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
                        <input
                          value={url}
                          onChange={e => setUrl(e.target.value)}
                          placeholder="https://example.com"
                          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] py-2.5 pl-10 pr-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] transition-colors"
                        />
                      </div>
                      <div ref={ottRef} className="relative">
                        <button
                          onClick={() => setShowOttDropdown(!showOttDropdown)}
                          className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2.5 text-sm text-[var(--text-secondary)] hover:border-[var(--accent)] transition-colors"
                        >
                          OTT Sites
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                        {showOttDropdown && (
                          <div className="absolute right-0 z-20 mt-1 w-56 rounded-xl border border-[var(--border-strong)] bg-[var(--bg-card)] py-1 shadow-2xl shadow-black/40">
                            {OTT_SITES.map(s => (
                              <button
                                key={s.url}
                                onClick={() => { setUrl(s.url); setShowOttDropdown(false); }}
                                className="w-full px-3 py-2 text-left text-sm text-[var(--text-secondary)] hover:bg-[rgba(99,102,241,0.06)] transition-colors"
                              >
                                <div className="font-medium text-[var(--text-primary)]">{s.label}</div>
                                <div className="truncate text-xs text-[var(--text-tertiary)]">{s.url}</div>
                              </button>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                  )}

                  {inputMode === 'multiple' && (
                    <textarea
                      value={multiUrls}
                      onChange={e => setMultiUrls(e.target.value)}
                      placeholder="Enter one URL per line..."
                      rows={5}
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-3 text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] transition-colors"
                    />
                  )}

                  {inputMode === 'source' && (
                    <textarea
                      value={sourceCode}
                      onChange={e => setSourceCode(e.target.value)}
                      placeholder="Paste source code or HTML to analyze..."
                      rows={8}
                      className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] p-3 font-mono text-sm text-[var(--text-primary)] placeholder-[var(--text-tertiary)] outline-none focus:border-[var(--accent)] transition-colors"
                    />
                  )}
                </div>

                {/* Platform */}
                <div className="card rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
                  <h3 className="mb-3 text-sm font-semibold text-[var(--text-secondary)]">Platform</h3>
                  <div className="flex gap-2">
                    {([
                      { id: 'desktop' as const, label: 'Desktop', icon: Monitor },
                      { id: 'mweb' as const, label: 'mWeb', icon: Smartphone },
                      { id: 'both' as const, label: 'Both', icon: Monitor },
                    ]).map(p => (
                      <button
                        key={p.id}
                        onClick={() => setPlatform(p.id)}
                        className={clsx(
                          'flex items-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-all',
                          platform === p.id
                            ? 'border-[var(--accent)] bg-[rgba(99,102,241,0.1)] text-[var(--accent)]'
                            : 'border-[var(--border)] text-[var(--text-secondary)] hover:border-[var(--border-strong)]'
                        )}
                      >
                        <p.icon className="h-4 w-4" />
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Agents */}
                <div className="card rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
                  <h3 className="mb-3 text-sm font-semibold text-[var(--text-secondary)]">Agents</h3>
                  <div className="flex flex-wrap gap-2">
                    {AGENTS.map(a => (
                      <button
                        key={a.id}
                        onClick={() => toggleAgent(a.id)}
                        className={clsx(
                          'flex items-center gap-2 rounded-full border px-4 py-1.5 text-sm font-medium transition-all',
                          selectedAgents.includes(a.id)
                            ? `${a.color} ${a.glow}`
                            : 'border-[var(--border)] text-[var(--text-tertiary)]'
                        )}
                      >
                        <a.icon className="h-3.5 w-3.5" />
                        {a.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Chromium capture + optional login (Playwright) */}
                <div className="card rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
                  <button
                    type="button"
                    onClick={() => setBrowserAdvancedOpen(o => !o)}
                    className="flex w-full items-center justify-between gap-3 text-left"
                  >
                    <div>
                      <h3 className="text-sm font-semibold text-[var(--text-primary)]">Browser capture & login</h3>
                      <p className="mt-0.5 text-xs text-[var(--text-tertiary)]">
                        Real Chromium metrics (Core Web Vitals, transfer sizes). Optional login before scanning the target URL.
                      </p>
                    </div>
                    <ChevronDown className={clsx('h-5 w-5 shrink-0 text-[var(--text-tertiary)] transition-transform', browserAdvancedOpen && 'rotate-180')} />
                  </button>
                  {browserAdvancedOpen && (
                    <div className="mt-4 space-y-4 border-t border-[var(--border)] pt-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-[var(--text-primary)]">Use Chromium capture</p>
                          <p className="text-xs text-[var(--text-tertiary)]">Turn off to scan with HTTP-only fallbacks (faster, less accurate vitals).</p>
                        </div>
                        <Toggle enabled={useBrowser} onChange={setUseBrowser} />
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-medium text-[var(--text-primary)]">Headless</p>
                          <p className="text-xs text-[var(--text-tertiary)]">Uncheck for debugging on a machine with a display (still uses Playwright).</p>
                        </div>
                        <Toggle enabled={headless} onChange={setHeadless} />
                      </div>
                      <div className="rounded-lg border border-[var(--border)] bg-[rgba(99,102,241,0.04)] p-4">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                          <div className="flex items-center gap-2">
                            <Lock className="h-4 w-4 text-[var(--text-secondary)]" />
                            <span className="text-sm font-medium text-[var(--text-primary)]">Logged-in flow</span>
                          </div>
                          <Toggle enabled={loginEnabled} onChange={setLoginEnabled} />
                        </div>
                        {loginEnabled && (
                          <div className="grid gap-3 sm:grid-cols-2">
                            <div className="sm:col-span-2">
                              <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Login page URL (optional)</label>
                              <input
                                value={loginUrl}
                                onChange={e => setLoginUrl(e.target.value)}
                                placeholder="Defaults to scan target if empty"
                                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Username or email</label>
                              <input
                                value={loginUser}
                                onChange={e => setLoginUser(e.target.value)}
                                autoComplete="username"
                                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Password</label>
                              <input
                                type="password"
                                value={loginPass}
                                onChange={e => setLoginPass(e.target.value)}
                                autoComplete="current-password"
                                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Email field selector (optional)</label>
                              <input
                                value={emailSelector}
                                onChange={e => setEmailSelector(e.target.value)}
                                placeholder='e.g. input[name="email"]'
                                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Password field selector (optional)</label>
                              <input
                                value={passwordSelector}
                                onChange={e => setPasswordSelector(e.target.value)}
                                placeholder="CSS selector"
                                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                              />
                            </div>
                            <div className="sm:col-span-2">
                              <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Submit control selector (optional)</label>
                              <input
                                value={submitSelector}
                                onChange={e => setSubmitSelector(e.target.value)}
                                placeholder="e.g. button[type=submit]"
                                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 font-mono text-xs text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-xs font-medium text-[var(--text-secondary)]">Wait after login (ms)</label>
                              <input
                                type="number"
                                min={0}
                                step={500}
                                value={postLoginWaitMs}
                                onChange={e => setPostLoginWaitMs(Number(e.target.value) || 0)}
                                className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)]"
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Run / Progress */}
                {scanError && (
                  <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-sm text-red-300">
                    {scanError}
                  </div>
                )}
                {!scanning ? (
                  <button
                    onClick={handleRunScan}
                    disabled={!url.trim() && !multiUrls.trim() && !sourceCode.trim()}
                    className="btn-primary flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#6366f1] via-[#8b5cf6] to-[#a855f7] py-3 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition-all hover:shadow-indigo-500/40 disabled:opacity-40 disabled:shadow-none"
                  >
                    <Play className="h-4 w-4" />
                    Run Scan
                  </button>
                ) : (
                  <div className="space-y-4">
                    {/* Progress bar */}
                    <div className="card rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
                      <div className="mb-2 flex items-center gap-2">
                        <Loader2 className="h-4 w-4 animate-spin text-[var(--accent)]" />
                        <span className="text-sm font-medium text-[var(--accent)]">Scanning...</span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-[rgba(99,102,241,0.12)]">
                        <motion.div
                          className="h-full rounded-full bg-gradient-to-r from-[#6366f1] via-[#8b5cf6] to-[#a855f7]"
                          initial={{ width: '0%' }}
                          animate={{ width: '60%' }}
                          transition={{ duration: 8, ease: 'linear' }}
                        />
                      </div>
                    </div>

                    {/* Agent status */}
                    <div className="card rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
                      <h4 className="mb-3 text-sm font-semibold text-[var(--text-primary)]">Scan in Progress</h4>
                      <div className="space-y-2.5">
                        {AGENTS.filter(a => selectedAgents.includes(a.id)).map(a => {
                          const status = getAgentStatus(a.id);
                          return (
                            <div key={a.id} className="flex items-center justify-between rounded-lg bg-[rgba(99,102,241,0.06)] px-3 py-2">
                              <div className="flex items-center gap-2 text-sm">
                                <a.icon className="h-4 w-4 text-[var(--text-secondary)]" />
                                <span className="text-[var(--text-secondary)]">{a.label}</span>
                              </div>
                              <span className={clsx('text-xs font-medium', {
                                'text-emerald-400': status === 'done',
                                'text-[var(--accent)]': status === 'running',
                                'text-[var(--text-tertiary)]': status === 'queued',
                              })}>
                                {status === 'done' && <span className="flex items-center gap-1"><CheckCircle2 className="h-3 w-3" /> Done</span>}
                                {status === 'running' && <span className="flex items-center gap-1"><Loader2 className="h-3 w-3 animate-spin" /> Running</span>}
                                {status === 'queued' && <span className="flex items-center gap-1"><Clock className="h-3 w-3" /> Queued</span>}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>

                    <button
                      onClick={handleAbort}
                      className="flex w-full items-center justify-center gap-2 rounded-xl border border-red-500/30 bg-red-500/10 py-3 text-sm font-semibold text-red-400 transition-colors hover:bg-red-500/20"
                    >
                      <Square className="h-4 w-4" />
                      Abort Scan
                    </button>
                  </div>
                )}

                {/* Recent Scans */}
                {recentScans.length > 0 && (
                  <div className="card rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
                    <h3 className="mb-3 text-sm font-semibold text-[var(--text-secondary)]">Recent Scans</h3>
                    <div className="space-y-1.5">
                      {recentScans.map(s => (
                        <div key={s.scan_id} className="flex items-center justify-between rounded-lg bg-[rgba(99,102,241,0.06)] px-3 py-2 text-sm">
                          <span className="font-mono text-[var(--text-secondary)]">{s.scan_id.slice(0, 8)}</span>
                          <span className={clsx('font-semibold', getScoreColor(s.overall_score ?? 0))}>{s.overall_score ?? '—'}</span>
                          <span className="text-xs text-[var(--text-tertiary)]">
                            {s.completed_at ? formatDistanceToNow(new Date(s.completed_at), { addSuffix: true }) : s.status}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </motion.div>
            )}

            {/* ── Schedule ── */}
            {activeTab === 'schedule' && (
              <motion.div key="schedule" variants={panelVariants} initial="hidden" animate="visible" exit="exit" transition={{ duration: 0.2 }}>
                <div className="card rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
                  <h3 className="mb-5 text-lg font-semibold text-[var(--text-primary)]">Scan Schedule</h3>
                  <div className="space-y-5">
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">Cron Expression</label>
                      <div className="relative">
                        <Hash className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-tertiary)]" />
                        <input
                          value={schedule.cron}
                          onChange={e => setSchedule(s => ({ ...s, cron: e.target.value }))}
                          className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] py-2.5 pl-10 pr-3 font-mono text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] transition-colors"
                        />
                      </div>
                      <p className="mt-1 text-xs text-[var(--text-tertiary)]">Default: Daily at 2:00 AM</p>
                    </div>
                    <div>
                      <label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">Timezone</label>
                      <select
                        value={schedule.timezone}
                        onChange={e => setSchedule(s => ({ ...s, timezone: e.target.value }))}
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] transition-colors"
                      >
                        {TIMEZONES.map(tz => <option key={tz} value={tz}>{tz}</option>)}
                      </select>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-medium text-[var(--text-secondary)]">Scheduler Enabled</span>
                      <Toggle enabled={schedule.enabled} onChange={v => setSchedule(s => ({ ...s, enabled: v }))} />
                    </div>
                    <button
                      onClick={() => handleSave('/config/schedule', schedule)}
                      disabled={saving}
                      className="btn-primary flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#6366f1] via-[#8b5cf6] to-[#a855f7] py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition-all hover:shadow-indigo-500/40 disabled:opacity-50"
                    >
                      {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      Save Schedule
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ── KPI Thresholds ── */}
            {activeTab === 'thresholds' && (
              <motion.div key="thresholds" variants={panelVariants} initial="hidden" animate="visible" exit="exit" transition={{ duration: 0.2 }}>
                <div className="card rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-6">
                  <h3 className="mb-1 text-lg font-semibold text-[var(--text-primary)]">KPI Score Thresholds</h3>
                  <p className="mb-5 text-sm text-[var(--text-secondary)]">Set minimum passing scores. Scans below these thresholds trigger alerts.</p>
                  <div className="grid grid-cols-2 gap-4">
                    {([
                      { key: 'overall' as const, label: 'Overall', color: 'border-blue-500/50 focus:border-blue-500' },
                      { key: 'security' as const, label: 'Security', color: 'border-red-500/50 focus:border-red-500' },
                      { key: 'performance' as const, label: 'Performance', color: 'border-emerald-500/50 focus:border-emerald-500' },
                      { key: 'code_quality' as const, label: 'Code Quality', color: 'border-purple-500/50 focus:border-purple-500' },
                    ]).map(t => (
                      <div key={t.key}>
                        <label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">{t.label}</label>
                        <input
                          type="number"
                          min={0}
                          max={100}
                          value={thresholds[t.key]}
                          onChange={e => setThresholds(prev => ({ ...prev, [t.key]: Number(e.target.value) }))}
                          className={clsx('w-full rounded-lg border bg-[var(--bg-primary)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none transition-colors', t.color)}
                        />
                      </div>
                    ))}
                  </div>
                  <button
                    onClick={() => handleSave('/config/thresholds', thresholds)}
                    disabled={saving}
                    className="btn-primary mt-5 flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#6366f1] via-[#8b5cf6] to-[#a855f7] py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition-all hover:shadow-indigo-500/40 disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Save Thresholds
                  </button>
                </div>
              </motion.div>
            )}

            {/* ── Notifications ── */}
            {activeTab === 'notifications' && (
              <motion.div key="notifications" variants={panelVariants} initial="hidden" animate="visible" exit="exit" transition={{ duration: 0.2 }}>
                <div className="space-y-4">
                  {([
                    { key: 'slack' as const, label: 'Slack', desc: 'Send scan results to Slack channels', icon: '💬' },
                    { key: 'email' as const, label: 'Email', desc: 'Email reports to stakeholders', icon: '📧' },
                    { key: 'jira' as const, label: 'Jira Auto-Tickets', desc: 'Auto-create Jira tickets for critical findings', icon: '🎫' },
                  ]).map(n => (
                    <div key={n.key} className="card flex items-center justify-between rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
                      <div className="flex items-center gap-3">
                        <span className="text-2xl">{n.icon}</span>
                        <div>
                          <div className="text-sm font-semibold text-[var(--text-primary)]">{n.label}</div>
                          <div className="text-xs text-[var(--text-tertiary)]">{n.desc}</div>
                        </div>
                      </div>
                      <Toggle
                        enabled={notifConfig[n.key]}
                        onChange={v => setNotifConfig(prev => ({ ...prev, [n.key]: v }))}
                      />
                    </div>
                  ))}
                  <button
                    onClick={() => handleSave('/config/notifications', notifConfig)}
                    disabled={saving}
                    className="btn-primary flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#6366f1] via-[#8b5cf6] to-[#a855f7] py-2.5 text-sm font-semibold text-white shadow-lg shadow-indigo-500/25 transition-all hover:shadow-indigo-500/40 disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                    Save Notification Settings
                  </button>
                </div>
              </motion.div>
            )}

            {/* ── Webhook Logs ── */}
            {activeTab === 'webhooks' && (
              <motion.div key="webhooks" variants={panelVariants} initial="hidden" animate="visible" exit="exit" transition={{ duration: 0.2 }}>
                <div className="card rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
                  <div className="mb-4 flex items-center justify-between">
                    <h3 className="text-lg font-semibold text-[var(--text-primary)]">Webhook Logs</h3>
                    <button
                      onClick={loadWebhooks}
                      disabled={webhooksLoading}
                      className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] px-3 py-1.5 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-strong)] transition-colors"
                    >
                      <RefreshCw className={clsx('h-3.5 w-3.5', webhooksLoading && 'animate-spin')} />
                      Refresh
                    </button>
                  </div>
                  {webhookLogs.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <AlertCircle className="mb-3 h-10 w-10 text-[var(--text-tertiary)]" />
                      <p className="text-sm text-[var(--text-tertiary)]">No webhook events</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b border-[var(--border)] text-left text-xs font-medium uppercase tracking-wider text-[var(--text-tertiary)]">
                            <th className="pb-3 pr-4">Time</th>
                            <th className="pb-3 pr-4">Event</th>
                            <th className="pb-3 pr-4">Source</th>
                            <th className="pb-3">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-[var(--border)]">
                          {webhookLogs.map((log, i) => (
                            <tr key={i}>
                              <td className="py-2.5 pr-4 text-[var(--text-secondary)]">{log.time}</td>
                              <td className="py-2.5 pr-4 text-[var(--text-primary)]">{log.event}</td>
                              <td className="py-2.5 pr-4 text-[var(--text-secondary)]">{log.source}</td>
                              <td className="py-2.5">
                                <span className={clsx(
                                  'inline-flex rounded-full px-2 py-0.5 text-xs font-medium',
                                  log.status === 'success' && 'bg-emerald-400/10 text-emerald-400',
                                  log.status === 'error' && 'bg-red-400/10 text-red-400',
                                  log.status === 'pending' && 'bg-yellow-400/10 text-yellow-400',
                                )}>
                                  {log.status}
                                </span>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function getScoreColor(score: number) {
  if (score >= 90) return 'text-emerald-400';
  if (score >= 70) return 'text-yellow-400';
  if (score >= 50) return 'text-orange-400';
  return 'text-red-400';
}

function getScoreBg(score: number) {
  if (score >= 90) return 'bg-emerald-400';
  if (score >= 70) return 'bg-yellow-400';
  if (score >= 50) return 'bg-orange-400';
  return 'bg-red-400';
}

// Re-export helpers for other pages
export { getScoreColor, getScoreBg };
