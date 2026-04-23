import { create } from 'zustand';
import { api } from '../utils/api';

export interface Finding {
  severity: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
  title: string;
  description: string;
  category: string;
  remediation?: string;
  auto_fixable?: boolean;
}

export interface Recommendation {
  title: string;
  description: string;
  category: string;
  impact: number;
  risk: number;
  ease: number;
  effort: 'low' | 'high';
  quick_win: boolean;
  projected_gain?: number;
}

/** Payload items in `regressions` JSON from API — score change vs last scan, or new finding. */
export interface ComparisonToLastScanItem {
  /** Score area: "Security", "Performance", "Code Quality", "Overall" */
  metric?: string;
  previous?: number;
  current?: number;
  /** Negative when score went down */
  delta?: number;
  /** New CRITICAL/HIGH finding vs previous scan titles */
  title?: string;
  severity?: 'CRITICAL' | 'HIGH' | 'MEDIUM' | 'LOW' | 'INFO';
}

export interface SecurityResults {
  ssl_grade?: string;
  headers_score?: number;
  missing_headers?: string[];
  cors_issues?: string[];
  token_leaks?: string[];
  dependency_vulnerabilities?: Array<{
    package: string;
    severity: string;
    version: string;
    fixed_version?: string;
    cve?: string;
  }>;
  drm_protection?: {
    widevine: boolean;
    fairplay: boolean;
    key_rotation: boolean;
    license_url_safe: boolean;
  };
  owasp_mapping?: Array<{
    category: string;
    id: string;
    findings: Finding[];
  }>;
  api_endpoints?: Array<{
    url: string;
    method: string;
    authenticated: boolean;
    description?: string;
  }>;
  raw?: unknown;
}

export interface PerformanceResults {
  lighthouse?: {
    performance: number;
    accessibility: number;
    best_practices: number;
    seo: number;
    pwa: number;
  };
  core_web_vitals?: {
    lcp?: { value: number; unit: string; target: number; status: string };
    fcp?: { value: number; unit: string; target: number; status: string };
    cls?: { value: number; unit: string; target: number; status: string };
    fid?: { value: number; unit: string; target: number; status: string };
    ttfb?: { value: number; unit: string; target: number; status: string };
    inp?: { value: number; unit: string; target: number; status: string };
    si?: { value: number; unit: string; target: number; status: string };
    tbt?: { value: number; unit: string; target: number; status: string };
  };
  resource_summary?: {
    total_weight: number;
    js: number;
    css: number;
    images: number;
    fonts: number;
    other: number;
  };
  /** pagespeed_insights | chromium | httpx | none — how performance was derived */
  measurement_source?: string;
  lighthouse_version?: string;
  pagespeed_analysis_time?: string;
  raw?: unknown;
}

export interface CodeQualityResults {
  lint_errors?: number;
  lint_warnings?: number;
  auto_fixable?: number;
  dead_code?: number;
  memory_leaks?: number;
  tech_debt_hours?: number;
  anti_patterns?: number;
  async_issues?: number;
  avg_complexity?: number;
  max_complexity?: number;
  duplicate_blocks?: number;
  avg_cognitive?: number;
  high_complexity_functions?: Array<{
    name: string;
    file: string;
    complexity: number;
  }>;
  memory_leak_details?: Array<{ description: string; file?: string }>;
  async_issue_details?: Array<{ description: string; file?: string }>;
  problematic_files?: Array<{
    file: string;
    total: number;
    critical: number;
    high: number;
  }>;
  findings_by_category?: Record<string, number>;
  raw?: unknown;
}

/** Sent with POST /scans; mirrors backend BrowserScanOptions + LoginFlowConfig. */
export interface LoginFlowOptions {
  enabled: boolean;
  login_url?: string;
  username?: string;
  password?: string;
  email_selector?: string;
  password_selector?: string;
  submit_selector?: string;
  post_login_wait_ms?: number;
}

export interface BrowserScanOptionsPayload {
  use_browser?: boolean;
  headless?: boolean;
  viewport_width?: number;
  viewport_height?: number;
  user_agent?: string | null;
  navigation_timeout_ms?: number | null;
  login?: LoginFlowOptions;
  /** Skip PageSpeed API (slow); use local snapshot/HTTP for performance — set by header quick-scan */
  fast_scan?: boolean;
}

export interface ScanData {
  scan_id: string;
  target_url: string;
  /** desktop | mweb | both — each physical run stores desktop or mweb when you chose Both */
  platform?: string;
  /** Present when this run was one of a Desktop + mWeb pair */
  scan_group_id?: string | null;
  overall_score: number;
  security_score: number;
  performance_score: number;
  code_quality_score: number;
  security_results: SecurityResults;
  performance_results: PerformanceResults;
  code_quality_results: CodeQualityResults;
  findings: Finding[];
  recommendations: Recommendation[];
  regressions: ComparisonToLastScanItem[];
  status: 'pending' | 'running' | 'completed' | 'failed' | 'aborted';
  started_at: string;
  completed_at?: string;
  duration_ms?: number;
  executive_summary?: string;
  score_history?: Array<{
    date: string;
    overall: number;
    security: number;
    performance: number;
    code_quality: number;
  }>;
}

