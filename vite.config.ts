import { readFile } from 'node:fs/promises'
import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'

// Let the browser paint the startup shell before Vite transforms the app entry.
function serveStartupShell(): Plugin {
  return {
    name: 'serve-startup-shell',
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const path = request.url?.split('?')[0]
        if (request.method !== 'GET' || (path !== '/' && path !== '/index.html')) {
          next()
          return
        }
        try {
          const html = await readFile(`${server.config.root}/index.html`, 'utf8')
          const devClient = `<script type="module" src="/@vite/client"></script><script type="module">import RefreshRuntime from "/@react-refresh"; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type; window.__vite_plugin_react_preamble_installed__ = true;</script>`
          response.statusCode = 200
          response.setHeader('Content-Type', 'text/html; charset=utf-8')
          response.setHeader('Cache-Control', 'no-cache')
          response.end(html.replace('</head>', `${devClient}</head>`))
        } catch (error) {
          next(error instanceof Error ? error : new Error(String(error)))
        }
      })
    },
  }
}

export default defineConfig({
  plugins: [serveStartupShell(), react()],
  base: './',
  optimizeDeps: {
    include: ['react', 'react-dom/client', 'maplibre-gl', 'pmtiles'],
    noDiscovery: true,
  },
  server: {
    warmup: { clientFiles: ['./src/main.tsx'] },
  },
})
