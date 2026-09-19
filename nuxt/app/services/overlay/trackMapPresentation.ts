// PIP-428 — Track Map HUD: pure presentation, no Vue, no IPC, no clock.
//
// Geometry, sizes and colours replicate ACC Drive 7.8.1 (TrackPointsService,
// TrackPointPositionManager, CarColorManager, TrackMapWindow.xaml): the centre
// line is normalised on a square canvas, every car and marker sits on
// `outline[(n - 1) * spline]`, and the whole map is rotated by 270 degrees.
// The pit prediction markers only render what the logger declares
// (fast_state.pit_prediction): nothing is estimated here.

export const TRACK_MAP_CANVAS = 720
export const TRACK_MAP_ROTATION_DEG = 270
export const TRACK_MAP_MARKER_DIAMETER = 40
export const TRACK_MAP_PIT_COLOR = '#8A2BE2'
export const TRACK_MAP_DAMAGE_COLOR = '#0000FF'

const CAR_LOCATION_PIT_LANE = 2
const CAR_LOCATION_PIT_ENTRY = 3
const SESSION_TYPE_RACE = 10
const SLOW_CAR_KMH = 30
const DIAMETER_NORMAL = 24
const DIAMETER_HIGHLIGHT = 34

const CLASS_COLORS: Record<string, { fill: string, text: string }> = {
  st: { fill: '#FFA500', text: '#000000' },
  cup: { fill: '#00FF00', text: '#000000' },
  gt3: { fill: '#D3D3D3', text: '#000000' },
  gt4: { fill: '#0000FF', text: '#FFFFFF' },
  chl: { fill: '#FF0000', text: '#000000' },
  tcx: { fill: '#800080', text: '#000000' },
  gt2: { fill: '#8B0000', text: '#FFFFFF' }
}
const DEFAULT_CLASS_COLOR = CLASS_COLORS.gt3!

export interface TrackMapPoint { x: number, y: number }

