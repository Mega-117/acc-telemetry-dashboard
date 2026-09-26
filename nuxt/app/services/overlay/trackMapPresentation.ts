// PIP-428 — Track Map HUD: pure presentation, no Vue, no IPC, no clock.
//
// It draws a simulator-neutral scene (services/sim/trackMapScene): it does not
// know any simulator's codes. Geometry, sizes and colours replicate the track
// map of ACC Drive 7.8.1 (TrackPointsService, TrackPointPositionManager,
// CarColorManager, TrackMapWindow.xaml): the centre line is normalised on a
// square canvas and every car and marker sits on `outline[(n - 1) * lap]`.
// How the outline must be rotated and fitted comes with the map data, not from
// here. The pit prediction markers only render what the logger declares
// (fast_state.pit_prediction): nothing is estimated here.

import type { TrackMapCar, TrackMapScene } from '~/services/sim/trackMapScene'

export const TRACK_MAP_CANVAS = 720
export const TRACK_MAP_MARKER_DIAMETER = 40
export const TRACK_MAP_PULSE_DIAMETER = 40
export const TRACK_MAP_PIT_COLOR = '#8A2BE2'
export const TRACK_MAP_DAMAGE_COLOR = '#0000FF'
// Asked to the map provider instead of a track name: the lap drawn as a circle.
export const TRACK_MAP_CIRCLE_KEY = 'circle'

const SLOW_CAR_KMH = 30
const DIAMETER_NORMAL = 24
const DIAMETER_HIGHLIGHT = 34

// Class palette of the map. A class the palette does not know (another
// simulator, a new DLC) gets the neutral colour instead of failing.
const CLASS_COLORS: Record<string, { fill: string, text: string }> = {
  st: { fill: '#FFA500', text: '#000000' },
  cup: { fill: '#00FF00', text: '#000000' },
  gt3: { fill: '#D3D3D3', text: '#000000' },
  gt4: { fill: '#0000FF', text: '#FFFFFF' },
  chl: { fill: '#FF0000', text: '#000000' },
  tcx: { fill: '#800080', text: '#000000' },
  gt2: { fill: '#8B0000', text: '#FFFFFF' }
}
const NEUTRAL_CLASS_COLOR = { fill: '#D3D3D3', text: '#000000' }

export interface TrackMapPoint { x: number, y: number }

export interface TrackMapPitBasisInput {
  pitTimeBaseS?: number | null
  pitTimeSource?: string | null
  stopTimeS?: number | null
}

export interface TrackMapPitPredictionInput extends TrackMapPitBasisInput {
  available?: boolean
  spline?: number | null
  confidence?: 'high' | 'low' | null
  damage?: { visible?: boolean, spline?: number | null, confidence?: 'high' | 'low' | null } | null
}

export interface TrackMapDot extends TrackMapPoint {
  // Where on the lap the item is: the renderer moves items ALONG the line.
  spline: number
  carIndex: number
  diameter: number
  fill: string
  text: string
  opacity: number
  label: string | null
  zIndex: number
  isLocal: boolean
  // ACC Drive's pulsing ring: the car in focus and, in a race, the leader.
  pulse: boolean
}

export interface TrackMapMarker extends TrackMapPoint {
  spline: number
  kind: 'pit' | 'damage'
  label: 'P' | '+'
  fill: string
  // A single recorded passage cannot be cross-checked: drawn hollow.
  hollow: boolean
}

export interface TrackMapView {
  outlinePath: string
  dots: TrackMapDot[]
  markers: TrackMapMarker[]
  // Su che tempo si basa il pallino, cosi' il pilota lo confronta col MFD.
  caption: string | null
}

const PIT_SOURCE_LABELS: Record<string, string> = {
  'mfd-screen': 'MFD',
  'acc-drive-sg30': 'presunta'
}

function finite (value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number.NaN
  return Number.isFinite(parsed) ? parsed : null
}

function seconds (value: number): string {
  return `${value.toFixed(1).replace('.', ',')} s`
}

/**
 * "SOSTA 3,4 s · MFD · STIMA PITLANE 46,4 s": the stationary seconds, where
 * they come from, and the whole time the stop costs against staying out - the
 * pit lane crossing plus the stop, minus what the same stretch would take at
 * racing speed. That is why the marker sits that far back on the map.
 */
export function buildPitCaption (basis: TrackMapPitBasisInput | null | undefined): string | null {
  const total = finite(basis?.pitTimeBaseS)
  if (total === null) return null
  const source = PIT_SOURCE_LABELS[String(basis?.pitTimeSource ?? '')] ?? null
  const stop = finite(basis?.stopTimeS)
  const parts = stop !== null ? [`SOSTA ${seconds(stop)}`] : []
  if (source) parts.push(source)
  parts.push(`STIMA PITLANE ${seconds(total)}`)
  return parts.join(' · ')
}

