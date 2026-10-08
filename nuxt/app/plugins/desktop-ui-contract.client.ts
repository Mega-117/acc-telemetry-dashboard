import { requireDesktopUiCompatibility } from '~/services/runtime/desktopUiCompatibility'

export default defineNuxtPlugin(async (nuxtApp) => {
  const bridge = (window as Window & { accLocalIdentity?: {
    getDesktopUiContract?: () => Promise<number>
    desktopUiReady?: () => Promise<boolean>
  } }).accLocalIdentity
  await requireDesktopUiCompatibility(Number(useRuntimeConfig().public.desktopUiContract), bridge)
  nuxtApp.hook('app:mounted', () => { void bridge?.desktopUiReady?.().catch(() => {}) })
})
