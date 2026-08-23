import { describe, expect, it } from 'vitest'
import type { FastOverlayState } from '~/composables/useFastStatePoller'
import { resolveLocalCompactPresentation } from '~/utils/compactSectorPresentation'

function state(sectorHud: FastOverlayState['sectorHud']): FastOverlayState {
  return {
    sectorHud,
    info: {
      currentLapTimeMs: 500,
      lapValid: true,
    },
  } as FastOverlayState
}

describe('resolveLocalCompactPresentation', () => {
  it('usa tempo, validita e token dallo stesso snapshot completato', () => {
    const presentation = resolveLocalCompactPresentation(state({
      version: 1,
      mode: 'last_lap',
      lap: 8,
      referenceLap: 7,
      currentSectorIndex: 0,
      currentLapTimeMs: 0,
      lastLapTimeMs: 91_234,
      bestLapTimeMs: 90_000,
      lapValid: false,
      awaitingFlyingLap: false,
      holdUntilTs: 107,
      sectors: [],
    }))

    expect(presentation.displayLap).toEqual({ timeMs: 91_234, valid: false })
    expect(presentation.heldLap).toEqual({
      timeMs: 91_234,
      valid: false,
      startedAtMs: 107_000,
    })
  })

  it('passa insieme alla fase running allo scadere del backend', () => {
    const presentation = resolveLocalCompactPresentation(state({
      version: 1,
      mode: 'running',
      lap: 9,
      referenceLap: 8,
      currentSectorIndex: 0,
      currentLapTimeMs: 500,
      lastLapTimeMs: null,
      bestLapTimeMs: 90_000,
      lapValid: true,
      awaitingFlyingLap: false,
      holdUntilTs: null,
      sectors: [],
    }))

    expect(presentation.displayLap).toEqual({ timeMs: 500, valid: true })
    expect(presentation.heldLap).toBeNull()
  })

  it('non inventa un colore se la validita manca', () => {
    const presentation = resolveLocalCompactPresentation(state({
      version: 1,
      mode: 'last_lap',
      lap: 8,
      referenceLap: 7,
      currentSectorIndex: 0,
      currentLapTimeMs: 0,
      lastLapTimeMs: 91_234,
      bestLapTimeMs: null,
      lapValid: null,
      awaitingFlyingLap: false,
      holdUntilTs: 107,
      sectors: [],
    }))

    expect(presentation.displayLap.valid).toBeNull()
    expect(presentation.heldLap).toBeNull()
  })
})
