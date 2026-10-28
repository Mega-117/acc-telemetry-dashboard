import { computed, onScopeDispose, ref, shallowRef, watch, type Ref } from 'vue'
import type { DashboardPresentation } from '~/utils/dashboardPresentation'
import {
  activeDashboardAdjustment,
  DASHBOARD_ADJUSTMENT_HOLD_MS,
  EMPTY_DASHBOARD_ADJUSTMENT,
  trackDashboardAdjustment,
  type DashboardAdjustableKey,
  type DashboardAdjustmentMemory,
} from '~/utils/dashboardAdjustment'

/**
 * Feeds the Dashboard model to the adjustment memory and clears the highlight after the hold time
 * with one timer (no polling). `enabled` is false for the spectator view and stale telemetry.
 */
export function useDashboardAdjustment(
  model: Readonly<Ref<DashboardPresentation>>,
  enabled: Readonly<Ref<boolean>>,
  now: () => number = () => Date.now(),
) {
  const memory = shallowRef<DashboardAdjustmentMemory>(EMPTY_DASHBOARD_ADJUSTMENT)
  const clock = ref(now())
  let timer: ReturnType<typeof setTimeout> | null = null

  function clearTimer() {
    if (timer !== null) clearTimeout(timer)
    timer = null
  }

  watch(
    () => [model.value.tractionControl, model.value.tractionControl2, model.value.abs,
      model.value.engineMap, model.value.brakeBias, enabled.value] as const,
    ([tc, tc2, abs, map, bb, live]) => {
      const nowMs = now()
      const next = trackDashboardAdjustment(memory.value, { tc, tc2, abs, map, bb }, live, nowMs)
      if (next === memory.value) return
      const started = next.key !== null && next.changedAtMs !== memory.value.changedAtMs
      memory.value = next
      clock.value = nowMs
      if (!started) return
      clearTimer()
      timer = setTimeout(() => {
        timer = null
        clock.value = now()
      }, DASHBOARD_ADJUSTMENT_HOLD_MS)
    },
    { immediate: true },
  )

  onScopeDispose(clearTimer)

  const active = computed<DashboardAdjustableKey | null>(() => activeDashboardAdjustment(memory.value, clock.value))
  return { active }
}