/**
 * Keep aspect, centre on the canvas (ACC Drive `ConvertCoordinateToCanvasPointCenter`).
 * `fill` is the share of the canvas the outline may take; it comes with the map data.
 */
export function normalizeTrackOutline (
  points: ReadonlyArray<readonly [number, number]> | null | undefined,
  canvas = TRACK_MAP_CANVAS,
  fill = 1
): TrackMapPoint[] {
  const valid = (points ?? []).filter(point =>
    Array.isArray(point) && finite(point[0]) !== null && finite(point[1]) !== null)
  if (valid.length < 2) return []
  let minX = Infinity; let maxX = -Infinity; let minZ = Infinity; let maxZ = -Infinity
  for (const [x, z] of valid) {
    minX = Math.min(minX, x); maxX = Math.max(maxX, x)
    minZ = Math.min(minZ, z); maxZ = Math.max(maxZ, z)
  }
  const range = Math.max(maxX - minX, maxZ - minZ)
  if (!(range > 0) || !(fill > 0)) return []
  const scale = range / fill
  const centerX = (maxX + minX) / 2
  const centerZ = (maxZ + minZ) / 2
  return valid.map(([x, z]) => ({
    x: ((x - centerX) / scale + 0.5) * canvas,
    y: ((z - centerZ) / scale + 0.5) * canvas
  }))
}

/** ACC Drive `ComputeMapPosition`: index `(n - 1) * spline`, no interpolation. */
export function pointAtSpline (outline: ReadonlyArray<TrackMapPoint>, spline: unknown): TrackMapPoint | null {
  const value = finite(spline)
  if (outline.length === 0 || value === null || value < 0) return null
  const wrapped = value > 1 ? value - 1 : value
  if (wrapped > 1) return null
  return outline[Math.floor((outline.length - 1) * wrapped)] ?? null
}

const MOTION_TAU_MS = 120
const MOTION_SNAP = 1e-5

/**
 * One animation step of an item towards its target, measured on the lap and
 * not on the screen: moving x/y in a straight line makes a marker that jumps
 * (a new stop time moves it by a third of a lap) cut across the circle or the
 * infield. Along the lap, by the shorter way round, it follows the line.
 */
export function stepSplineToward (current: number, target: number, elapsedMs: number): number {
  const from = finite(current)
  const to = finite(target)
  if (to === null) return current
  if (from === null) return to
  const delta = ((((to - from) % 1) + 1.5) % 1) - 0.5
  if (Math.abs(delta) < MOTION_SNAP) return to
  if (!(elapsedMs > 0)) return from
  const next = from + delta * (1 - Math.exp(-elapsedMs / MOTION_TAU_MS))
  return ((next % 1) + 1) % 1
}

// No car covers this much of a lap between two updates: it is "return to
// pits", a session restart or data coming back after a gap. The item must
// reappear in place, not sweep the whole circuit to get there.
export const TRACK_MAP_TELEPORT_STEP = 0.05

export interface TrackMapMotionItem {
  key: string
  spline: number
  isLocal?: boolean
  // Pit markers are measured from the local car: when it teleports, so do they.
  followsLocal?: boolean
}

function lapDistance (from: number, to: number): number {
  return Math.abs(((((to - from) % 1) + 1.5) % 1) - 0.5)
}

/** Next displayed lap position of every item; an item seen for the first time starts on target. */
export function advanceTrackMapMotion (
  previous: Readonly<Record<string, number>>,
  items: ReadonlyArray<TrackMapMotionItem>,
  elapsedMs: number
): Record<string, number> {
  const localTeleported = items.some(item => item.isLocal === true && item.key in previous
    && lapDistance(previous[item.key]!, item.spline) > TRACK_MAP_TELEPORT_STEP)
  const next: Record<string, number> = {}
  for (const item of items) {
    const shown = previous[item.key]
    const snap = shown === undefined
      || (item.followsLocal === true
        ? localTeleported
        // A marker may jump far on its own (new stop time): that one travels along the line.
        : lapDistance(shown, item.spline) > TRACK_MAP_TELEPORT_STEP)
    next[item.key] = snap ? item.spline : stepSplineToward(shown, item.spline, elapsedMs)
  }
  return next
}

/**
 * Where the outline really ends on screen, once rotated: a track is centred on
 * the canvas but rarely fills it (Monza is much wider than tall), so anything
 * anchored to the canvas edge - the caption - would float far from the drawing.
 */
