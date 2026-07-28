import { computed, onScopeDispose, ref, watch, type Ref } from 'vue'
import type { FastOverlayState } from '~/composables/useFastStatePoller'
import {
  advanceCompletedLapHold,
  createCompletedLapHoldState,
  isCompletedLapHeld,
} from '~/utils/completedLapHold'

function monotonicNow(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now()
}

function contextKey(state: FastOverlayState): string | null {
  const context = state.context
  if (!context) return null
  return JSON.stringify([
    context.track,
    context.car,
    context.sessionType,
    context.sessionIndex,
    context.sessionUid,
    context.serverId,
  ])
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
    const info = fastState.value.info
    holdState.value = advanceCompletedLapHold(holdState.value, {
      ready: fastState.value.isFresh && info !== null,
      contextKey: contextKey(fastState.value),
      lapsCompleted: info?.lapsCompleted ?? 0,
      lastLapTimeMs: info?.lastLapTimeMs ?? null,
      lastLapValid: info?.lastLapValid ?? null,
    }, nowMs)

    clearReleaseTimer()
    if (holdState.value.holdUntilMs !== null) {
      releaseTimer = setTimeout(refresh, Math.max(0, holdState.value.holdUntilMs - nowMs))
    }
  }

  watch(fastState, refresh, { deep: true, immediate: true })
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
