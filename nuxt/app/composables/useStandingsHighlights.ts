import { ref, watch, type Ref } from 'vue'
import type {
  StandingsHighlightMap,
  StandingsStateEnvelope,
} from '~/services/overlay/standingsPresentation'
import { createStandingsHighlightTracker } from '~/services/overlay/standingsHighlightTracker'

/** Bind the pure standings highlight tracker to bridge state and its clock. */
export function useStandingsHighlights(
  state: Ref<StandingsStateEnvelope>,
  nowMs: Ref<number>,
) {
  const tracker = createStandingsHighlightTracker()
  const highlights = ref<StandingsHighlightMap>({})

  const stopWatcher = watch([state, nowMs], () => {
    if (state.value.status !== 'available' || !state.value.snapshot) {
      tracker.reset()
      highlights.value = {}
      return
    }
    highlights.value = tracker.update(state.value.snapshot, nowMs.value)
  }, { immediate: true })

  function reset(): void {
    tracker.reset()
    highlights.value = {}
  }

  function stop(): void {
    stopWatcher()
    reset()
  }

  return { highlights, reset, stop }
}
