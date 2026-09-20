import { inject, type InjectionKey } from 'vue'

// Existing overlay routes also run independently; the surface supplies a bridge
// only when the same components are mounted as regions in its renderer.
export const OVERLAY_REGION_API: InjectionKey<() => any> = Symbol('overlay-region-api')

export function useOverlayRegionApi(): () => any {
  return inject(OVERLAY_REGION_API, () => typeof window === 'undefined'
    ? null
    : (window as any).electronAPI ?? null)
}
