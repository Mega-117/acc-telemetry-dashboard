import { describe, expect, it } from 'vitest'
import {
  TRACK_MAP_CANVAS,
  TRACK_MAP_CIRCLE_FILL,
  TRACK_MAP_DAMAGE_COLOR,
  TRACK_MAP_PIT_COLOR,
  advanceTrackMapMotion,
  buildPitCaption,
  buildTrackMapView,
  normalizeTrackOutline,
  outlineToPath,
  pointAtSpline,
  stepSplineToward
} from '~/services/overlay/trackMapPresentation'

// A 200 x 100 m rectangle, wider than tall, not centred on the origin.
const RECTANGLE: [number, number][] = [[100, 50], [300, 50], [300, 150], [100, 150], [100, 50]]

describe('normalizeTrackOutline', () => {
  it('keeps the aspect ratio and centres the track on the canvas like ACC Drive', () => {
    const outline = normalizeTrackOutline(RECTANGLE)
    expect(outline[0]).toEqual({ x: 0, y: TRACK_MAP_CANVAS * 0.25 })
    expect(outline[2]).toEqual({ x: TRACK_MAP_CANVAS, y: TRACK_MAP_CANVAS * 0.75 })
  })

  it('draws the circle view smaller, like ACC Drive, and still centred', () => {
    const square: [number, number][] = [[0, 0], [100, 0], [100, 100], [0, 100]]
    const outline = normalizeTrackOutline(square, TRACK_MAP_CANVAS, TRACK_MAP_CIRCLE_FILL)
    const margin = TRACK_MAP_CANVAS * (1 - TRACK_MAP_CIRCLE_FILL) / 2
    expect(outline[0]!.x).toBeCloseTo(margin)
    expect(outline[2]!.x).toBeCloseTo(TRACK_MAP_CANVAS - margin)
    expect(outline[2]!.y).toBeCloseTo(TRACK_MAP_CANVAS - margin)
    expect(normalizeTrackOutline(square, TRACK_MAP_CANVAS, 0)).toEqual([])
  })

  it('returns nothing for missing, malformed or degenerate data', () => {
    expect(normalizeTrackOutline(null)).toEqual([])
    expect(normalizeTrackOutline([[1, 1]])).toEqual([])
    expect(normalizeTrackOutline([[1, 1], [1, 1]])).toEqual([])
    expect(normalizeTrackOutline([[0, 0], ['x', 1] as unknown as [number, number], [10, 10]])).toHaveLength(2)
  })
})

describe('pointAtSpline', () => {
  const outline = normalizeTrackOutline(RECTANGLE)

  it('uses the index (n - 1) * spline without interpolation', () => {
    expect(pointAtSpline(outline, 0)).toBe(outline[0])
    expect(pointAtSpline(outline, 0.49)).toBe(outline[1])
    expect(pointAtSpline(outline, 0.5)).toBe(outline[2])
    expect(pointAtSpline(outline, 1)).toBe(outline[4])
  })

  it('wraps a spline just over one lap and rejects everything else', () => {
    expect(pointAtSpline(outline, 1.5)).toBe(outline[2])
    expect(pointAtSpline(outline, -0.1)).toBeNull()
    expect(pointAtSpline(outline, 2.5)).toBeNull()
    expect(pointAtSpline(outline, Number.NaN)).toBeNull()
    expect(pointAtSpline(outline, null)).toBeNull()
    expect(pointAtSpline([], 0.5)).toBeNull()
  })
})

