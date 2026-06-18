import { ref } from 'vue'

export type HudOverlayFormat = 'small' | 'medium' | 'large'

const FORMATS: HudOverlayFormat[] = ['small', 'medium', 'large']

function normalizeFormat(value: unknown): HudOverlayFormat {
  return FORMATS.includes(value as HudOverlayFormat) ? (value as HudOverlayFormat) : 'medium'
}

/**
 * @description Stato di un overlay HUD semplice (gomme, settori) renderizzato in
 * una finestra Electron dedicata (PIP-175). La dimensione è decisa dal FORMATO
 * (small/medium/large) lato Electron; qui il composable espone solo lo stato
 * reattivo guidato dagli eventi push del main:
 *  - `format`: formato corrente (per scalare i font).
 *  - `isPlacing`: modalità posizionamento globale attiva (drag finestra).
 *
 * Niente hook di lifecycle interni (la pagina chiama `start()`/`stop()`), così è
 * testabile sotto vitest senza un componente montato.
 *
 * @param overlayId - id dell'overlay ('tyres' | 'sectors').
 * @param getApi - factory che ritorna l'API Electron, o null fuori da Electron.
 */
export function useHudOverlay(overlayId: string, getApi: () => any | null) {
  const isElectron = ref(false)
  const isPlacing = ref(false)
  const format = ref<HudOverlayFormat>('medium')
  let unsubscribers: Array<() => void> = []

  function api(): any | null {
    return getApi()
  }

  async function loadSettings(): Promise<{ enabled: boolean; locked: boolean; format: HudOverlayFormat; bounds: unknown } | null> {
    const bridge = api()
    if (!bridge?.hudOverlayGetSettings) return null
    const settings = await bridge.hudOverlayGetSettings(overlayId)
    if (settings?.format) format.value = normalizeFormat(settings.format)
    return settings ?? null
  }

  /**
   * @description Da chiamare in onMounted. Imposta il formato iniziale (dalla
   * query `?format=`) e si iscrive agli eventi push del main per formato e
   * modalità posizionamento.
   */
  function start(initialFormat?: unknown): void {
    isElectron.value = !!api()
    if (initialFormat) format.value = normalizeFormat(initialFormat)
    const bridge = api()
    if (!bridge) return
    if (typeof bridge.onHudOverlayPlacement === 'function') {
      unsubscribers.push(bridge.onHudOverlayPlacement((active: boolean) => {
        isPlacing.value = !!active
      }))
    }
    if (typeof bridge.onHudOverlayFormat === 'function') {
      unsubscribers.push(bridge.onHudOverlayFormat((value: unknown) => {
        format.value = normalizeFormat(value)
      }))
    }
  }

  function stop(): void {
    for (const off of unsubscribers) {
      try { off() } catch { /* listener già rimosso */ }
    }
    unsubscribers = []
  }

  return { isElectron, isPlacing, format, loadSettings, start, stop }
}