export function rotatedOutlineBottom (
  outline: ReadonlyArray<TrackMapPoint>,
  rotationDeg: number,
  canvas = TRACK_MAP_CANVAS
): number | null {
  if (outline.length === 0) return null
  const radians = (rotationDeg * Math.PI) / 180
  const cos = Math.cos(radians)
  const sin = Math.sin(radians)
  const centre = canvas / 2
  let bottom = -Infinity
  for (const point of outline) {
    const y = centre + (point.x - centre) * sin + (point.y - centre) * cos
    if (y > bottom) bottom = y
  }
  return Number.isFinite(bottom) ? bottom : null
}

export function outlineToPath (outline: ReadonlyArray<TrackMapPoint>): string {
  return outline.map(point => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ')
}

interface CarStyle { fill: string, text: string, diameter: number, zIndex: number, pulse: boolean }

/** One car, one style: every colour/size/stacking rule of the map lives here. */
function styleCar (car: TrackMapCar, isRace: boolean): CarStyle {
  const base = CLASS_COLORS[car.classKey ?? ''] ?? NEUTRAL_CLASS_COLOR
  const leadsRace = isRace && car.overallPosition === 1
  const leadsClass = car.classPosition === 1
  const diameter = car.isFocused || leadsClass ? DIAMETER_HIGHLIGHT : DIAMETER_NORMAL
  const pulse = car.isFocused || leadsRace
  const stacked = 120 - (car.overallPosition ?? 0)
  if (car.isFocused) return { fill: '#FF0000', text: '#FFFFFF', diameter, zIndex: 1000, pulse }
  if (leadsRace) return { fill: '#FFA500', text: base.text, diameter, zIndex: leadsClass ? 2000 : stacked, pulse }
  if (car.inPit) return { ...base, diameter, zIndex: leadsClass ? 2000 : stacked, pulse }
  // A car crawling on track is a hazard: painted yellow and kept above the pack.
  if ((car.speedKmh ?? Infinity) < SLOW_CAR_KMH) return { fill: '#FFFF00', text: '#000000', diameter, zIndex: leadsClass ? 2000 : 500, pulse }
  if (leadsClass) return { fill: base.fill, text: '#000000', diameter, zIndex: 2000, pulse }
  if (!isRace && car.lapInvalid) return { fill: '#00FFFF', text: base.text, diameter, zIndex: stacked, pulse }
  return { ...base, diameter, zIndex: stacked, pulse }
}

export interface BuildTrackMapOptions {
  outline: ReadonlyArray<TrackMapPoint>
  scene: TrackMapScene | null | undefined
  pitPrediction?: TrackMapPitPredictionInput | null
  showPitPrediction?: boolean
  // On: race number beside the dot. Off: position in the race (as ACC Drive does).
  showCarNumbers?: boolean
}

export function buildTrackMapView (options: BuildTrackMapOptions): TrackMapView {
  const { outline, scene } = options
  const view: TrackMapView = { outlinePath: outlineToPath(outline), dots: [], markers: [], caption: null }
  if (outline.length === 0) return view
  // Pit prediction belongs to the local car: while the pilot watches another
  // car the markers and their caption would describe the wrong one.
  const showPit = options.showPitPrediction !== false && scene?.localInFocus !== false
  // Shown even before the marker exists: the pilot can check the basis at once.
  if (showPit) view.caption = buildPitCaption(options.pitPrediction)

  for (const car of scene?.cars ?? []) {
    const point = pointAtSpline(outline, car.lapPosition)
    if (!point) continue
    const style = styleCar(car, scene!.isRace)
    const label = options.showCarNumbers !== false ? car.raceNumber : car.overallPosition
    view.dots.push({
      ...point,
      spline: car.lapPosition,
      carIndex: car.id,
      diameter: style.diameter,
      fill: style.fill,
      text: style.text,
      opacity: car.inPit ? 0.5 : 1,
      label: label !== null ? String(label) : null,
      zIndex: style.zIndex,
      isLocal: car.isLocal,
      pulse: style.pulse
    })
  }
  view.dots.sort((a, b) => a.zIndex - b.zIndex)

  const prediction = options.pitPrediction
  if (showPit && prediction?.available === true) {
    const pitPoint = pointAtSpline(outline, prediction.spline)
    if (pitPoint) {
      view.markers.push({
        ...pitPoint, spline: prediction.spline as number, kind: 'pit', label: 'P', fill: TRACK_MAP_PIT_COLOR, hollow: prediction.confidence !== 'high'
      })
    }
  }
  return view
}
