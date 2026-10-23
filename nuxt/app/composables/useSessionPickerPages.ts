import { ref } from 'vue'
import type { SessionDocument } from '~/types/telemetry'
import type { SessionsPageSnapshot } from '~/composables/useTelemetryGateway'

// PIP-591 (X-A05-23): pagine del selettore di confronto. Pista e gioco si filtrano dopo la
// lettura, quindi una sola pagina poteva nascondere le sessioni confrontabili piu' vecchie.
// La prima pagina resta quella di sempre (stesso costo); `loadMore` legge la successiva solo
// su richiesta, senza limite. Il gioco non va nella query: il pager lo filtra nel client e
// leggerebbe l'archivio intero.
export const SESSION_PICKER_PAGE_SIZE = 50

type LoadPage = (page: number, pageSize: number, reset: boolean) => Promise<SessionsPageSnapshot>

export function useSessionPickerPages(loadPage: LoadPage, isOpen: () => boolean) {
  const sessions = ref<SessionDocument[]>([])
  const loading = ref(false)
  const hasMore = ref(false)
  const loadError = ref(false)
  const loadedPage = ref(0)
  // Una riapertura rapida non mescola le pagine della lettura precedente.
  let generation = 0

  async function load(page: number) {
    const current = ++generation
    loading.value = true
    try {
      const result = await loadPage(page, SESSION_PICKER_PAGE_SIZE, page === 1)
      if (!isOpen() || current !== generation) return
      // Il pager assorbe gli errori e restituisce []: conta solo la pagina davvero raggiunta,
      // cosi' una pagina fallita si riprova invece di essere saltata.
      if (page > 1 && result.state.currentPage !== page) throw new Error('Pagina non caricata')
      loadError.value = false
      sessions.value = page === 1 ? result.sessions : [...sessions.value, ...result.sessions]
      loadedPage.value = page
      hasMore.value = result.state.hasNext === true
    } catch (e) {
      if (current !== generation) return
      console.error('[SESSION_PICKER] Failed to load sessions page:', e)
      loadError.value = true
      if (page === 1) sessions.value = []
    } finally {
      if (current === generation) loading.value = false
    }
  }

  function loadMore() {
    if (loading.value || !hasMore.value) return
    void load(loadedPage.value + 1)
  }

  function reset() {
    generation += 1
    sessions.value = []
    hasMore.value = false
    loadError.value = false
    loadedPage.value = 0
  }

  return { sessions, loading, hasMore, loadError, loadFirst: () => load(1), loadMore, reset }
}
