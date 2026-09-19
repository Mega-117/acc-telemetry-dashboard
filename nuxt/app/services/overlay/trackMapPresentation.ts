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
  current_lap?: { is_invalid?: boolean } | null
}

export interface TrackMapPitPredictionInput {
  available?: boolean
  spline?: number | null
  confidence?: 'high' | 'low' | null
  damage?: { visible?: boolean, spline?: number | null, confidence?: 'high' | 'low' | null } | null
}

export interface TrackMapDot extends TrackMapPoint {
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
}

export function buildTrackMapView (options: BuildTrackMapOptions): TrackMapView {
  const { outline } = options
  const view: TrackMapView = { outlinePath: outlineToPath(outline), dots: [], markers: [] }
  if (outline.length === 0) return view

  const isRace = options.sessionType === SESSION_TYPE_RACE
  const localIndex = finite(options.localCarIndex)
  let localSeen = false
  for (const car of options.cars ?? []) {
    const carIndex = finite(car?.car_index)
    if (carIndex === null || car.has_realtime === false) continue
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
        ...point, carIndex: localIndex, diameter: DIAMETER_HIGHLIGHT, fill: '#FF0000', text: '#FFFFFF',
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
        ...damagePoint, kind: 'damage', label: '+', fill: TRACK_MAP_DAMAGE_COLOR, hollow: damage?.confidence !== 'high'
      })
    }
    const pitPoint = pointAtSpline(outline, prediction.spline)
    if (pitPoint) {
      view.markers.push({
        ...pitPoint, kind: 'pit', label: 'P', fill: TRACK_MAP_PIT_COLOR, hollow: prediction.confidence !== 'high'
      })
    }
  }
  return view
}
