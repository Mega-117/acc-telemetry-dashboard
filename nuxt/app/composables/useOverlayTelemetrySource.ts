import { computed, ref, watch } from 'vue'
import { useFastStatePoller } from '~/composables/useFastStatePoller'
import { useStandingsState } from '~/composables/useStandingsState'
import {
  emptyFocusedInfoDeltaAccumulator,
  routeOverlayTelemetry,
  trackFocusedInfoDelta,
} from '~/services/overlay/spectatorTelemetry'

const FOCUSED_BRIDGE = {
  pull: 'getFocusedCarState',
  subscribe: 'onFocusedCarStateUpdate',
}

export const FOCUSED_CAR_FEED_INTERVAL_MS = 250

/**
 * Single telemetry source selector for data HUDs.
 *
 * Local shared-memory physics remains authoritative while ACC focuses the
 * player's car. A validated Broadcasting UDP envelope switches only the fields
 * proven for another focused car; unsupported physics is masked by the pure
 * adapter instead of leaking the local driver's values.
 */
export function useOverlayTelemetrySource(
  getApi: () => any | null,
  focusedPollIntervalMs = 1000,
) {
  const local = useFastStatePoller(getApi)
  const focused = useStandingsState(getApi, focusedPollIntervalMs, FOCUSED_BRIDGE)
  const focusWasRemote = ref(false)

  watch(focused.state, (value) => {
    if (value.status !== 'available' || !value.snapshot) return
    const localIndex = Number(value.snapshot.session.local_car_index)
    const focusedIndex = Number(value.snapshot.session.focused_car_index)
    if (!Number.isInteger(localIndex) || localIndex < 0
      || !Number.isInteger(focusedIndex) || focusedIndex < 0) return
    focusWasRemote.value = focusedIndex !== localIndex
  }, { immediate: true })

  const routed = computed(() => routeOverlayTelemetry(
    local.fastState.value, focused.state.value, focusWasRemote.value))
  const focusedDeltaAccumulator = ref(emptyFocusedInfoDeltaAccumulator())
  const focusedDelta = ref<ReturnType<typeof trackFocusedInfoDelta>['delta'] | null>(null)

  watch(routed, (value) => {
    if (value.source !== 'focused') {
      focusedDeltaAccumulator.value = emptyFocusedInfoDeltaAccumulator()
      focusedDelta.value = null
      return
    }
    const tracked = trackFocusedInfoDelta(
      focusedDeltaAccumulator.value,
      focused.state.value,
      value.focusedCar,
    )
    focusedDeltaAccumulator.value = tracked.accumulator
    focusedDelta.value = tracked.delta
  }, { immediate: true, flush: 'sync' })

  const fastState = computed(() => {
    const value = routed.value
    if (value.source !== 'focused' || !value.fastState.info || !focusedDelta.value) {
      return value.fastState
    }
    return {
      ...value.fastState,
      info: { ...value.fastState.info, delta: focusedDelta.value },
    }
  })
  const source = computed(() => routed.value.source)
  const sectorHud = computed(() => routed.value.sectorHud)
  const focusedCar = computed(() => routed.value.focusedCar)

  function startFastStatePolling(): void {
    local.startFastStatePolling()
    focused.start()
  }

  function stopFastStatePolling(): void {
    focused.stop()
    local.stopFastStatePolling()
    focusedDeltaAccumulator.value = emptyFocusedInfoDeltaAccumulator()
    focusedDelta.value = null
  }

  return {
    fastState,
    source,
    sectorHud,
    focusedCar,
    startFastStatePolling,
    stopFastStatePolling,
  }
}
