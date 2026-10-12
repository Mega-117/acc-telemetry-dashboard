import { computed, type Ref } from 'vue'
import { commonContextKey } from '~/services/telemetry/commonLive'
import type { FastOverlayState } from '~/types/liveTelemetry'

/** Display only. Never feed this retained value into commands or announcements. */
export function useHudPresentationMemory<T>(value: Readonly<Ref<T>>, source: Readonly<Ref<FastOverlayState>>) {
  let previous: { key: string | null; value: T } | null = null
  return computed(() => {
    const current = source.value
    const key = commonContextKey(current.commonLive)
    const fresh = current.commonLive?.fresh ?? current.isFresh
    if (current.isFresh && current.isLive) previous = { key, value: value.value }
    if (previous && previous.key === key && !fresh) return previous.value
    if (previous?.key !== key || (fresh && !current.isLive)) previous = null
    return value.value
  })
}
