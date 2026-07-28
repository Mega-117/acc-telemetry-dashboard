import { describe, expect, it } from 'vitest'
import {
  COMPLETED_LAP_HOLD_MS,
  advanceCompletedLapHold,
  createCompletedLapHoldState,
  isCompletedLapHeld,
  type CompletedLapHoldSample,
} from '~/utils/completedLapHold'

function sample(overrides: Partial<CompletedLapHoldSample> = {}): CompletedLapHoldSample {
  return {
    ready: true,
    contextKey: 'spa|mercedes|practice',
    lapsCompleted: 0,
    lastLapTimeMs: null,
    lastLapValid: null,
    ...overrides,
  }
}

describe('completedLapHold', () => {
  it('stabilisce la baseline senza mostrare un giro vecchio all avvio', () => {
    const state = advanceCompletedLapHold(
      createCompletedLapHoldState(),
      sample({ lapsCompleted: 4, lastLapTimeMs: 142_123, lastLapValid: true }),
      100,
    )
    expect(state.observedLapsCompleted).toBe(4)
    expect(state.holdUntilMs).toBeNull()
  })

  it('mantiene il giro concluso fino a 6.999 ms e lo rilascia a 7.000 ms', () => {
    const baseline = advanceCompletedLapHold(createCompletedLapHoldState(), sample(), 100)
    const held = advanceCompletedLapHold(
      baseline,
      sample({ lapsCompleted: 1, lastLapTimeMs: 141_250, lastLapValid: true }),
      1_000,
    )
    expect(held.holdStartedAtMs).toBe(1_000)
    expect(held.holdUntilMs).toBe(1_000 + COMPLETED_LAP_HOLD_MS)
    expect(isCompletedLapHeld(held, 7_999)).toBe(true)
    const released = advanceCompletedLapHold(held, sample({ lapsCompleted: 1 }), 8_000)
    expect(isCompletedLapHeld(released, 8_000)).toBe(false)
    expect(released.holdStartedAtMs).toBeNull()
  })

  it('conserva in rosso anche un giro concluso invalido', () => {
    const baseline = advanceCompletedLapHold(createCompletedLapHoldState(), sample(), 0)
    const held = advanceCompletedLapHold(
      baseline,
      sample({ lapsCompleted: 1, lastLapTimeMs: 145_900, lastLapValid: false }),
      250,
    )
    expect(held.heldLapTimeMs).toBe(145_900)
    expect(held.heldLapValid).toBe(false)
  })

  it('non inventa un hold se tempo o validita conclusi non sono affidabili', () => {
    const baseline = advanceCompletedLapHold(createCompletedLapHoldState(), sample(), 0)
    const withoutValidity = advanceCompletedLapHold(
      baseline,
      sample({ lapsCompleted: 1, lastLapTimeMs: 141_000, lastLapValid: null }),
      100,
    )
    const withoutTime = advanceCompletedLapHold(
      withoutValidity,
      sample({ lapsCompleted: 2, lastLapTimeMs: null, lastLapValid: true }),
      200,
    )
    expect(withoutValidity.holdUntilMs).toBeNull()
    expect(withoutTime.holdUntilMs).toBeNull()
  })

  it('resetta hold e baseline su cambio contesto, rewind o sorgente non pronta', () => {
    const baseline = advanceCompletedLapHold(createCompletedLapHoldState(), sample(), 0)
    const held = advanceCompletedLapHold(
      baseline,
      sample({ lapsCompleted: 1, lastLapTimeMs: 141_000, lastLapValid: true }),
      100,
    )
    const changed = advanceCompletedLapHold(
      held,
      sample({ contextKey: 'monza|ferrari|practice', lapsCompleted: 7 }),
      200,
    )
    const rewound = advanceCompletedLapHold(changed, sample({ contextKey: changed.contextKey, lapsCompleted: 2 }), 300)
    const disconnected = advanceCompletedLapHold(rewound, sample({ ready: false }), 400)
    expect(changed.holdUntilMs).toBeNull()
    expect(rewound.observedLapsCompleted).toBe(2)
    expect(disconnected).toEqual(createCompletedLapHoldState())
  })
})
