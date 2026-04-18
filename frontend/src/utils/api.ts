/**
 * Dev: `/api` (Vite proxy). Production on another host: set at build time, e.g.
 * `VITE_API_BASE_URL=https://your-api.fly.dev/api` (no trailing slash).
 */
const BASE_URL =
  (typeof import.meta.env.VITE_API_BASE_URL === 'string' && import.meta.env.VITE_API_BASE_URL.trim()) ||
  '/api';

class ApiClient {
  private baseUrl: string;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    const token = localStorage.getItem('token');
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await fetch(`${this.baseUrl}${path}`, {
      method,
      headers: this.getHeaders(),
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const ct = res.headers.get('content-type') ?? '';
      let message = res.statusText;
      if (ct.includes('application/json')) {
        const data = await res.json().catch(() => ({ detail: res.statusText }));
        const detail = data.detail;
        message =
          typeof detail === 'string'
            ? detail
            : Array.isArray(detail)
              ? detail.map((d: { msg?: string }) => d?.msg || JSON.stringify(d)).join('; ')
              : res.statusText;
      } else {
        await res.text().catch(() => '');
        if (res.status === 404) {
          message =
            'API returned 404 (Not Found). The UI is not reaching your FastAPI backend. ' +
            'Local dev: start uvicorn, set frontend/.env.development VITE_API_PROXY to match the port, run npm run dev. ' +
            'GitHub Pages / Netlify / static host: rebuild with VITE_API_BASE_URL=https://YOUR-API-HOST/api (see DEPLOY.md). ' +
            'Verify https://YOUR-API-HOST/api/ping returns {"ok":true,...}.';
        } else if (res.status === 405) {
          message =
            'API returned 405 (Method Not Allowed). The request hit a static file host (e.g. GitHub Pages), not FastAPI. ' +
            'Rebuild the frontend with VITE_API_BASE_URL=https://YOUR-RENDER-URL.onrender.com/api and redeploy.';
        }
      }
      throw new Error(message || `API ${method} ${path} failed (${res.status})`);
    }
    return res.json() as Promise<T>;
  }

  get<T>(path: string) {
    return this.request<T>('GET', path);
  }

  post<T>(path: string, body?: unknown) {
    return this.request<T>('POST', path, body);
  }

  put<T>(path: string, body?: unknown) {
    return this.request<T>('PUT', path, body);
  }

  delete<T>(path: string) {
    return this.request<T>('DELETE', path);
  }
}

export const api = new ApiClient(BASE_URL);
