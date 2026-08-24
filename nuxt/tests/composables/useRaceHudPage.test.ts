import { effectScope, nextTick, ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useRaceHudPage } from '~/composables/useRaceHudPage'
import type { FastOverlayState } from '~/composables/useFastStatePoller'

function state(eventSeq: number, overrides: Partial<FastOverlayState> = {}): FastOverlayState {
  return {
    isFresh: true,
    isLive: true,
    context: { track: 'spa', car: '296', sessionType: 2, sessionIndex: 1, sessionUid: 'a', serverId: null },
    damage: { eventSeq } as FastOverlayState['damage'],
    ...overrides,
  } as FastOverlayState
}

describe('useRaceHudPage', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  it('apre per 12 secondi, riavvia sul nuovo danno e poi torna alle gomme', async () => {
    const scope = effectScope()
    const fastState = ref(state(0))
    const pager = scope.run(() => useRaceHudPage(fastState))!

    fastState.value = state(1)
    await nextTick()
    expect(pager.activePage.value).toBe('damage')
    expect(pager.damageFlash.value).toBe(true)
    await vi.advanceTimersByTimeAsync(8_000)
    fastState.value = state(2)
    await nextTick()
    await vi.advanceTimersByTimeAsync(8_000)
    expect(pager.activePage.value).toBe('damage')
    await vi.advanceTimersByTimeAsync(4_000)
    expect(pager.activePage.value).toBe('tyres')
    scope.stop()
  })

  it('mantiene la selezione manuale e non apre su repair o nuova baseline', async () => {
    const scope = effectScope()
    const fastState = ref(state(3))
    const pager = scope.run(() => useRaceHudPage(fastState))!
    pager.selectPage('damage')
    await vi.advanceTimersByTimeAsync(20_000)
    expect(pager.activePage.value).toBe('damage')
    pager.selectPage('tyres')
    fastState.value = state(2)
    await nextTick()
    expect(pager.activePage.value).toBe('tyres')
    fastState.value = state(0, {
      context: { track: 'spa', car: '296', sessionType: 2, sessionIndex: 1, sessionUid: 'b', serverId: null },
    })
    await nextTick()
    expect(pager.activePage.value).toBe('tyres')
    scope.stop()
  })

  it('resetta manuale e torna alle gomme su telemetria stale', async () => {
    const scope = effectScope()
    const fastState = ref(state(0))
    const pager = scope.run(() => useRaceHudPage(fastState))!
    pager.selectPage('damage')
    fastState.value = state(0, { isFresh: false, isLive: false })
    await nextTick()
    expect(pager.activePage.value).toBe('tyres')
    expect(pager.manualDamage.value).toBe(false)
    scope.stop()
  })
})
