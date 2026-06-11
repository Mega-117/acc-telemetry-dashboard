import { nextTick } from 'vue'
import type { Ref } from 'vue'

export type OverlaySizePreset = 'launcher' | 'placement' | 'select' | 'session' | 'expired' | 'completed'
export type OverlaySize = { width: number; height: number }

const OVERLAY_WORK_AREA_SIZE: OverlaySize = { width: 472, height: 768 }
const OVERLAY_SURFACE_PADDING = 10
const OVERLAY_SURFACE_SELECTOR = '.overlay-card, .launcher-tools, .placement-work-area'

/**
 * @description Synchronises the Electron overlay window dimensions with the current
 * OverlaySizePreset. Uses a ResizeObserver on the root element to detect DOM changes and
 * debounces resize requests via requestAnimationFrame to avoid redundant IPC calls.
 * @param getApi - Factory that returns the current Electron API instance, or null.
 * @param getCurrentPreset - Returns the active size preset name.
 * @param overlayRoot - Ref to the root HTMLElement whose measured size is sent to Electron.
 * @returns Object with scheduleOverlaySizeSync and destroyOverlaySizeObserver functions.
 */
export function useOverlaySize(
  getApi: () => any | null,
  getCurrentPreset: () => OverlaySizePreset,
  overlayRoot: Ref<HTMLElement | null>,
) {
  let overlaySizeFrame: number | null = null
  let overlaySizeRetry: ReturnType<typeof setTimeout> | null = null
  let lastRequest: { preset: OverlaySizePreset; width?: number; height?: number } | null = null
  let resizeObserver: ResizeObserver | null = null

  function shouldSkip(req: { preset: OverlaySizePreset; width?: number; height?: number }) {
    if (lastRequest
      && lastRequest.preset === req.preset
      && lastRequest.width === req.width
      && lastRequest.height === req.height) return true
    lastRequest = req
    return false
  }

  // Geometria dinamica: la finestra Electron si stringe attorno alla superficie
  // misurata (comportamento "da browser"); il placement resta a work area piena.
  function measureOverlaySize(preset: OverlaySizePreset): OverlaySize {
    if (preset === 'placement') return OVERLAY_WORK_AREA_SIZE
    const surface = overlayRoot.value?.querySelector(OVERLAY_SURFACE_SELECTOR) as HTMLElement | null
    if (!surface) return OVERLAY_WORK_AREA_SIZE
    const rect = surface.getBoundingClientRect()
    if (!rect.width || !rect.height) return OVERLAY_WORK_AREA_SIZE
    // scrollHeight = altezza desiderata dal contenuto anche quando max-height la
    // clampa alla finestra corrente (altrimenti la misura insegue se stessa e la
    // finestra non cresce mai). +2 compensa i bordi esclusi da scrollHeight.
    const desiredHeight = Math.max(rect.height, surface.scrollHeight + 2)
    return {
      width: Math.min(Math.ceil(rect.width) + OVERLAY_SURFACE_PADDING * 2, OVERLAY_WORK_AREA_SIZE.width),
      height: Math.ceil(desiredHeight) + OVERLAY_SURFACE_PADDING * 2,
    }
  }

  async function applyOverlaySize(preset: OverlaySizePreset = getCurrentPreset()) {
    await nextTick()
    const size = measureOverlaySize(preset)
    const req = { preset, width: size.width, height: size.height }
    if (shouldSkip(req)) return
    await getApi()?.trainingOverlaySetSize?.(req)
  }

  function scheduleOverlaySizeSync(retries = 4) {
    if (typeof window === 'undefined') return
    if (overlaySizeFrame !== null) window.cancelAnimationFrame(overlaySizeFrame)
    if (overlaySizeRetry) { clearTimeout(overlaySizeRetry); overlaySizeRetry = null }
    overlaySizeFrame = window.requestAnimationFrame(() => {
      overlaySizeFrame = null
      void applyOverlaySize()
      if (retries > 0) {
        overlaySizeRetry = setTimeout(() => { overlaySizeRetry = null; scheduleOverlaySizeSync(retries - 1) }, 90)
      }
    })
  }

  function disconnectResizeObserver() {
    resizeObserver?.disconnect()
    resizeObserver = null
  }

  function connectResizeObserver() {
    if (typeof window === 'undefined' || typeof ResizeObserver === 'undefined') return
    const el = overlayRoot.value
    if (!el) return
    disconnectResizeObserver()
    resizeObserver = new ResizeObserver(() => scheduleOverlaySizeSync(1))
    resizeObserver.observe(el)
  }

  function cleanup() {
    if (typeof window !== 'undefined' && overlaySizeFrame !== null) window.cancelAnimationFrame(overlaySizeFrame)
    if (overlaySizeRetry) clearTimeout(overlaySizeRetry)
    disconnectResizeObserver()
  }

  return { applyOverlaySize, scheduleOverlaySizeSync, connectResizeObserver, disconnectResizeObserver, cleanup }
}
