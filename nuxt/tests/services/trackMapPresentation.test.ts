import { describe, expect, it } from 'vitest'
import {
  TRACK_MAP_CANVAS,
  TRACK_MAP_DAMAGE_COLOR,
  TRACK_MAP_PIT_COLOR,
  advanceTrackMapMotion,
  buildPitCaption,
  buildTrackMapView,
  normalizeTrackOutline,
  outlineToPath,
  pointAtSpline,
  rotatedOutlineBottom,
  stepSplineToward
} from '~/services/overlay/trackMapPresentation'
import type { TrackMapCar, TrackMapScene } from '~/services/sim/trackMapScene'

// A 200 x 100 m rectangle, wider than tall, not centred on the origin.
const RECTANGLE: [number, number][] = [[100, 50], [300, 50], [300, 150], [100, 150], [100, 50]]
const CIRCLE_FILL = 1 / 1.3

function sceneCar (overrides: Partial<TrackMapCar> = {}): TrackMapCar {
  return {
    id: 1, lapPosition: 0.25, raceNumber: 7, overallPosition: 5, classPosition: 5,
    classKey: 'gt3', speedKmh: 180, inPit: false, lapInvalid: false, isLocal: false, isFocused: false, ...overrides
  }
}
function scene (cars: TrackMapCar[], overrides: Partial<TrackMapScene> = {}): TrackMapScene {
  return { cars, isRace: true, localInFocus: true, ...overrides }
}

