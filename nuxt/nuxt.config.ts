import { readdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

// Determina baseURL: '/' per dev locale, path completo per produzione
const isDev = process.env.NODE_ENV === 'development'
const baseURL = isDev ? '/' : '/acc-telemetry-dashboard/docs/'
// In dev usa _nuxt default, in production usa assets
const buildAssetsDir = isDev ? '/_nuxt/' : '/assets/'

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

  // === COMPATIBILITÀ ===
  compatibilityDate: '2025-01-11',

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
        { name: 'description', content: 'Dashboard telemetria per Assetto Corsa Competizione' }
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
    server: {
      watch: {
        ignored: ['**/.tmp_edge_profile/**']
      }
    }
  },

  nitro: {
    preset: 'static',
    output: {
      // cartella reale nel repo
      publicDir: '../docs'
    },
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
