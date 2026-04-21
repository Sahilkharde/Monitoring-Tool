import { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { OTT_SITES } from '../data/ottSites';
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
import { formatScanPlatform } from '../utils/scanPlatform';
import { formatDistanceToNow } from 'date-fns';

type NavTab = 'run-scan' | 'schedule' | 'thresholds' | 'notifications' | 'webhooks';
type InputMode = 'single' | 'multiple' | 'source';
type Platform = 'desktop' | 'mweb' | 'both';

interface ScheduleConfig {
  /** Required by API when saving a schedule */
  target_url: string;
  cron: string;
  timezone: string;
  enabled: boolean;
  agents: string[];
  platform: string;
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
  /** Fixed position for portaled OTT menu (escapes main scroll clipping). */
  const [ottMenuPos, setOttMenuPos] = useState<{ top: number; left: number } | null>(null);
  const ottRef = useRef<HTMLDivElement>(null);
  const ottMenuRef = useRef<HTMLDivElement>(null);

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
  const [schedule, setSchedule] = useState<ScheduleConfig>({
    target_url: '',
    cron: '0 2 * * *',
    timezone: 'Asia/Kolkata',
    enabled: false,
    agents: ['security', 'performance', 'code_quality'],
    platform: 'both',
  });

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

  const { startScan, scanning, currentScan, abortActiveScans, scans, loadScans } = useScanStore();
  const scanError = useScanStore((s) => s.error);

  useEffect(() => {
    loadScans();
    api
      .get<{ uptime_seconds?: number }>('/control/health')
      .then((d) => setUptime(typeof d.uptime_seconds === 'number' ? Math.floor(d.uptime_seconds / 3600) : null))
      .catch(() => setUptime(null));
    api
      .get<{
        data: {
          target_url: string;
          cron_expression: string;
          timezone: string;
          enabled: boolean;
          agents: string[];
          platform: string;
        } | null;
      }>('/control/schedule')
      .then((r) => {
        const d = r.data;
        if (!d) return;
        setSchedule({
          target_url: d.target_url || '',
          cron: d.cron_expression || '0 2 * * *',
          timezone: d.timezone || 'Asia/Kolkata',
          enabled: !!d.enabled,
          agents: (d.agents?.length ? d.agents : ['security', 'performance', 'code_quality']).map((a) =>
            a === 'code-quality' ? 'code_quality' : a,
          ),
          platform: d.platform || 'both',
        });
      })
      .catch(() => {});
    api
      .get<{ data: ThresholdConfig }>('/control/thresholds')
      .then((r) => {
        if (r.data) setThresholds(r.data);
      })
      .catch(() => {});
    api
      .get<{ data: { slack_enabled: boolean; email_enabled: boolean; jira_enabled: boolean } }>('/control/notifications')
      .then((r) => {
        if (!r.data) return;
        setNotifConfig({
          slack: r.data.slack_enabled,
          email: r.data.email_enabled,
          jira: r.data.jira_enabled,
        });
      })
      .catch(() => {});
  }, [loadScans]);

  const updateOttMenuPosition = useCallback(() => {
    if (!ottRef.current) return;
    const r = ottRef.current.getBoundingClientRect();
    const menuWidth = 288;
    const left = Math.max(16, Math.min(r.right - menuWidth, window.innerWidth - menuWidth - 16));
    setOttMenuPos({ top: r.bottom + 8, left });
  }, []);

  const handleToggleOtt = useCallback(() => {
    if (showOttDropdown) {
      setShowOttDropdown(false);
      setOttMenuPos(null);
      return;
    }
    if (!ottRef.current) return;
    const r = ottRef.current.getBoundingClientRect();
    const menuWidth = 288;
    const left = Math.max(16, Math.min(r.right - menuWidth, window.innerWidth - menuWidth - 16));
    setOttMenuPos({ top: r.bottom + 8, left });
    setShowOttDropdown(true);
  }, [showOttDropdown]);

  useLayoutEffect(() => {
    if (!showOttDropdown) setOttMenuPos(null);
  }, [showOttDropdown]);

  useEffect(() => {
    if (!showOttDropdown) return;
    const onResizeOrScroll = () => updateOttMenuPosition();
    window.addEventListener('resize', onResizeOrScroll);
    window.addEventListener('scroll', onResizeOrScroll, true);
    return () => {
      window.removeEventListener('resize', onResizeOrScroll);
      window.removeEventListener('scroll', onResizeOrScroll, true);
    };
  }, [showOttDropdown, updateOttMenuPosition]);

  /** Dim page + allow OTT list to scroll on top of content (menu is portaled to body). */
  useEffect(() => {
    if (!showOttDropdown) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [showOttDropdown]);

  useEffect(() => {
    function handlePointerDown(e: PointerEvent) {
      const t = e.target as Node;
      if (ottRef.current?.contains(t)) return;
      if (ottMenuRef.current?.contains(t)) return;
      setShowOttDropdown(false);
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === 'Escape') setShowOttDropdown(false);
    }
    if (!showOttDropdown) return;
    document.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [showOttDropdown]);

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
      await startScan(target, platform, selectedAgents, buildBrowserOptions());
    } catch { /* handled by store */ }
  }, [
    inputMode,
    url,
    multiUrls,
    sourceCode,
    platform,
    selectedAgents,
    startScan,
    buildBrowserOptions,
  ]);

  /** OTT preset: fill URL and start scan with current platform / agents / browser options */
  const handleOttPickAndScan = useCallback(
    async (targetUrl: string) => {
      setUrl(targetUrl);
      setShowOttDropdown(false);
      if (scanning || selectedAgents.length === 0) return;
      try {
        await startScan(targetUrl, platform, selectedAgents, buildBrowserOptions());
      } catch {
        /* handled by store */
      }
    },
    [scanning, selectedAgents, platform, startScan, buildBrowserOptions],
  );

  const handleAbort = useCallback(async () => {
    await abortActiveScans();
  }, [abortActiveScans]);

  const handleSave = useCallback(async (endpoint: string, data: unknown) => {
    setSaving(true);
    try {
      await api.post(endpoint, data);
    } catch {
      /* surfaced via optional toast in future */
    } finally {
      setSaving(false);
    }
  }, []);

  const saveSchedule = useCallback(() => {
    const body = {
      target_url: schedule.target_url.trim() || 'https://example.com',
      cron_expression: schedule.cron,
      timezone: schedule.timezone,
      enabled: schedule.enabled,
      agents: schedule.agents.map((a) => (a === 'code_quality' ? 'code-quality' : a)),
      platform: schedule.platform,
    };
    return handleSave('/control/schedule', body);
  }, [handleSave, schedule]);

  const saveNotifications = useCallback(() => {
    const body = {
      slack_enabled: notifConfig.slack,
      email_enabled: notifConfig.email,
      jira_enabled: notifConfig.jira,
    };
    return handleSave('/control/notifications', body);
  }, [handleSave, notifConfig]);

  const loadWebhooks = useCallback(async () => {
    setWebhooksLoading(true);
    try {
      const data = await api.get<{
        data: Array<{
          timestamp: string | null;
          event: string;
          source: string;
          status: WebhookLog['status'];
        }>;
      }>('/control/webhooks');
      setWebhookLogs(
        (data.data || []).map((row) => ({
          time: row.timestamp ? formatDistanceToNow(new Date(row.timestamp), { addSuffix: true }) : '—',
          event: row.event,
          source: row.source,
          status: row.status,
        })),
      );
    } catch {
      setWebhookLogs([]);
    } finally {
      setWebhooksLoading(false);
    }
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
                {/* Scan Target — z-index when OTT menu open so list stays above Platform/Agents cards on scroll */}
                <div className="card overflow-visible rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
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
                      <div ref={ottRef} className="relative shrink-0">
                        <button
                          type="button"
                          aria-expanded={showOttDropdown}
                          aria-haspopup="listbox"
                          onClick={handleToggleOtt}
                          className="flex items-center gap-1.5 rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2.5 text-sm text-[var(--text-secondary)] hover:border-[var(--accent)] transition-colors"
                        >
                          OTT Sites
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                        {showOttDropdown &&
                          typeof document !== 'undefined' &&
                          ottMenuPos &&
                          createPortal(
                            <>
                              <div
                                className="fixed inset-0 z-[280] bg-black/50 backdrop-blur-[2px]"
                                aria-hidden
                              />
                              <div
                                ref={ottMenuRef}
                                role="listbox"
                                aria-label="OTT preset sites"
                                className="fixed z-[281] max-h-[min(70vh,22rem)] w-72 overflow-y-auto overscroll-contain rounded-xl border border-[var(--border-strong)] bg-[var(--bg-card)] py-1 shadow-2xl shadow-black/50"
                                style={{ top: ottMenuPos.top, left: ottMenuPos.left }}
                              >
                                {OTT_SITES.map((s) => (
                                  <button
                                    key={s.url}
                                    type="button"
                                    role="option"
                                    disabled={scanning || selectedAgents.length === 0}
                                    onClick={() => void handleOttPickAndScan(s.url)}
                                    className="w-full px-3 py-2 text-left text-sm text-[var(--text-secondary)] transition-colors hover:bg-[rgba(99,102,241,0.06)] disabled:cursor-not-allowed disabled:opacity-50"
                                  >
                                    <div className="font-medium text-[var(--text-primary)]">{s.label}</div>
                                    {s.subtitle && (
                                      <div className="text-[11px] text-[var(--text-tertiary)]">{s.subtitle}</div>
                                    )}
                                    <div className="truncate text-xs text-[var(--text-tertiary)]">{s.url}</div>
                                  </button>
                                ))}
                              </div>
                            </>,
                            document.body,
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
                <div className="card relative z-0 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
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
                <div className="card relative z-0 rounded-xl border border-[var(--border)] bg-[var(--bg-card)] p-5">
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
                        <div key={s.scan_id} className="flex items-center justify-between gap-2 rounded-lg bg-[rgba(99,102,241,0.06)] px-3 py-2 text-sm">
                          <span className="font-mono text-[var(--text-secondary)]">{s.scan_id.slice(0, 8)}</span>
                          <span className="shrink-0 rounded-md border border-[var(--border)] bg-[var(--bg-primary)] px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[var(--text-tertiary)]">
                            {formatScanPlatform(s.platform)}
                          </span>
                          <span className={clsx('font-semibold tabular-nums', getScoreColor(s.overall_score ?? 0))}>{s.overall_score ?? '—'}</span>
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
                      <label className="mb-1.5 block text-sm font-medium text-[var(--text-secondary)]">Target URL</label>
                      <input
                        value={schedule.target_url}
                        onChange={(e) => setSchedule((s) => ({ ...s, target_url: e.target.value }))}
                        placeholder="https://your-site.com"
                        className="w-full rounded-lg border border-[var(--border)] bg-[var(--bg-primary)] px-3 py-2.5 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent)] transition-colors"
                      />
                      <p className="mt-1 text-xs text-[var(--text-tertiary)]">Used when the scheduler runs (required to save).</p>
                    </div>
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
                      type="button"
                      onClick={() => void saveSchedule()}
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
                    type="button"
                    onClick={() => void handleSave('/control/thresholds', thresholds)}
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
                    type="button"
                    onClick={() => void saveNotifications()}
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