describe('normalizeTrackOutline', () => {
  it('keeps the aspect ratio and centres the track on the canvas like ACC Drive', () => {
    const outline = normalizeTrackOutline(RECTANGLE)
    expect(outline[0]).toEqual({ x: 0, y: TRACK_MAP_CANVAS * 0.25 })
    expect(outline[2]).toEqual({ x: TRACK_MAP_CANVAS, y: TRACK_MAP_CANVAS * 0.75 })
  })

  it('leaves room around the outline when the map data asks for it (circle view)', () => {
    const square: [number, number][] = [[0, 0], [100, 0], [100, 100], [0, 100]]
    const outline = normalizeTrackOutline(square, TRACK_MAP_CANVAS, CIRCLE_FILL)
    const margin = TRACK_MAP_CANVAS * (1 - CIRCLE_FILL) / 2
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

  it('draws nothing without an outline and never invents dots', () => {
    const view = buildTrackMapView({ outline: [], scene: scene([sceneCar()]) })
    expect(view).toEqual({ outlinePath: '', dots: [], markers: [], caption: null })
    expect(buildTrackMapView({ outline, scene: null }).dots).toEqual([])
  })

  it('replicates ACC Drive colours, sizes, stacking and the pulsing ring', () => {
    const view = buildTrackMapView({
      outline,
      scene: scene([
        sceneCar({ id: 1, isLocal: true, isFocused: true, lapPosition: 0.5 }),
        sceneCar({ id: 2, overallPosition: 1, classPosition: 1 }),
        sceneCar({ id: 3, classKey: 'gt4', overallPosition: 9, classPosition: 1 }),
        sceneCar({ id: 4, speedKmh: 12 }),
        sceneCar({ id: 5, inPit: true, speedKmh: 40 }),
        sceneCar({ id: 6, classKey: 'a-class-from-another-sim' })
      ])
    })
    const byId = Object.fromEntries(view.dots.map(dot => [dot.carIndex, dot]))
    expect(byId[1]).toMatchObject({ fill: '#FF0000', diameter: 34, isLocal: true, label: '7', zIndex: 1000, pulse: true })
    expect(byId[1]).toMatchObject(outline[2]!)
    // Race leader: orange and pulsing, like the focused car.
    expect(byId[2]).toMatchObject({ fill: '#FFA500', diameter: 34, zIndex: 2000, pulse: true })
    expect(byId[3]).toMatchObject({ fill: '#0000FF', text: '#000000', diameter: 34, pulse: false })
    expect(byId[4]).toMatchObject({ fill: '#FFFF00', diameter: 24, zIndex: 500 })
    expect(byId[5]).toMatchObject({ fill: '#D3D3D3', opacity: 0.5 })
    // An unknown class gets the neutral colour instead of failing.
    expect(byId[6]).toMatchObject({ fill: '#D3D3D3', text: '#000000' })
    expect(view.dots.map(dot => dot.zIndex)).toEqual([...view.dots.map(dot => dot.zIndex)].sort((a, b) => a - b))
  })

  it('labels the dot with the race number, or the race position when numbers are off', () => {
    const cars = [sceneCar({ raceNumber: 46, overallPosition: 3 }), sceneCar({ id: 2, raceNumber: null, overallPosition: null })]
    expect(buildTrackMapView({ outline, scene: scene(cars) }).dots.map(dot => dot.label)).toEqual(['46', null])
    expect(buildTrackMapView({ outline, scene: scene(cars), showCarNumbers: false }).dots.map(dot => dot.label)).toEqual(['3', null])
  })

  it('marks an invalid lap only outside races', () => {
    const invalid = [sceneCar({ id: 2, lapInvalid: true })]
    expect(buildTrackMapView({ outline, scene: scene(invalid, { isRace: false }) }).dots[0]!.fill).toBe('#00FFFF')
    expect(buildTrackMapView({ outline, scene: scene(invalid) }).dots[0]!.fill).toBe('#D3D3D3')
  })

  it('renders only the markers the logger declares, hollow when confidence is low', () => {
    const pitPrediction = {
      available: true, spline: 0.5, confidence: 'high' as const,
      damage: { visible: true, spline: 0.25, confidence: 'low' as const }
    }
    const base = { outline, scene: scene([]) }
    expect(buildTrackMapView({ ...base, pitPrediction }).markers).toEqual([
      { ...outline[1]!, spline: 0.25, kind: 'damage', label: '+', fill: TRACK_MAP_DAMAGE_COLOR, hollow: true },
      { ...outline[2]!, spline: 0.5, kind: 'pit', label: 'P', fill: TRACK_MAP_PIT_COLOR, hollow: false }
    ])
    expect(buildTrackMapView({ ...base, pitPrediction, showPitPrediction: false }).markers).toEqual([])
    expect(buildTrackMapView({ ...base, pitPrediction: { ...pitPrediction, available: false } }).markers).toEqual([])
    expect(buildTrackMapView({ ...base, pitPrediction: { available: true, spline: null } }).markers).toEqual([])
    expect(buildTrackMapView({ ...base, pitPrediction: null }).markers).toEqual([])
    const noDamage = buildTrackMapView({ ...base, pitPrediction: { ...pitPrediction, damage: { visible: false, spline: 0.25 } } })
    expect(noDamage.markers.map(marker => marker.kind)).toEqual(['pit'])
  })

  it('hides the pit prediction while the pilot is watching another car', () => {
    const pitPrediction = { available: true, spline: 0.5, confidence: 'high' as const, pitTimeBaseS: 46.4 }
    const spectating = buildTrackMapView({ outline, scene: scene([], { localInFocus: false }), pitPrediction })
    expect(spectating.markers).toEqual([])
    expect(spectating.caption).toBeNull()
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
    expect(buildTrackMapView({ outline, scene: scene([]), pitPrediction: basis }).caption)
      .toBe('SOSTA 3,4 s · MFD · T 46,4 s')
    expect(buildTrackMapView({ outline, scene: scene([]), pitPrediction: basis, showPitPrediction: false }).caption)
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
    expect(advanceTrackMapMotion({ 'car:1': 0.02, 'car:2': 0.70, 'marker:pit': 0.35 }, items, 16)['car:2']).toBe(0.31)

    // A new stop time moves only the marker far: that one still travels along the line.
    const newStop = advanceTrackMapMotion({ 'car:1': 0.02, 'car:2': 0.31, 'marker:pit': 0.70 }, items, 16)
    expect(newStop['marker:pit']).not.toBe(0.35)
    expect(newStop['marker:pit']).toBeLessThan(0.70)

    // First sighting starts on target; an item that disappeared is dropped.
    expect(advanceTrackMapMotion({ 'car:9': 0.5 }, items, 16)).toEqual({ 'car:1': 0.02, 'car:2': 0.31, 'marker:pit': 0.35 })
  })

  it('carries the lap position of every dot so the renderer can move it along the line', () => {
    const view = buildTrackMapView({ outline, scene: scene([sceneCar({ id: 2, lapPosition: 0.25 }), sceneCar({ id: 1, lapPosition: 0.5 })]) })
    expect(view.dots.map(dot => [dot.carIndex, dot.spline])).toEqual([[2, 0.25], [1, 0.5]])
  })

  it('finds where the outline really ends once rotated, to keep the caption close to it', () => {
    // The rectangle is wide and short: unrotated it stops well above the
    // canvas edge, rotated by 90 degrees it reaches it.
    expect(rotatedOutlineBottom(outline, 0)).toBeCloseTo(TRACK_MAP_CANVAS * 0.75)
    expect(rotatedOutlineBottom(outline, 90)).toBeCloseTo(TRACK_MAP_CANVAS)
    expect(rotatedOutlineBottom(outline, 270)).toBeCloseTo(TRACK_MAP_CANVAS)
    expect(rotatedOutlineBottom([], 0)).toBeNull()
  })

  it('serialises the outline for an SVG polyline', () => {
    expect(outlineToPath(outline.slice(0, 2))).toBe('0.0,180.0 720.0,180.0')
  })
})
