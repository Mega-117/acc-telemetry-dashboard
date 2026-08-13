import { describe, expect, it } from 'vitest'
import {
  createStandingsHighlightTracker,
  PERSONAL_BEST_FLASH_MS,
  POSITION_IMPROVED_FLASH_MS,
  POSITION_WORSENED_FLASH_MS,
  REMOVED_CAR_SUPPRESSION_MS,
} from '../../app/services/overlay/standingsHighlightTracker'
import type {
  StandingsCarSnapshot,
  StandingsSnapshot,
} from '../../app/services/overlay/standingsPresentation'

function car(index: number, position: number, overrides: Partial<StandingsCarSnapshot> = {}): StandingsCarSnapshot {
  return {
    car_index: index,
    car_class: 'GT3',
    current_driver_index: 0,
    drivers: [{ first_name: 'Alex', last_name: `Driver${index}` }],
    cup_position: 1,
    position,
    laps: 10,
    best_lap: { time_ms: 100_000, is_invalid: false, is_valid_for_best: true },
    last_lap: { time_ms: 101_000, is_invalid: false, is_valid_for_best: true },
    has_identity: true,
    has_realtime: true,
    realtime_updated_at_ms: 1000,
    ...overrides,
  }
}

function snapshot(cars: StandingsCarSnapshot[], overrides: Partial<StandingsSnapshot['session']> = {}): StandingsSnapshot {
  return {
    freshness: { generated_at_ms: 1000, ttl_ms: 5000 },
    session: {
      event_index: 1,
      session_index: 1,
      focused_car_index: 1,
      is_replay: false,
      session_type: 2,
      phase: 4,
      ...overrides,
    },
    cars,
  }
}

describe('standingsHighlightTracker', () => {
  it('non lampeggia al primo snapshot e usa 5s green / 4s red sui cambi posizione', () => {
    const tracker = createStandingsHighlightTracker()
    expect(tracker.update(snapshot([car(1, 2), car(2, 1)]), 1000)).toEqual({})

    const changed = tracker.update(snapshot([car(1, 1), car(2, 2)]), 1100)
    expect(changed).toEqual({
      1: { positionFlash: 'improved', lastLapPersonalBest: null },
      2: { positionFlash: 'worsened', lastLapPersonalBest: null },
    })
    expect(tracker.getHighlights(1100 + POSITION_WORSENED_FLASH_MS - 1)[2]?.positionFlash).toBe('worsened')
    expect(tracker.getHighlights(1100 + POSITION_WORSENED_FLASH_MS)[2]).toBeUndefined()
    expect(tracker.getHighlights(1100 + POSITION_IMPROVED_FLASH_MS - 1)[1]?.positionFlash).toBe('improved')
    expect(tracker.getHighlights(1100 + POSITION_IMPROVED_FLASH_MS)).toEqual({})
  })

  it('ignora PreFormation, FormationLap e auto con laps negativo senza flash di rientro', () => {
    const tracker = createStandingsHighlightTracker()
    tracker.update(snapshot([car(1, 2), car(2, 1)]), 1000)

    expect(tracker.update(snapshot([car(1, 1), car(2, 2)], { phase: 2 }), 1100)).toEqual({})
    expect(tracker.update(snapshot([car(1, 2), car(2, 1)], { phase: 3 }), 1200)).toEqual({})
    expect(tracker.update(snapshot([car(1, 1), car(2, 2)], { phase: 4 }), 1300)).toEqual({})

    const negativeLaps = snapshot([car(1, 2, { laps: -1 }), car(2, 1)])
    expect(tracker.update(negativeLaps, 1400)[1]).toBeUndefined()
    expect(tracker.update(snapshot([car(1, 1), car(2, 2)]), 1500)[1]).toBeUndefined()
    expect(tracker.update(snapshot([car(1, 2), car(2, 1)]), 1600)[1]?.positionFlash).toBe('worsened')
  })

  it('sopprime per 2s i flash causati dalla rimozione di una car', () => {
    const tracker = createStandingsHighlightTracker()
    tracker.update(snapshot([car(1, 1), car(2, 2), car(3, 3)]), 1000)

    expect(tracker.update(snapshot([
      car(1, 1, { realtime_updated_at_ms: 2000 }),
      car(2, 2, { realtime_updated_at_ms: 2000 }),
    ]), 2000)).toEqual({})

    const beforeSuppressionEnds = 2000 + REMOVED_CAR_SUPPRESSION_MS - 1
    expect(tracker.update(snapshot([
      car(1, 2, { realtime_updated_at_ms: beforeSuppressionEnds }),
      car(2, 1, { realtime_updated_at_ms: beforeSuppressionEnds }),
    ]), beforeSuppressionEnds)).toEqual({})

    const afterSuppressionAt = 2000 + REMOVED_CAR_SUPPRESSION_MS
    const afterSuppression = tracker.update(
      snapshot([
        car(1, 1, { realtime_updated_at_ms: afterSuppressionAt }),
        car(2, 2, { realtime_updated_at_ms: afterSuppressionAt }),
      ]),
      afterSuppressionAt,
    )
    expect(afterSuppression[1]?.positionFlash).toBe('improved')
    expect(afterSuppression[2]?.positionFlash).toBe('worsened')
  })

  it('evidenzia per 10s solo un nuovo last lap valido uguale al best', () => {
    const tracker = createStandingsHighlightTracker()
    const initial = snapshot([car(1, 1), car(2, 2)])
    expect(tracker.update(initial, 1000)).toEqual({})

    const newPersonalBests = snapshot([
      car(1, 1, {
        laps: 11,
        best_lap: { time_ms: 99_000 },
        last_lap: { time_ms: 99_000, is_invalid: false, is_valid_for_best: true },
      }),
      car(2, 2, {
        laps: 11,
        best_lap: { time_ms: 98_000 },
        last_lap: { time_ms: 98_000, is_invalid: false, is_valid_for_best: true },
      }),
    ])
    const highlighted = tracker.update(newPersonalBests, 2000)
    expect(highlighted[1]?.lastLapPersonalBest).toBe('focused')
    expect(highlighted[2]?.lastLapPersonalBest).toBe('other')
    expect(tracker.getHighlights(2000 + PERSONAL_BEST_FLASH_MS - 1)[1]).toBeDefined()
    expect(tracker.getHighlights(2000 + PERSONAL_BEST_FLASH_MS)).toEqual({})
  })

  it('non evidenzia last lap invalidi o senza valid_for_best e resetta tra sessioni', () => {
    const tracker = createStandingsHighlightTracker()
    tracker.update(snapshot([car(1, 1)]), 1000)
    const invalid = car(1, 1, {
      laps: 11,
      best_lap: { time_ms: 99_000 },
      last_lap: { time_ms: 99_000, is_invalid: true, is_valid_for_best: true },
    })
    expect(tracker.update(snapshot([invalid]), 2000)).toEqual({})

    const unknownValidity = car(1, 1, {
      laps: 12,
      best_lap: { time_ms: 98_000 },
      last_lap: { time_ms: 98_000, is_invalid: false, is_valid_for_best: null },
    })
    expect(tracker.update(snapshot([unknownValidity]), 3000)).toEqual({})

    const changedSession = snapshot([car(1, 2, { laps: 13 })], { session_index: 2 })
    expect(tracker.update(changedSession, 4000)).toEqual({})
  })
})
