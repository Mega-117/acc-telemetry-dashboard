// Determina baseURL: '/' per dev locale, path completo per produzione
const isDev = process.env.NODE_ENV === 'development'
const baseURL = isDev ? '/' : '/acc-telemetry-dashboard/docs/'

export default defineNuxtConfig({
  ssr: false,

  // === COMPATIBILITÀ ===
  compatibilityDate: '2025-01-11',

  app: {
    // URL dinamico: locale vs produzione
    baseURL,
    buildAssetsDir: 'assets',

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

  nitro: {
    preset: 'static',
    output: {
      // cartella reale nel repo
      publicDir: '../docs'
    }
  }
})


