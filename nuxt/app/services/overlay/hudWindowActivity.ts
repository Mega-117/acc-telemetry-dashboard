// Attivita' della finestra HUD (PIP-427).
//
// Un HUD nascosto resta caricato per un rientro in pista immediato, ma non deve
// lavorare: il polling continuo teneva alto l'heap di ogni finestra anche quando
// nessuno la guardava. Electron tiene gli HUD con backgroundThrottling:false,
// quindi la Page Visibility API resta 'visible': lo stato arriva dal main.
//
// Unica fonte per tutti i poller della finestra. Fuori dagli HUD (dashboard,
// Ctrl+K, runtime audio, browser) il main non invia nulla e lo stato resta attivo.

type ActivityListener = (active: boolean) => void
type ActivityApi = { onHudOverlayVisibility?: (callback: (visible: boolean) => void) => (() => void) | void } | null

let active = true
let subscribedApi: ActivityApi = null
const listeners = new Set<ActivityListener>()

export function isHudWindowActive(): boolean {
  return active
}

function setActive(next: boolean) {
  if (next === active) return
  active = next
  for (const listener of [...listeners]) listener(active)
}

/**
 * Notifica i cambi di attivita'. La sottoscrizione IPC e' una sola per finestra,
 * qualunque sia il numero di poller. Ritorna la funzione di rimozione.
 */
export function watchHudWindowActivity(getApi: () => ActivityApi, listener: ActivityListener): () => void {
  listeners.add(listener)
  const api = getApi()
  if (api && api !== subscribedApi && typeof api.onHudOverlayVisibility === 'function') {
    subscribedApi = api
    api.onHudOverlayVisibility(visible => setActive(visible !== false))
  }
  return () => { listeners.delete(listener) }
}

/** Solo per i test: riporta lo stato del modulo alla condizione iniziale. */
export function resetHudWindowActivityForTests() {
  active = true
  subscribedApi = null
  listeners.clear()
}
