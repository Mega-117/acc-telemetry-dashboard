import { describe, expect, it } from 'vitest'
import { ref } from 'vue'
import { useHudPresentationMemory } from '../../app/services/overlay/hudPresentationMemory'
import { EMPTY_FAST_STATE } from '../../app/services/telemetry/emptyFastState'

describe('HUD presentation memory is separate from live data', () => {
  it('retains a display during expiry and replaces it on valid recovery', () => {
    const source = ref({ ...EMPTY_FAST_STATE, isFresh: true, isLive: true })
    const value = ref(120), display = useHudPresentationMemory(value, source)
    expect(display.value).toBe(120)
    source.value = { ...source.value, isFresh: false, isLive: false }; value.value = 0
    expect(display.value).toBe(120)
    expect(source.value.isLive).toBe(false)
    source.value = { ...source.value, isFresh: true, isLive: true }; value.value = 130
    expect(display.value).toBe(130)
    source.value = { ...source.value, isFresh: true, isLive: false }; value.value = 0
    expect(display.value).toBe(0)
  })
  it('cannot reuse another session presentation', () => {
    const source = ref<any>({ isFresh: true, isLive: true, commonLive: { gameId: 'acc', sessionId: 'a' } })
    const value = ref(9), display = useHudPresentationMemory(value, source)
    expect(display.value).toBe(9)
    source.value = { isFresh: false, isLive: false, commonLive: { gameId: 'acc', sessionId: 'b' } }; value.value = 0
    expect(display.value).toBe(0)
  })
  it('a fresh disconnected source clears retained values even when normalization is unavailable', () => {
    const source = ref<any>({ isFresh: true, isLive: true, commonLive: { gameId: 'acc', sessionId: 'a', fresh: true } })
    const value = ref(9), display = useHudPresentationMemory(value, source)
    expect(display.value).toBe(9)
    source.value = { ...source.value, isFresh: false, isLive: false }; value.value = 0
    expect(display.value).toBe(0)
  })
})
