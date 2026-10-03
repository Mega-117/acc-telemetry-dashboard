import { describe, expect, it, vi } from 'vitest'
import { useTrackingRecord } from '~/composables/useTrackingRecord'
import type { LiveLapState } from '~/types/liveTelemetry'

const lap = (session = 'one') => ({ gameId: 'synthetic', sourceSessionId: session, track: 'Spa', trackVariant: 'GP', car: 'GT3', lapsCompleted: 24, lapsValid: 23, personalLapsCompleted: 4, personalLapsValid: 3 }) as LiveLapState
function setup() {
  let current = lap()
  let resolveStart!: (value: unknown) => void
  const api = {
    trainingStart: vi.fn(() => new Promise(resolve => { resolveStart = resolve })),
    trainingComplete: vi.fn(async () => ({ ok: true })),
    trainingAbandon: vi.fn(async () => ({ ok: true })),
  }
  const record = useTrackingRecord(() => api, () => current, () => 'consistency', () => 'short', () => 3)
  return { api, record, setLap: (value: LiveLapState) => { current = value }, resolve: () => resolveStart({ ok: true, id: 'training-one' }) }
}

describe('training IPC source context', () => {
  it('never falls back to the observed car when personal counters are unavailable', async () => {
    const state = setup()
    state.setLap({ ...lap(), personalLapsCompleted: null, personalLapsValid: undefined })
    const start = state.record.trackingStart()
    await Promise.resolve(); state.resolve(); await start
    await state.record.trackingComplete(1)
    expect(state.api.trainingComplete).toHaveBeenCalledWith(expect.objectContaining({ lapsCompleted: null, lapsValid: null }))
  })
  it('abandons a late start for the old source without adopting the new source counts', async () => {
    const state = setup()
    const start = state.record.trackingStart()
    await Promise.resolve()
    expect(state.api.trainingStart).toHaveBeenCalledWith(expect.objectContaining({ gameId: 'synthetic', sourceSessionId: 'one', trackVariant: 'GP' }))
    state.setLap(lap('two'))
    state.resolve(); await start
    expect(state.record.activeTrainingId.value).toBeNull()
    expect(state.api.trainingAbandon).toHaveBeenCalledWith(expect.objectContaining({ id: 'training-one', lapsCompleted: null, lapsValid: null }))
  })

  it('processes stop requested while start is pending, preserving the stop snapshot', async () => {
    const state = setup()
    const start = state.record.trackingStart()
    await Promise.resolve()
    const stop = state.record.trackingComplete(1)
    state.setLap({ ...lap(), lapsCompleted: 8 })
    state.resolve(); await Promise.all([start, stop])
    expect(state.api.trainingComplete).toHaveBeenCalledWith(expect.objectContaining({ id: 'training-one', lapsCompleted: 4, lapsValid: 3, stepsCompleted: 1 }))
    expect(state.record.activeTrainingId.value).toBeNull()
  })

  it('keeps unknown counts and never records counts from a different game', async () => {
    const state = setup()
    const start = state.record.trackingStart()
    await Promise.resolve(); state.resolve(); await start
    state.setLap({ ...lap(), gameId: 'acc', lapsCompleted: 20 })
    await state.record.trackingAbandon(0)
    expect(state.api.trainingAbandon).toHaveBeenCalledWith(expect.objectContaining({ lapsCompleted: null, lapsValid: null }))
  })
})
