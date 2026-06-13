import { watch, type Ref } from 'vue'
import { canUseDevTools } from '~/utils/devToolsAccess'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'

// Aspetta che lo stato auth si stabilizzi (max 4s) per non sbagliare il gate
// admin durante l'inizializzazione di Firebase.
function waitForAuthSettled(isLoading: Ref<boolean>): Promise<void> {
  return new Promise((resolve) => {
    const timeout = setTimeout(() => { stop(); resolve() }, 4000)
    const stop = watch(isLoading, (loading) => {
      if (!loading) { clearTimeout(timeout); stop(); resolve() }
    }, { immediate: true })
  })
}

export default defineNuxtRouteMiddleware(async () => {
  // 1) Ambiente: gli strumenti dev esistono solo in locale/dev, mai in
  //    produzione (host reale -> redirect, la pagina non è raggiungibile).
  const hostname = typeof window !== 'undefined'
    ? window.location.hostname
    : useRequestURL().hostname

  if (!canUseDevTools(hostname)) {
    return navigateTo('/panoramica')
  }

  // 2) Ruolo: solo admin (PIP-109). L'auth vive sul client; in SSR/prerender
  //    lasciamo passare e il gate vero scatta all'idratazione.
  if (import.meta.server) return

  const { isAdmin, isLoading } = useFirebaseAuth()
  if (isLoading.value) await waitForAuthSettled(isLoading)
  if (!isAdmin.value) {
    return navigateTo('/panoramica')
  }
})
