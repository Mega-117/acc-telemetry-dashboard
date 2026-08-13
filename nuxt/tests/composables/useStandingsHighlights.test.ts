import { nextTick, ref } from 'vue'
import { describe, expect, it } from 'vitest'
import { useStandingsHighlights } from '../../app/composables/useStandingsHighlights'
import type {
  StandingsCarSnapshot,
  StandingsStateEnvelope,
} from '../../app/services/overlay/standingsPresentation'

function car(index: number, position: number): StandingsCarSnapshot {
  return {
    car_index: index,
    car_class: 'GT3',
    drivers: [],
    cup_position: 1,
    position,
    laps: 5,
    best_lap: { time_ms: 100_000 },
    last_lap: { time_ms: 101_000, is_invalid: false, is_valid_for_best: true },
    has_identity: true,
    has_realtime: true,
    realtime_updated_at_ms: 1000,
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
        local_car_index: 1,
        is_replay: false,
        phase: 4,
      },
      cars: [car(1, position), car(2, position === 1 ? 2 : 1)],
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
