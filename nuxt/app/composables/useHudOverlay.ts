import { ref } from 'vue'

export const HUD_SCALE_MIN = 0.6
export const HUD_SCALE_MAX = 1.6
export const HUD_SCALE_DEFAULT = 1

function clampScale(value: unknown): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return HUD_SCALE_DEFAULT
  return Math.min(Math.max(n, HUD_SCALE_MIN), HUD_SCALE_MAX)
}

/**
 * @description Stato di un overlay HUD semplice (gomme, settori) renderizzato in
 * una finestra Electron dedicata (PIP-175). La dimensione è una SCALA continua
 * (slider) decisa lato Electron: la finestra = base × scala, qui si applica la
 * stessa scala al contenuto (`--hud-scale`). Lo stato è guidato dagli eventi
 * push del main:
 *  - `scale`: fattore di scala corrente (0.6–1.6).
 *  - `isPlacing`: modalità posizionamento globale attiva (drag finestra).
 *
 * Niente hook di lifecycle interni (la pagina chiama `start()`/`stop()`).
 *
 * @param overlayId - id dell'overlay ('tyres' | 'sectors').
 * @param getApi - factory che ritorna l'API Electron, o null fuori da Electron.
 */
export function useHudOverlay(overlayId: string, getApi: () => any | null) {
  const isElectron = ref(false)
  const isPlacing = ref(false)
  const scale = ref<number>(HUD_SCALE_DEFAULT)
  let unsubscribers: Array<() => void> = []

  function api(): any | null {
    return getApi()
  }

  async function loadSettings(): Promise<{ enabled: boolean; locked: boolean; scale: number; bounds: unknown } | null> {
    const bridge = api()
    if (!bridge?.hudOverlayGetSettings) return null
    const settings = await bridge.hudOverlayGetSettings(overlayId)
    if (settings?.scale !== undefined) scale.value = clampScale(settings.scale)
    return settings ?? null
  }

  /**
   * @description Da chiamare in onMounted. Imposta la scala iniziale (dalla query
   * `?scale=`) e si iscrive agli eventi push del main per scala e posizionamento.
   */
  function start(initialScale?: unknown): void {
    isElectron.value = !!api()
    if (initialScale !== undefined && initialScale !== null && initialScale !== '') {
      scale.value = clampScale(initialScale)
    }
    const bridge = api()
    if (!bridge) return
    if (typeof bridge.onHudOverlayPlacement === 'function') {
      unsubscribers.push(bridge.onHudOverlayPlacement((active: boolean) => {
        isPlacing.value = !!active
      }))
    }
    if (typeof bridge.onHudOverlayScale === 'function') {
      unsubscribers.push(bridge.onHudOverlayScale((value: unknown) => {
        scale.value = clampScale(value)
      }))
    }
  }

  function stop(): void {
    for (const off of unsubscribers) {
      try { off() } catch { /* listener già rimosso */ }
    }
    unsubscribers = []
  }

  return { isElectron, isPlacing, scale, loadSettings, start, stop }
}
