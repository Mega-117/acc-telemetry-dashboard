import { computed, onScopeDispose, ref, watch, type Ref } from 'vue'
import { usePresentationActivity } from './usePresentationVisibility'
import { completedLapHoldSample } from '~/utils/completedLapHoldSample'
import type { FastOverlayState } from '~/composables/useFastStatePoller'
import {
  advanceCompletedLapHold,
  createCompletedLapHoldState,
  isCompletedLapHeld,
} from '~/utils/completedLapHold'

function monotonicNow(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}


export function useCompletedLapHold(fastState: Ref<FastOverlayState>) {
  const holdState = ref(createCompletedLapHoldState())
  const clockMs = ref(monotonicNow())
  let releaseTimer: ReturnType<typeof setTimeout> | null = null

  function clearReleaseTimer() {
    if (releaseTimer !== null) {
      clearTimeout(releaseTimer)
      releaseTimer = null
    }
  }

  function refresh() {
    const nowMs = monotonicNow()
    clockMs.value = nowMs
    holdState.value = advanceCompletedLapHold(holdState.value, completedLapHoldSample(fastState.value), nowMs)

    clearReleaseTimer()
    if (holdState.value.holdUntilMs !== null) {
      releaseTimer = setTimeout(refresh, Math.max(0, holdState.value.holdUntilMs - nowMs))
    }
  }

  const activity = usePresentationActivity(refresh, clearReleaseTimer)
  activity.start()
  watch(fastState, () => { if (activity.visible.value) refresh() }, { deep: true })
  onScopeDispose(clearReleaseTimer)

  const holding = computed(() => isCompletedLapHeld(holdState.value, clockMs.value))
  const displayedLapTimeMs = computed(() => (
    holding.value ? holdState.value.heldLapTimeMs : fastState.value.info?.currentLapTimeMs ?? null
  ))
  const displayedLapValid = computed(() => (
    holding.value ? holdState.value.heldLapValid : fastState.value.info?.lapValid ?? null
  ))
  const heldLap = computed(() => (
    holding.value
      && holdState.value.heldLapTimeMs !== null
      && holdState.value.heldLapValid !== null
      && holdState.value.holdStartedAtMs !== null
      ? {
          timeMs: holdState.value.heldLapTimeMs,
          valid: holdState.value.heldLapValid,
          startedAtMs: holdState.value.holdStartedAtMs,
        }
      : null
  ))

  return {
    holding,
    heldLap,
    displayedLapTimeMs,
    displayedLapValid,
  }
}