interface ScanStore {
  currentScan: ScanData | null;
  scans: ScanData[];
  /** When the last start used Desktop + mWeb, poll these ids until all finish */
  lastPollScanIds: string[] | null;
  scanning: boolean;
  loading: boolean;
  error: string | null;
  progress: Record<string, unknown> | null;
  fetchScan: (scanId: string) => Promise<void>;
  startScan: (
    url: string,
    platform?: string,
    agents?: string[],
    browserOptions?: BrowserScanOptionsPayload | null,
  ) => Promise<string[]>;
  loadScan: (scanId: string) => Promise<void>;
  loadScans: () => Promise<void>;
  setCurrentScan: (scan: ScanData) => void;
  abortScan: (scanId: string) => Promise<void>;
  /** Abort the current run (both platforms if applicable) */
  abortActiveScans: () => Promise<void>;
  pollScan: (scanId?: string | string[]) => Promise<void>;
  setScan: (scan: ScanData) => void;
  clearScan: () => void;
}

export const useScanStore = create<ScanStore>((set) => ({
  currentScan: null,
  scans: [],
  lastPollScanIds: null,
  scanning: false,
  loading: false,
  error: null,
  progress: null,

  fetchScan: async (scanId: string) => {
    set({ loading: true, error: null });
    try {
      const scan = await api.get<ScanData>(`/scans/${scanId}`);
      set({ currentScan: scan, loading: false });
    } catch (e) {
      set({ error: (e as Error).message, loading: false });
    }
  },

  startScan: async (url: string, platform?: string, agents?: string[], browserOptions?: BrowserScanOptionsPayload | null) => {
    set({ scanning: true, loading: true, error: null });
    try {
      const body: Record<string, unknown> = { target_url: url, platform, agents };
      if (browserOptions != null) body.browser_options = browserOptions;
      const res = await api.post<{ scans: ScanData[] }>('/scans', body);
      const scans = res.scans ?? [];
      const ids = scans.map((s) => s.scan_id);
      const multi = ids.length > 1;
      set((state) => ({
        currentScan: scans[0],
        lastPollScanIds: multi ? ids : null,
        scanning: true,
        loading: false,
        scans:
          scans.length > 0
            ? [
                ...scans,
                ...state.scans.filter((s) => !scans.some((n) => n.scan_id === s.scan_id)),
              ]
            : state.scans,
      }));
      return ids;
    } catch (e) {
      set({ scanning: false, loading: false, error: (e as Error).message });
      throw e;
    }
  },

  loadScan: async (scanId: string) => {
    const data = await api.get<ScanData>(`/scans/${scanId}`);
    set({
      currentScan: data,
      scanning: data.status === 'running' || data.status === 'pending',
      lastPollScanIds: null,
    });
  },

  loadScans: async () => {
    const data = await api.get<{ scans: ScanData[]; total: number }>('/scans');
    set({ scans: data.scans });
  },

  setCurrentScan: (scan) => set({ currentScan: scan }),

  abortScan: async (scanId: string) => {
    await api.post(`/scans/${scanId}/abort`);
    set({ scanning: false, lastPollScanIds: null });
  },

  abortActiveScans: async () => {
    const { lastPollScanIds, currentScan } = useScanStore.getState();
    const ids = lastPollScanIds ?? (currentScan ? [currentScan.scan_id] : []);
    for (const id of ids) {
      try {
        await api.post(`/scans/${id}/abort`);
      } catch {
        /* best-effort */
      }
    }
    set({ scanning: false, lastPollScanIds: null });
  },

  pollScan: async (scanId?: string | string[]) => {
    const state = useScanStore.getState();
    let ids: string[];
    if (scanId !== undefined) {
      ids = Array.isArray(scanId) ? scanId : [scanId];
    } else {
      ids = state.lastPollScanIds ?? (state.currentScan ? [state.currentScan.scan_id] : []);
    }
    if (ids.length === 0) return;
    try {
      const data = await Promise.all(ids.map((id) => api.get<ScanData>(`/scans/${id}`)));
      const anyActive = data.some((d) => d.status === 'running' || d.status === 'pending');
      set((state) => {
        const mergedScans = [...state.scans];
        for (const d of data) {
          const idx = mergedScans.findIndex((x) => x.scan_id === d.scan_id);
          if (idx >= 0) mergedScans[idx] = d;
          else mergedScans.unshift(d);
        }
        const prevId = state.currentScan?.scan_id;
        const primary =
          data.find((d) => d.status === 'running' || d.status === 'pending') ??
          (prevId ? data.find((d) => d.scan_id === prevId) : undefined) ??
          data[0];
        return {
          currentScan: primary,
          scanning: anyActive,
          error: null,
          lastPollScanIds: anyActive ? ids : null,
          scans: mergedScans,
        };
      });
      if (!anyActive) {
        try {
          await useScanStore.getState().loadScans();
        } catch {
          /* list refresh is best-effort */
        }
      }
    } catch (e) {
      set({ error: (e as Error).message, scanning: false, lastPollScanIds: null });
    }
  },

  setScan: (scan) => set({ currentScan: scan }),
  clearScan: () => set({ currentScan: null, error: null, scanning: false, lastPollScanIds: null }),
}));
