import { nextTick, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import { useStandingsHighlights } from '../../app/composables/useStandingsHighlights'
import type {
  StandingsCarSnapshot,
  StandingsStateEnvelope,
} from '../../app/services/overlay/standingsPresentation'

function car(position: number): StandingsCarSnapshot {
  return {
    car_index: 1,
    car_class: 'GT3',
    drivers: [],
    cup_position: position,
    laps: 5,
    best_lap: { time_ms: 100_000 },
    last_lap: { time_ms: 101_000, is_invalid: false, is_valid_for_best: true },
    has_identity: true,
    has_realtime: true,
  }
}

function available(position: number): StandingsStateEnvelope {
  return {
    status: 'available',
    reason: null,
    snapshot: {
      freshness: { generated_at_ms: 1000, ttl_ms: 5000 },
      session: {
        event_index: 1,
        session_index: 1,
        focused_car_index: 1,
        is_replay: false,
        phase: 4,
      },
      cars: [car(position)],
    },
  }
}

describe('useStandingsHighlights', () => {
  it('sincronizza il tracker e resetta su unavailable/stop', async () => {
    const state = ref<StandingsStateEnvelope>(available(2))
    const nowMs = ref(1000)
    const standings = useStandingsHighlights(state, nowMs)
    expect(standings.highlights.value).toEqual({})

    state.value = available(1)
    nowMs.value = 1100
    await nextTick()
    expect(standings.highlights.value[1]?.positionFlash).toBe('improved')

    state.value = { status: 'unavailable', reason: 'stale', snapshot: null }
    await nextTick()
    expect(standings.highlights.value).toEqual({})

    state.value = available(2)
    await nextTick()
    expect(standings.highlights.value).toEqual({})

    standings.stop()
    state.value = available(1)
    nowMs.value = 1200
    await nextTick()
    expect(standings.highlights.value).toEqual({})
  })
})
