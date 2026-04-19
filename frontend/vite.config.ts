import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const configDir = path.dirname(fileURLToPath(import.meta.url))

/** GitHub Project Pages: `VITE_BASE_PATH=/repo-name/` so assets and router match `user.github.io/repo-name/`. */
function viteBase(envPath: string): string {
  const raw = (envPath || '/').trim()
  if (!raw || raw === '/') return '/'
  const withSlash = raw.startsWith('/') ? raw : `/${raw}`
  return withSlash.endsWith('/') ? withSlash : `${withSlash}/`
}

// loadEnv: env files are not applied to vite.config unless we load them here.
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, configDir, '')
  const apiTarget = env.VITE_API_PROXY || 'http://127.0.0.1:8001'
  const base = viteBase(env.VITE_BASE_PATH || '/')

  const devProxy = {
    '/api': {
      target: apiTarget,
      changeOrigin: true,
    },
    '/socket.io': {
      target: apiTarget,
      ws: true,
    },
  } as const

  /** GitHub Pages has no SPA rewrite: deep links like /repo/login 404. Copy index.html → 404.html so Pages serves the app shell. */
  const githubPagesSpaFallback = {
    name: 'github-pages-spa-fallback',
    closeBundle() {
      const dist = path.resolve(configDir, 'dist')
      const indexHtml = path.join(dist, 'index.html')
      const notFoundHtml = path.join(dist, '404.html')
      if (fs.existsSync(indexHtml)) {
        fs.copyFileSync(indexHtml, notFoundHtml)
      }
    },
  }

  return {
    base,
    plugins: [react(), tailwindcss(), githubPagesSpaFallback],
    server: {
      port: 5173,
      proxy: { ...devProxy },
    },
    preview: {
      proxy: { ...devProxy },
    },
  }
})
