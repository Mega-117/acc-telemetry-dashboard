import { requireDesktopUiCompatibility } from '~/services/runtime/desktopUiCompatibility'

export default defineNuxtPlugin(async () => {
  const bridge = (window as Window & { accLocalIdentity?: { getDesktopUiContract?: () => Promise<number> } }).accLocalIdentity
  await requireDesktopUiCompatibility(Number(useRuntimeConfig().public.desktopUiContract), bridge)
})
