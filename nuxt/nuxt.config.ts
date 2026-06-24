import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

// Determina baseURL: '/' per dev locale, path completo per produzione
const isDev = process.env.NODE_ENV === 'development'
const baseURL = isDev ? '/' : '/acc-telemetry-dashboard/docs/'
// In dev usa _nuxt default, in production usa assets
const buildAssetsDir = isDev ? '/_nuxt/' : '/assets/'
const ignoredRuntimePaths = ['**/.tmp_edge_profile/**', '**/.tmp_edge_profile', '**/dist/**', '**/dist']
const staticPublicDir = process.env.ACC_NUXT_PUBLIC_DIR

async function patchWindowsNitroPrerenderImports(dir: string) {
  const entries = await readdir(dir, { withFileTypes: true }).catch(() => [])

  for (const entry of entries) {
    const path = join(dir, entry.name)

    if (entry.isDirectory()) {
      await patchWindowsNitroPrerenderImports(path)
      continue
    }

    if (!entry.isFile() || !entry.name.endsWith('.mjs')) {
      continue
    }

    const source = await readFile(path, 'utf8')
    const patched = source
      // Nitro can emit Windows absolute paths inside dynamic imports during
      // prerender. Node ESM requires file URLs for those imports.
      .replace(/import\((['"])([A-Za-z]:\/[^'"]+)\1\)/g, 'import($1file:///$2$1)')
      .replace(/file:\/\/([A-Za-z]:\/)/g, 'file:///$1')

    if (patched !== source) {
      await writeFile(path, patched, 'utf8')
    }
  }
}

export default defineNuxtConfig({
  ssr: false,
  ignore: ignoredRuntimePaths,

  // === COMPATIBILITÀ ===
  compatibilityDate: '2025-01-11',

  // Necessario con ssr:false per configurare correttamente il socket IPC vite-node
  experimental: {
    viteEnvironmentApi: true
  },

  app: {
    // URL dinamico: locale vs produzione
    baseURL,
    buildAssetsDir,

    // Page transitions
    pageTransition: { name: 'page-fade', mode: 'out-in' },

    // Meta tags e font
    head: {
      title: 'ACC Telemetry Dashboard',
      htmlAttrs: {
        lang: 'it'
      },
      meta: [
        { charset: 'utf-8' },
        { name: 'viewport', content: 'width=device-width, initial-scale=1' },
        { name: 'description', content: 'Dashboard telemetria per Assetto Corsa Competizione' },
        // Content-Security-Policy: blocca inline scripts non autorizzati e risorse esterne non previste
        {
          'http-equiv': 'Content-Security-Policy',
          content: [
            "default-src 'self'",
            "script-src 'self' 'unsafe-inline'",   // unsafe-inline necessario per Nuxt SSR hydration
            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
            "font-src 'self' https://fonts.gstatic.com",
            "img-src 'self' data: https:",
            "connect-src 'self' https://*.googleapis.com https://*.firebaseio.com wss://*.firebaseio.com",
            "frame-ancestors 'none'",
          ].join('; ')
        }
      ],
      link: [
        // Google Fonts: Inter + Outfit
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Outfit:wght@400;500;600;700&display=swap'
        }
      ]
    }
  },

  // === CSS GLOBALE ===
  css: [
    '~/assets/scss/main.scss'
  ],

  vite: {
    optimizeDeps: {
      // Vite 7 dependency pre-bundling can fail on Windows with this Nuxt app
      // while the server remains otherwise usable. Disable it only for dev.
      disabled: 'dev',
      noDiscovery: true,
      include: ['chartjs-plugin-zoom', 'hammerjs']
    },
    server: {
      watch: {
        ignored: ignoredRuntimePaths
      }
    }
  },

  nitro: {
    preset: 'static',
    watchOptions: {
      ignored: ignoredRuntimePaths
    },
    ...(!isDev && staticPublicDir ? {
      output: {
        // Optional release target. Keep normal builds in Nuxt/Nitro's default
        // output folder so Windows does not try to clean the repo docs folder.
        publicDir: staticPublicDir
      }
    } : {}),
    hooks: {
      async compiled(nitro) {
        if (process.platform !== 'win32') {
          return
        }

        await patchWindowsNitroPrerenderImports(join(nitro.options.buildDir, 'prerender'))
      }
    }
  }
})
