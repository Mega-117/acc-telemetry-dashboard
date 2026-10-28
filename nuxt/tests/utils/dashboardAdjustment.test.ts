import { describe, expect, it, vi } from 'vitest'
import { computed, effectScope, nextTick, ref } from 'vue'
import { useDashboardAdjustment } from '~/composables/useDashboardAdjustment'
import {
  activeDashboardAdjustment,
  DASHBOARD_ADJUSTMENT_HOLD_MS,
  EMPTY_DASHBOARD_ADJUSTMENT,
  trackDashboardAdjustment,
  type DashboardAdjustableValues,
} from '~/utils/dashboardAdjustment'
import type { DashboardPresentation } from '~/utils/dashboardPresentation'

const base: DashboardAdjustableValues = { tc: '5', tc2: '5', abs: '5', map: '3', bb: '65.0' }

describe('dashboardAdjustment (ACC Drive info box, 1.5 s)', () => {
  it('never lights a box on the first live sample', () => {
    const memory = trackDashboardAdjustment(EMPTY_DASHBOARD_ADJUSTMENT, base, true, 1000)
    expect(activeDashboardAdjustment(memory, 1000)).toBeNull()
  })

  it('lights the changed box for exactly the hold time', () => {
    let memory = trackDashboardAdjustment(EMPTY_DASHBOARD_ADJUSTMENT, base, true, 1000)
    memory = trackDashboardAdjustment(memory, { ...base, bb: '64.8' }, true, 2000)
    expect(activeDashboardAdjustment(memory, 2000)).toBe('bb')
    expect(activeDashboardAdjustment(memory, 2000 + DASHBOARD_ADJUSTMENT_HOLD_MS - 1)).toBe('bb')
    expect(activeDashboardAdjustment(memory, 2000 + DASHBOARD_ADJUSTMENT_HOLD_MS)).toBeNull()
    // A later change moves the highlight and restarts the hold.
    memory = trackDashboardAdjustment(memory, { ...base, bb: '64.8', tc: '4' }, true, 2500)
    expect(activeDashboardAdjustment(memory, 3900)).toBe('tc')
  })

  it('keeps the same memory when nothing changes', () => {
    const memory = trackDashboardAdjustment(EMPTY_DASHBOARD_ADJUSTMENT, base, true, 1000)
    expect(trackDashboardAdjustment(memory, { ...base }, true, 1100)).toBe(memory)
  })

  it('ignores data appearing or vanishing and several values changing at once', () => {
    let memory = trackDashboardAdjustment(EMPTY_DASHBOARD_ADJUSTMENT, { ...base, map: '-' }, true, 1000)
    memory = trackDashboardAdjustment(memory, base, true, 1100)
    expect(activeDashboardAdjustment(memory, 1100)).toBeNull()
    memory = trackDashboardAdjustment(memory, { ...base, tc: '2', abs: '2' }, true, 1200)
    expect(activeDashboardAdjustment(memory, 1200)).toBeNull()
    memory = trackDashboardAdjustment(memory, { ...base, tc: '2', abs: '2', bb: '--.-' }, true, 1300)
    expect(activeDashboardAdjustment(memory, 1300)).toBeNull()
  })

  it('resets for the spectator view and stale telemetry', () => {
    let memory = trackDashboardAdjustment(EMPTY_DASHBOARD_ADJUSTMENT, base, true, 1000)
    memory = trackDashboardAdjustment(memory, { ...base, tc: '4' }, true, 1100)
    memory = trackDashboardAdjustment(memory, { ...base, tc: '4' }, false, 1200)
    expect(memory).toBe(EMPTY_DASHBOARD_ADJUSTMENT)
    memory = trackDashboardAdjustment(memory, { ...base, tc: '3' }, true, 1300)
    expect(activeDashboardAdjustment(memory, 1300)).toBeNull()
  })
})

describe('useDashboardAdjustment', () => {
  it('feeds the model and clears the highlight with one timer', async () => {
    vi.useFakeTimers()
    let now = 1000
    const values = ref({ ...base })
    const model = computed(() => ({
      tractionControl: values.value.tc, tractionControl2: values.value.tc2, abs: values.value.abs,
      engineMap: values.value.map, brakeBias: values.value.bb,
    }) as DashboardPresentation)
    const enabled = ref(true)
    const scope = effectScope()
    const adjustment = scope.run(() => useDashboardAdjustment(model, enabled, () => now))!
    expect(adjustment.active.value).toBeNull()

    now = 2000
    values.value = { ...base, abs: '4' }
    await nextTick()
    expect(adjustment.active.value).toBe('abs')

    now = 2000 + DASHBOARD_ADJUSTMENT_HOLD_MS
    vi.advanceTimersByTime(DASHBOARD_ADJUSTMENT_HOLD_MS)
    expect(adjustment.active.value).toBeNull()

    now = 5000
    values.value = { ...base, abs: '3' }
    await nextTick()
    expect(adjustment.active.value).toBe('abs')
    enabled.value = false
    await nextTick()
    expect(adjustment.active.value).toBeNull()

    scope.stop()
    vi.useRealTimers()
  })
})
