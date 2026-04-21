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

/** Matches backend `detect_regressions` in scoring.py — two shapes. */
export interface Regression {
  /** Score drop: e.g. "Security", "Performance", "Overall" */
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
}

export interface ScanData {
  scan_id: string;
  target_url: string;
  overall_score: number;
  security_score: number;
  performance_score: number;
  code_quality_score: number;
  security_results: SecurityResults;
  performance_results: PerformanceResults;
  code_quality_results: CodeQualityResults;
  findings: Finding[];
  recommendations: Recommendation[];
  regressions: Regression[];
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
  ) => Promise<string>;
  loadScan: (scanId: string) => Promise<void>;
  loadScans: () => Promise<void>;
  setCurrentScan: (scan: ScanData) => void;
  abortScan: (scanId: string) => Promise<void>;
  pollScan: (scanId: string) => Promise<void>;
  setScan: (scan: ScanData) => void;
  clearScan: () => void;
}

export const useScanStore = create<ScanStore>((set) => ({
  currentScan: null,
  scans: [],
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
      const scan = await api.post<ScanData>('/scans', body);
      set({ currentScan: scan, scanning: true, loading: false });
      return scan.scan_id;
    } catch (e) {
      set({ scanning: false, loading: false, error: (e as Error).message });
      throw e;
    }
  },

  loadScan: async (scanId: string) => {
    const data = await api.get<ScanData>(`/scans/${scanId}`);
    set({ currentScan: data, scanning: data.status === 'running' || data.status === 'pending' });
  },

  loadScans: async () => {
    const data = await api.get<{ scans: ScanData[]; total: number }>('/scans');
    set({ scans: data.scans });
  },

  setCurrentScan: (scan) => set({ currentScan: scan }),

  abortScan: async (scanId: string) => {
    await api.post(`/scans/${scanId}/abort`);
    set({ scanning: false });
  },

  pollScan: async (scanId: string) => {
    try {
      const data = await api.get<ScanData>(`/scans/${scanId}`);
      const active = data.status === 'running' || data.status === 'pending';
      set({ currentScan: data, scanning: active, error: null });
      if (!active) {
        try {
          await useScanStore.getState().loadScans();
        } catch {
          /* list refresh is best-effort */
        }
      }
    } catch (e) {
      set({ error: (e as Error).message, scanning: false });
    }
  },

  setScan: (scan) => set({ currentScan: scan }),
  clearScan: () => set({ currentScan: null, error: null, scanning: false }),
}));
