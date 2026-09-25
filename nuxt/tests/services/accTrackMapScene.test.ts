import { describe, expect, it } from 'vitest'
import { buildAccTrackMapScene, type AccStandingsCar } from '~/services/sim/acc/accTrackMapScene'

const NOW = 1_000_000
const car = (overrides: Partial<AccStandingsCar> = {}): AccStandingsCar => ({
  car_index: 2, race_number: 46, car_class: 'GT3', position: 5, cup_position: 5,
  spline_position: 0.25, kmh: 180, car_location: 1, has_realtime: true,
  realtime_updated_at_ms: NOW - 200, ...overrides
})

describe('ACC -> track map scene', () => {
  it('translates ACC codes into the neutral model', () => {
    const scene = buildAccTrackMapScene({
      cars: [car({ car_index: 2, car_location: 2 }), car({ car_index: 3, car_location: 3 }), car({ car_index: 4, car_location: 1 })],
      localCarIndex: 4, localLapPosition: 0.5, sessionType: 10, nowMs: NOW, ttlMs: 5000
    })
    expect(scene.isRace).toBe(true)
    expect(scene.cars.map(item => [item.id, item.inPit])).toEqual([[2, true], [3, true], [4, false]])
    expect(scene.cars[0]).toMatchObject({ raceNumber: 46, overallPosition: 5, classPosition: 5, classKey: 'gt3', speedKmh: 180 })
    // Only session type 10 is a race in ACC.
    expect(buildAccTrackMapScene({ cars: [], localCarIndex: null, sessionType: 4 }).isRace).toBe(false)
  })

  it('takes the local car from shared memory, not from the slower UDP roster', () => {
    const scene = buildAccTrackMapScene({
      cars: [car({ car_index: 7, spline_position: 0.9 })], localCarIndex: 7, localLapPosition: 0.5
    })
    expect(scene.cars).toHaveLength(1)
    expect(scene.cars[0]).toMatchObject({ id: 7, lapPosition: 0.5, isLocal: true, isFocused: true })
  })

  it('keeps the local car even with no usable UDP row, and drops rows without a position', () => {
    const scene = buildAccTrackMapScene({
      cars: [car({ car_index: 3, spline_position: null }), car({ car_index: null }), car({ car_index: 5, has_realtime: false })],
      localCarIndex: 9, localLapPosition: 0.2
    })
    expect(scene.cars).toEqual([expect.objectContaining({ id: 9, isLocal: true, lapPosition: 0.2 })])
    // Nothing to draw at all is a legitimate empty scene.
    expect(buildAccTrackMapScene({ cars: null, localCarIndex: null }).cars).toEqual([])
  })

  it('drops a driver who left the server: his entry stays but stops updating', () => {
    const cars = [
      car({ car_index: 2, realtime_updated_at_ms: NOW - 400 }),
      car({ car_index: 3, realtime_updated_at_ms: NOW - 60_000 }),
      car({ car_index: 4, realtime_updated_at_ms: null }),
      car({ car_index: 5, realtime_updated_at_ms: NOW + 30_000 })
    ]
    const scene = buildAccTrackMapScene({ cars, localCarIndex: 1, localLapPosition: 0.5, nowMs: NOW, ttlMs: 5000 })
    expect(scene.cars.map(item => item.id).sort()).toEqual([1, 2])
    // Without a clock nothing is filtered: the caller decides.
    expect(buildAccTrackMapScene({ cars, localCarIndex: 1, localLapPosition: 0.5 }).cars).toHaveLength(5)
  })

  it('follows the focused car while spectating, and says the local car is not in focus', () => {
    const cars = [car({ car_index: 2 }), car({ car_index: 7 })]
    const spectating = buildAccTrackMapScene({ cars, focusedCarIndex: 7, localCarIndex: 2, localLapPosition: 0.5 })
    expect(spectating.localInFocus).toBe(false)
    expect(spectating.cars.map(item => [item.id, item.isFocused, item.isLocal])).toEqual([[2, false, true], [7, true, false]])
    // No focus from the feed: the pilot is looking at his own car.
    expect(buildAccTrackMapScene({ cars, localCarIndex: 2, localLapPosition: 0.5 }).localInFocus).toBe(true)
  })

  it('accepts a lap position just past the line and rejects nonsense', () => {
    const wrapped = buildAccTrackMapScene({ cars: [car({ spline_position: 1.02 })], localCarIndex: null })
    expect(wrapped.cars[0]!.lapPosition).toBeCloseTo(0.02)
    for (const bad of [-0.1, 2.5, Number.NaN, null]) {
      expect(buildAccTrackMapScene({ cars: [car({ spline_position: bad })], localCarIndex: null }).cars).toEqual([])
    }
  })
})
