import { effectScope, nextTick, ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { useCompletedLapHold } from '~/composables/useCompletedLapHold'

function state(overrides: Record<string, unknown> = {}) {
  return {
    isFresh: true,
    context: {
      track: 'spa',
      car: 'mercedes_amg_gt3_evo',
      sessionType: 0,
      sessionIndex: 1,
      sessionUid: 'spa-replay',
      serverId: null,
    },
    info: {
      lapsCompleted: 0,
      currentLapTimeMs: 10_000,
      lastLapTimeMs: null,
      lapValid: true,
      lastLapValid: null,
    },
    ...overrides,
  } as any
}

describe('useCompletedLapHold', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('continua a ricevere il timer nuovo e lo mostra allo scadere dei cinque secondi', async () => {
    vi.useFakeTimers()
    const fastState = ref(state())
    const scope = effectScope()
    const presentation = scope.run(() => useCompletedLapHold(fastState))!

    fastState.value = state({
      info: {
        lapsCompleted: 1,
        currentLapTimeMs: 50,
        lastLapTimeMs: 140_000,
        lapValid: true,
        lastLapValid: false,
      },
    })
    await nextTick()
    expect(presentation.displayedLapTimeMs.value).toBe(140_000)
    expect(presentation.displayedLapValid.value).toBe(false)

    fastState.value = state({
      info: {
        lapsCompleted: 1,
        currentLapTimeMs: 2_500,
        lastLapTimeMs: 140_000,
        lapValid: true,
        lastLapValid: false,
      },
    })
    await nextTick()
    expect(presentation.displayedLapTimeMs.value).toBe(140_000)

    await vi.advanceTimersByTimeAsync(5_000)
    expect(presentation.displayedLapTimeMs.value).toBe(2_500)
    expect(presentation.displayedLapValid.value).toBe(true)
    scope.stop()
  })
})
