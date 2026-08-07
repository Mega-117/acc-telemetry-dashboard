import { ref } from 'vue'
import { useOverlayInteractionContract } from '~/composables/useOverlayInteractionContract'

export interface HudOverlaySettings {
  enabled: boolean
  locked: boolean
  scale: number
  bounds: unknown
  showReference?: boolean
  showBest?: boolean
  showCurrentLap?: boolean
  deltaReference?: 'previousLap' | 'bestSector'
  variant?: 'classic' | 'advanced' | 'compact'
  electronicsReference?: boolean
  rpmReference?: boolean
  gearReference?: boolean
  speedDelta?: boolean
  fuelCriticalFlashEnabled?: boolean
  fuelCriticalLapsThreshold?: number
  showYellowFlag?: boolean
  showDelta?: boolean
  showStint?: boolean
  showQFuel?: boolean
  showFuelLeft?: boolean
  showIncidents?: boolean
  showGrip?: boolean
  showPitExitTraffic?: boolean
  showOptimal?: boolean
  showDamage?: boolean
  showTime?: boolean
  backgroundOpacity?: number
  topCars?: number
  carsAhead?: number
  carsBehind?: number
  showStintTimer?: boolean
  showCarNumber?: boolean
  showFastestLap?: boolean
  showLastLap?: boolean
  showLapProgressBar?: boolean
  showTurnNumber?: boolean
}

export const HUD_SCALE_MIN = 0.6
export const HUD_SCALE_MAX = 1.6
export const HUD_SCALE_DEFAULT = 1
export const HUD_SCALE_MIN_BY_OVERLAY: Readonly<Record<string, number>> = {
  tyres: 0.5,
  standings: 0.3,
}
export const HUD_SCALE_MAX_BY_OVERLAY: Readonly<Record<string, number>> = {
  standings: 3,
}
export const HUD_SCALE_DEFAULT_BY_OVERLAY: Readonly<Record<string, number>> = {
  standings: 0.8,
}

export function getHudOverlayScaleMin(overlayId: string): number {
  return HUD_SCALE_MIN_BY_OVERLAY[overlayId] ?? HUD_SCALE_MIN
}

export function getHudOverlayScaleMax(overlayId: string): number {
  return HUD_SCALE_MAX_BY_OVERLAY[overlayId] ?? HUD_SCALE_MAX
}

export function getHudOverlayScaleDefault(overlayId: string): number {
  return HUD_SCALE_DEFAULT_BY_OVERLAY[overlayId] ?? HUD_SCALE_DEFAULT
}

export interface HudOverlayInteractionDescriptor {
  surfaceSelector: string
  controlSelector: string
}

/**
 * Unica dichiarazione delle superfici native: aggiungere qui un futuro overlay
 * evita arbitri hover duplicati nelle singole pagine.
 */
export const HUD_OVERLAY_INTERACTIONS: Record<string, HudOverlayInteractionDescriptor> = {
  tyres: {
    surfaceSelector: '.hud-overlay__panel',
    controlSelector: '.hud-timed-pager__switcher',
  },
  sectors: {
    surfaceSelector: '.hud-overlay__panel',
    controlSelector: '[data-overlay-interactive]',
  },
  dashboard: {
    surfaceSelector: '.overlay-canvas',
    controlSelector: '',
  },
  info: {
    surfaceSelector: '.overlay-canvas',
    controlSelector: '',
  },
  standings: {
    surfaceSelector: '.overlay-canvas',
    controlSelector: '',
  },
}

export interface HudTransientViewportRequest {
  active: boolean
  key?: string
  minWidth?: number
  minHeight?: number
}

function clampScale(value: unknown, overlayId: string): number {
  const n = Number(value)
  if (!Number.isFinite(n)) return getHudOverlayScaleDefault(overlayId)
  return Math.min(Math.max(n, getHudOverlayScaleMin(overlayId)), getHudOverlayScaleMax(overlayId))
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
  const scale = ref<number>(getHudOverlayScaleDefault(overlayId))
  const settings = ref<HudOverlaySettings | null>(null)
  let unsubscribers: Array<() => void> = []

  function api(): any | null {
    return getApi()
  }

  const interactionContract = useOverlayInteractionContract({
    getApi,
    isForcedCapture: () => isPlacing.value,
  })
  const { pointerState } = interactionContract

  function startInteractionSurface(
    controlSelector?: string,
    surfaceSelector?: string,
  ): void {
    const declared = HUD_OVERLAY_INTERACTIONS[overlayId]
    interactionContract.start({
      surfaceSelector: surfaceSelector ?? declared?.surfaceSelector ?? '.hud-overlay__panel',
      controlSelector: controlSelector ?? declared?.controlSelector ?? '',
    })
  }

  function stopInteractionSurface(): void {
    interactionContract.stop()
  }

  async function loadSettings(): Promise<HudOverlaySettings | null> {
    const bridge = api()
    if (!bridge?.hudOverlayGetSettings) return null
    const loaded = await bridge.hudOverlayGetSettings(overlayId)
    settings.value = loaded ?? null
    if (loaded?.scale !== undefined) scale.value = clampScale(loaded.scale, overlayId)
    return settings.value
  }

  function setTransientViewport(request: HudTransientViewportRequest): Promise<unknown> | null {
    const bridge = api()
    if (!bridge?.hudOverlaySetTransientViewport) return null
    return bridge.hudOverlaySetTransientViewport(overlayId, request)
  }

  /**
   * @description Da chiamare in onMounted. Imposta la scala iniziale (dalla query
   * `?scale=`) e si iscrive agli eventi push del main per scala e posizionamento.
   */
  function start(initialScale?: unknown): void {
    isElectron.value = !!api()
    if (initialScale !== undefined && initialScale !== null && initialScale !== '') {
      scale.value = clampScale(initialScale, overlayId)
    }
    const bridge = api()
    if (!bridge) return
    if (typeof bridge.onHudOverlayPlacement === 'function') {
      unsubscribers.push(bridge.onHudOverlayPlacement((active: boolean) => {
        isPlacing.value = !!active
        interactionContract.refresh()
      }))
    }
    if (typeof bridge.onHudOverlayScale === 'function') {
      unsubscribers.push(bridge.onHudOverlayScale((value: unknown) => {
        scale.value = clampScale(value, overlayId)
      }))
    }
    if (typeof bridge.onHudOverlaySettings === 'function') {
      unsubscribers.push(bridge.onHudOverlaySettings((value: HudOverlaySettings) => {
        settings.value = value ?? null
        if (value?.scale !== undefined) scale.value = clampScale(value.scale, overlayId)
      }))
    }
  }


  function stop(): void {
    stopInteractionSurface()
    for (const off of unsubscribers) {
      try { off() } catch { /* listener già rimosso */ }
    }
    unsubscribers = []
  }

  return {
    isElectron,
    isPlacing,
    scale,
    settings,
    loadSettings,
    setTransientViewport,
    start,
    stop,
    startInteractionSurface,
    stopInteractionSurface,
    pointerState,
  }
}
