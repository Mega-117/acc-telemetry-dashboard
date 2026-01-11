export default defineNuxtConfig({
  ssr: false,

  app: {
    // URL pubblico ESATTO dove vive Nuxt
    baseURL: '/acc-telemetry-dashboard/docs/',
    buildAssetsDir: 'assets'
  },

  nitro: {
    preset: 'static',
    output: {
      // cartella reale nel repo
      publicDir: '../docs'
    }
  }
})
