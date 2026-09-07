import { installWindowOpeningProbe, type WindowOpeningProbeApi } from '~/services/monitoring/windowOpeningProbe'

export default defineNuxtPlugin((nuxtApp) => {
  const probe = installWindowOpeningProbe((window as unknown as { electronAPI?: WindowOpeningProbeApi }).electronAPI)
  nuxtApp.hook('app:mounted', () => probe.mounted())
  window.addEventListener('pagehide', () => probe.dispose(), { once: true })
  if (import.meta.hot) import.meta.hot.dispose(() => probe.dispose())
})