export interface TrackMapCarInput {
  car_index?: number | null
  race_number?: number | null
  car_class?: string | null
  position?: number | null
  cup_position?: number | null
  spline_position?: number | null
  kmh?: number | null
  car_location?: number | null
  has_realtime?: boolean
  realtime_updated_at_ms?: number | null
  current_lap?: { is_invalid?: boolean } | null
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

export interface TrackMapPitBasisInput {
  pitTimeBaseS?: number | null
  pitTimeSource?: string | null
  stopTimeS?: number | null
}

const PIT_SOURCE_LABELS: Record<string, string> = {
  'mfd-screen': 'MFD',
  'acc-drive-sg30': 'stima',
  manual: 'manuale'
}

function seconds (value: number): string {
  return `${value.toFixed(1).replace('.', ',')} s`
}

/** "SOSTA 3,4 s · MFD · T 46,4 s": the stationary seconds, where they come from, the total. */
export function buildPitCaption (basis: TrackMapPitBasisInput | null | undefined): string | null {
  const total = finite(basis?.pitTimeBaseS)
  if (total === null) return null
  const source = PIT_SOURCE_LABELS[String(basis?.pitTimeSource ?? '')] ?? null
  const stop = finite(basis?.stopTimeS)
  const parts = stop !== null ? [`SOSTA ${seconds(stop)}`] : []
  if (source) parts.push(source)
  parts.push(`T ${seconds(total)}`)
  return parts.join(' · ')
}

function finite (value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number.NaN
  return Number.isFinite(parsed) ? parsed : null
}

// ACC Drive draws its circle ("Circle of Doom") smaller than a track: it scales
// the points by 1.3 but the fitting box by 1.3 squared, leaving room around it
// for the dots and their numbers.
export const TRACK_MAP_CIRCLE_KEY = 'circle'
export const TRACK_MAP_CIRCLE_FILL = 1 / 1.3

/** ACC Drive `ConvertCoordinateToCanvasPointCenter`: keep aspect, centre on the canvas. */
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

export function outlineToPath (outline: ReadonlyArray<TrackMapPoint>): string {
  return outline.map(point => `${point.x.toFixed(1)},${point.y.toFixed(1)}`).join(' ')
}

function isInPit (car: TrackMapCarInput): boolean {
  return car.car_location === CAR_LOCATION_PIT_LANE || car.car_location === CAR_LOCATION_PIT_ENTRY
}

function carColors (car: TrackMapCarInput, flags: { isLocal: boolean, leadsRace: boolean, leadsClass: boolean, isRace: boolean }) {
  const base = CLASS_COLORS[String(car.car_class ?? '').trim().toLowerCase()] ?? DEFAULT_CLASS_COLOR
  if (flags.isLocal) return { fill: '#FF0000', text: '#FFFFFF' }
  if (flags.leadsRace) return { fill: '#FFA500', text: base.text }
  if (isInPit(car)) return base
  // A car crawling on track is a hazard: ACC Drive paints it yellow.
  if ((finite(car.kmh) ?? Infinity) < SLOW_CAR_KMH) return { fill: '#FFFF00', text: '#000000' }
  if (flags.leadsClass) return { fill: base.fill, text: '#000000' }
  if (!flags.isRace && car.current_lap?.is_invalid === true) return { fill: '#00FFFF', text: base.text }
  return base
}

export interface BuildTrackMapOptions {
  outline: ReadonlyArray<TrackMapPoint>
  cars: ReadonlyArray<TrackMapCarInput> | null | undefined
  localCarIndex: number | null | undefined
  localSpline?: number | null
  sessionType?: number | null
  pitPrediction?: TrackMapPitPredictionInput | null
  showPitPrediction?: boolean
  showCarNumbers?: boolean
  // Same freshness rule as Standings: a car whose UDP data is older than the
  // snapshot TTL has left the server (its entry stays in the list) and is not drawn.
  nowMs?: number | null
  ttlMs?: number | null
}

const FUTURE_TOLERANCE_MS = 1000

function isStaleCar (car: TrackMapCarInput, nowMs: number | null, ttlMs: number | null): boolean {
  if (nowMs === null || ttlMs === null || !(ttlMs > 0)) return false
  const updatedAt = finite(car.realtime_updated_at_ms)
  if (updatedAt === null) return true
  const age = nowMs - updatedAt
  return age < -FUTURE_TOLERANCE_MS || age > ttlMs
}

export function buildTrackMapView (options: BuildTrackMapOptions): TrackMapView {
  const { outline } = options
  const view: TrackMapView = { outlinePath: outlineToPath(outline), dots: [], markers: [], caption: null }
  if (outline.length === 0) return view
  // Shown even before the marker exists: the pilot can check the basis at once.
  if (options.showPitPrediction !== false) view.caption = buildPitCaption(options.pitPrediction)

  const isRace = options.sessionType === SESSION_TYPE_RACE
  const localIndex = finite(options.localCarIndex)
  let localSeen = false
  for (const car of options.cars ?? []) {
    const carIndex = finite(car?.car_index)
    if (carIndex === null || car.has_realtime === false) continue
    // A stale local row is skipped too: shared memory draws the local car below.
    if (isStaleCar(car, finite(options.nowMs), finite(options.ttlMs))) continue
    const isLocal = localIndex !== null && carIndex === localIndex
    // The local car follows shared memory (20 Hz) instead of the slower UDP feed.
    const spline = isLocal && finite(options.localSpline) !== null ? options.localSpline : car.spline_position
    const point = pointAtSpline(outline, spline)
    if (!point) continue
    localSeen ||= isLocal
    const leadsRace = isRace && car.position === 1
    const leadsClass = car.cup_position === 1
    const highlighted = isLocal || leadsClass
    const colors = carColors(car, { isLocal, leadsRace, leadsClass, isRace })
    view.dots.push({
      ...point,
      spline: spline as number,
      carIndex,
      diameter: highlighted ? DIAMETER_HIGHLIGHT : DIAMETER_NORMAL,
      fill: colors.fill,
      text: colors.text,
      opacity: isInPit(car) ? 0.5 : 1,
      label: options.showCarNumbers && finite(car.race_number) !== null ? String(car.race_number) : null,
      zIndex: isLocal ? 1000 : leadsClass ? 2000 : colors.fill === '#FFFF00' ? 500 : 120 - (finite(car.position) ?? 0),
      isLocal
    })
  }
  // No UDP roster yet: the local car is still known from shared memory.
  if (!localSeen && localIndex !== null) {
    const point = pointAtSpline(outline, options.localSpline)
    if (point) {
      view.dots.push({
        ...point, spline: options.localSpline as number, carIndex: localIndex, diameter: DIAMETER_HIGHLIGHT, fill: '#FF0000', text: '#FFFFFF',
        opacity: 1, label: null, zIndex: 1000, isLocal: true
      })
    }
  }
  view.dots.sort((a, b) => a.zIndex - b.zIndex)

  const prediction = options.pitPrediction
  if (options.showPitPrediction !== false && prediction?.available === true) {
    const damage = prediction.damage
    const damagePoint = damage?.visible === true ? pointAtSpline(outline, damage.spline) : null
    if (damagePoint) {
      view.markers.push({
        ...damagePoint, spline: damage!.spline as number, kind: 'damage', label: '+', fill: TRACK_MAP_DAMAGE_COLOR, hollow: damage?.confidence !== 'high'
      })
    }
    const pitPoint = pointAtSpline(outline, prediction.spline)
    if (pitPoint) {
      view.markers.push({
        ...pitPoint, spline: prediction.spline as number, kind: 'pit', label: 'P', fill: TRACK_MAP_PIT_COLOR, hollow: prediction.confidence !== 'high'
      })
    }
  }
  return view
}
