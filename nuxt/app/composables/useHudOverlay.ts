import { ref } from 'vue'

/**
 * @description Logica generica per un overlay HUD semplice (gomme, settori)
 * renderizzato in una finestra Electron dedicata e pilotato dalla pagina dev
 * "Test HUD" (PIP-175). Volutamente NON riusa gli `useOverlay*` del training,
 * che portano parametri specifici di quel sistema (fasi, preset, resize a due
 * fasi). Qui serve solo: drag/placement, sync dimensione single-phase,
 * click-through per-finestra, lettura settings.
 *
 * Nessun hook di lifecycle interno: la pagina chiama `start(el)` in onMounted e
 * `stop()` in onBeforeUnmount. Cosi' il composable resta testabile sotto vitest
 * (node) senza un'istanza di componente montata.
 *
 * @param overlayId - id dell'overlay ('tyres' | 'sectors').
 * @param getApi - factory che ritorna l'API Electron, o null fuori da Electron.
 */
export function useHudOverlay(overlayId: string, getApi: () => any | null) {
  const isElectron = ref(false)
  const isPlacing = ref(false)
  let resizeObserver: ResizeObserver | null = null
  let surfaceEl: HTMLElement | null = null

  function api(): any | null {
    return getApi()
  }

  async function loadSettings(): Promise<{ enabled: boolean; bounds: unknown } | null> {
    const bridge = api()
    if (!bridge?.hudOverlayGetSettings) return null
    return bridge.hudOverlayGetSettings(overlayId)
  }

  // Click-through: ignore=true => i click passano al gioco; false => la finestra
  // li cattura (necessario per trascinare durante il placement).
  function setPassthrough(ignore: boolean): void {
    api()?.hudOverlaySetMousePassthrough?.(overlayId, ignore)
  }

  function requestSize(size: { width: number; height: number }): void {
    if (!size || size.width <= 0 || size.height <= 0) return
    api()?.hudOverlaySetSize?.(overlayId, { width: Math.ceil(size.width), height: Math.ceil(size.height) })
  }

  function enterPlacement(): void {
    isPlacing.value = true
    // Durante il drag la finestra deve ricevere il mouse.
    setPassthrough(false)
  }

  async function confirmPlacement(): Promise<void> {
    await api()?.hudOverlayConfirmPlacement?.(overlayId)
    isPlacing.value = false
    // Tornato in visualizzazione: di nuovo click-through verso il gioco.
    setPassthrough(true)
  }

  // Hover sulla card fuori dal placement: cattura il mouse per eventuali
  // interazioni, poi torna click-through all'uscita.
  function onSurfaceEnter(): void {
    if (!isPlacing.value) setPassthrough(false)
  }

  function onSurfaceLeave(): void {
    if (!isPlacing.value) setPassthrough(true)
  }

  function measureAndSync(): void {
    if (!surfaceEl) return
    const rect = surfaceEl.getBoundingClientRect()
    requestSize({ width: rect.width, height: rect.height })
  }

  /**
   * @description Da chiamare in onMounted con l'elemento della card. Avvia il
   * sync dimensione (ResizeObserver) e imposta il click-through iniziale.
   */
  function start(el: HTMLElement | null): void {
    isElectron.value = !!api()
    surfaceEl = el
    if (!isElectron.value || !el) return
    setPassthrough(true)
    measureAndSync()
    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(() => measureAndSync())
      resizeObserver.observe(el)
    }
  }

  function stop(): void {
    if (resizeObserver) {
      resizeObserver.disconnect()
      resizeObserver = null
    }
    surfaceEl = null
  }

  return {
    isElectron,
    isPlacing,
    loadSettings,
    setPassthrough,
    requestSize,
    enterPlacement,
    confirmPlacement,
    onSurfaceEnter,
    onSurfaceLeave,
    start,
    stop,
  }
}