describe('buildTrackMapView', () => {
  const outline = normalizeTrackOutline(RECTANGLE)
  const car = (overrides: Record<string, unknown>) => ({
    car_index: 1, race_number: 7, car_class: 'GT3', position: 5, cup_position: 5,
    spline_position: 0.25, kmh: 180, car_location: 1, has_realtime: true, ...overrides
  })

  it('draws nothing without an outline and never invents dots', () => {
    const view = buildTrackMapView({ outline: [], cars: [car({})], localCarIndex: 1 })
    expect(view).toEqual({ outlinePath: '', dots: [], markers: [], caption: null })
  })

  it('replicates ACC Drive colours, sizes and stacking', () => {
    const view = buildTrackMapView({
      outline,
      sessionType: 10,
      localCarIndex: 1,
      localSpline: 0.5,
      showCarNumbers: true,
      cars: [
        car({}),
        car({ car_index: 2, position: 1, cup_position: 1 }),
        car({ car_index: 3, car_class: 'gt4', position: 9, cup_position: 1 }),
        car({ car_index: 4, kmh: 12 }),
        car({ car_index: 5, car_location: 2, kmh: 40 }),
        car({ car_index: 6, has_realtime: false }),
        car({ car_index: 7, spline_position: null }),
        car({ car_index: null })
      ]
    })
    const byIndex = Object.fromEntries(view.dots.map(dot => [dot.carIndex, dot]))
    expect(Object.keys(byIndex).sort()).toEqual(['1', '2', '3', '4', '5'])
    expect(byIndex[1]).toMatchObject({ fill: '#FF0000', diameter: 34, isLocal: true, label: '7', zIndex: 1000 })
    // Local car follows shared memory, not the UDP spline.
    expect(byIndex[1]).toMatchObject(outline[2]!)
    expect(byIndex[2]).toMatchObject({ fill: '#FFA500', diameter: 34, zIndex: 2000 })
    expect(byIndex[3]).toMatchObject({ fill: '#0000FF', text: '#000000', diameter: 34 })
    expect(byIndex[4]).toMatchObject({ fill: '#FFFF00', diameter: 24, zIndex: 500 })
    expect(byIndex[5]).toMatchObject({ fill: '#D3D3D3', opacity: 0.5 })
    expect(view.dots.map(dot => dot.zIndex)).toEqual([...view.dots.map(dot => dot.zIndex)].sort((a, b) => a - b))
  })

  it('marks an invalid lap only outside races and hides numbers when asked', () => {
    const invalid = car({ car_index: 2, current_lap: { is_invalid: true } })
    const practice = buildTrackMapView({ outline, cars: [invalid], localCarIndex: 1, sessionType: 4 })
    const race = buildTrackMapView({ outline, cars: [invalid], localCarIndex: 1, sessionType: 10 })
    expect(practice.dots[0]).toMatchObject({ fill: '#00FFFF', label: null })
    expect(race.dots[0]!.fill).toBe('#D3D3D3')
  })

  it('keeps the local car from shared memory when the UDP roster is empty', () => {
    const view = buildTrackMapView({ outline, cars: [], localCarIndex: 3, localSpline: 0.5 })
    expect(view.dots).toHaveLength(1)
    expect(view.dots[0]).toMatchObject({ carIndex: 3, isLocal: true, ...outline[2]! })
    expect(buildTrackMapView({ outline, cars: null, localCarIndex: null, localSpline: 0.5 }).dots).toEqual([])
  })

  it('renders only the markers the logger declares, hollow when confidence is low', () => {
    const pitPrediction = {
      available: true, spline: 0.5, confidence: 'high' as const,
      damage: { visible: true, spline: 0.25, confidence: 'low' as const }
    }
    const view = buildTrackMapView({ outline, cars: [], localCarIndex: null, pitPrediction })
    expect(view.markers).toEqual([
      { ...outline[1]!, spline: 0.25, kind: 'damage', label: '+', fill: TRACK_MAP_DAMAGE_COLOR, hollow: true },
      { ...outline[2]!, spline: 0.5, kind: 'pit', label: 'P', fill: TRACK_MAP_PIT_COLOR, hollow: false }
    ])
    const hidden = { outline, cars: [], localCarIndex: null }
    expect(buildTrackMapView({ ...hidden, pitPrediction, showPitPrediction: false }).markers).toEqual([])
    expect(buildTrackMapView({ ...hidden, pitPrediction: { ...pitPrediction, available: false } }).markers).toEqual([])
    expect(buildTrackMapView({ ...hidden, pitPrediction: { available: true, spline: null } }).markers).toEqual([])
    expect(buildTrackMapView({ ...hidden, pitPrediction: null }).markers).toEqual([])
    const noDamage = buildTrackMapView({ ...hidden, pitPrediction: { ...pitPrediction, damage: { visible: false, spline: 0.25 } } })
    expect(noDamage.markers.map(marker => marker.kind)).toEqual(['pit'])
  })

  it('says which stop time the marker is based on, so the pilot can check it against the MFD', () => {
    expect(buildPitCaption({ pitTimeBaseS: 46.4, pitTimeSource: 'mfd-screen', stopTimeS: 3.4 }))
      .toBe('SOSTA 3,4 s · MFD · T 46,4 s')
    expect(buildPitCaption({ pitTimeBaseS: 73, pitTimeSource: 'acc-drive-sg30', stopTimeS: 30 }))
      .toBe('SOSTA 30,0 s · stima · T 73,0 s')
    // A manual total has no stationary part to show.
    expect(buildPitCaption({ pitTimeBaseS: 50, pitTimeSource: 'manual', stopTimeS: null })).toBe('manuale · T 50,0 s')
    expect(buildPitCaption({ pitTimeBaseS: 50, pitTimeSource: 'something-new', stopTimeS: 0 })).toBe('SOSTA 0,0 s · T 50,0 s')
    expect(buildPitCaption({ pitTimeBaseS: null, pitTimeSource: 'manual' })).toBeNull()
    expect(buildPitCaption(null)).toBeNull()

    const basis = { available: false, pitTimeBaseS: 46.4, pitTimeSource: 'mfd-screen', stopTimeS: 3.4 }
    // Shown even before the marker exists, hidden with the pit prediction switch.
    expect(buildTrackMapView({ outline, cars: [], localCarIndex: null, pitPrediction: basis }).caption)
      .toBe('SOSTA 3,4 s · MFD · T 46,4 s')
    expect(buildTrackMapView({ outline, cars: [], localCarIndex: null, pitPrediction: basis, showPitPrediction: false }).caption)
      .toBeNull()
  })

  it('moves an item along the lap by the shorter way round, never across the map', () => {
    // A new stop time moves the pit marker by a third of a lap: it must pass
    // through the points in between, not jump or cut the circle.
    let position = 0.10
    const visited: number[] = []
    for (let frame = 0; frame < 60; frame += 1) {
      position = stepSplineToward(position, 0.40, 16)
      visited.push(position)
    }
    expect(visited.every((value, index) => index === 0 || value >= visited[index - 1]!)).toBe(true)
    expect(visited[0]!).toBeGreaterThan(0.10)
    expect(visited[0]!).toBeLessThan(0.20)
    expect(visited.at(-1)!).toBeCloseTo(0.40, 3)

    // Across the start line the short way is backwards through 0, not forwards through 0.5.
    const across = stepSplineToward(0.05, 0.95, 16)
    expect(across > 0.95 || across < 0.05).toBe(true)
    expect(stepSplineToward(0.95, 0.05, 16) > 0.95 || stepSplineToward(0.95, 0.05, 16) < 0.05).toBe(true)

    // Settles exactly, ignores nonsense, and a first sighting starts on target.
    expect(stepSplineToward(0.4000001, 0.4, 16)).toBe(0.4)
    expect(stepSplineToward(0.2, Number.NaN, 16)).toBe(0.2)
    expect(stepSplineToward(Number.NaN, 0.7, 16)).toBe(0.7)
    expect(stepSplineToward(0.2, 0.6, 0)).toBe(0.2)
  })

  it('reappears in place after "return to pits" instead of sweeping the circuit', () => {
    const items = [
      { key: 'car:1', spline: 0.02, isLocal: true },
      { key: 'car:2', spline: 0.31 },
      { key: 'marker:pit', spline: 0.35, followsLocal: true },
    ]
    // The local car was at 0.60 and teleported to the pits; its marker goes with it.
    const teleported = advanceTrackMapMotion({ 'car:1': 0.60, 'car:2': 0.30, 'marker:pit': 0.93 }, items, 16)
    expect(teleported['car:1']).toBe(0.02)
    expect(teleported['marker:pit']).toBe(0.35)
    // The other car was just driving: it keeps moving along the line.
    expect(teleported['car:2']).toBeGreaterThan(0.30)
    expect(teleported['car:2']).toBeLessThan(0.31)

    // Another car returning to its pit snaps too, without touching our marker.
    const other = advanceTrackMapMotion({ 'car:1': 0.02, 'car:2': 0.70, 'marker:pit': 0.35 }, items, 16)
    expect(other['car:2']).toBe(0.31)

    // A new stop time moves only the marker far: that one still travels along the line.
    const newStop = advanceTrackMapMotion({ 'car:1': 0.02, 'car:2': 0.31, 'marker:pit': 0.70 }, items, 16)
    expect(newStop['marker:pit']).not.toBe(0.35)
    expect(newStop['marker:pit']).toBeLessThan(0.70)

    // First sighting starts on target; an item that disappeared is dropped.
    expect(advanceTrackMapMotion({ 'car:9': 0.5 }, items, 16)).toEqual({ 'car:1': 0.02, 'car:2': 0.31, 'marker:pit': 0.35 })
  })

  it('does not draw a car that left the server but is still in the entry list', () => {
    const now = 1_000_000
    const cars = [
      car({ car_index: 2, realtime_updated_at_ms: now - 400 }),
      car({ car_index: 3, realtime_updated_at_ms: now - 60_000 }),   // gone a minute ago
      car({ car_index: 4, realtime_updated_at_ms: null }),
      car({ car_index: 1, realtime_updated_at_ms: now - 60_000 })    // stale local row
    ]
    const view = buildTrackMapView({ outline, cars, localCarIndex: 1, localSpline: 0.5, nowMs: now, ttlMs: 5000 })
    expect(view.dots.map(dot => dot.carIndex).sort()).toEqual([1, 2])
    // The local car never disappears: shared memory still knows where it is.
    expect(view.dots.find(dot => dot.isLocal)).toMatchObject({ spline: 0.5 })
    // Without a clock nothing is filtered (the caller decides).
    expect(buildTrackMapView({ outline, cars, localCarIndex: 1 }).dots).toHaveLength(4)
  })

  it('carries the lap position of every dot so the renderer can move it along the line', () => {
    const view = buildTrackMapView({
      outline, cars: [car({ car_index: 2, spline_position: 0.25 })], localCarIndex: 1, localSpline: 0.5
    })
    expect(view.dots.map(dot => [dot.carIndex, dot.spline])).toEqual([[2, 0.25], [1, 0.5]])
  })

  it('serialises the outline for an SVG polyline', () => {
    expect(outlineToPath(outline.slice(0, 2))).toBe('0.0,180.0 720.0,180.0')
  })
})
