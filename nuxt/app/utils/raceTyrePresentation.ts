import type { FastStateTyre } from '~/composables/useFastStatePoller'

// Measured reference rules; Classic keeps its independent coaching labels.
export function raceSlip(wheelSlip: number | null | undefined) {
  const raw = typeof wheelSlip === 'number' && Number.isFinite(wheelSlip) ? wheelSlip : 0
  const limits = [1, 1.4, 1.5, 1.7]
  const colors = ['#ffffff', '#6dff38', '#ffeb38', '#ff9838', '#ff3838']
  const band = limits.findIndex(limit => raw < limit)
  return { height: raw < 0.1 ? 0 : Math.min(56, raw * 28), color: colors[band < 0 ? 4 : band]! }
}

/**
 * HUD style v2 (27/10, revised 28/10, third round 28/10): Race tyres laid out like a car.
 * The viewBox is only as tall as the content (no space kept for hidden elements); the
 * native window keeps its scale contract. Right corners mirror left around x = 83.
 * Pressure values sit above the front tyres and below the rear ones; one averaged brake
 * reading per axle sits between that axle's two brakes.
 */
export const RACE_TYRE_GEOMETRY = Object.freeze({
  width: 166, height: 195, centerX: 83,
  tyreWidth: 30, tyreHeight: 44, tyreRadius: 2.5,
  slipWidth: 9,
  brakeWidth: 10, brakeHeight: 30, brakeRadius: 1.5,
  frontTop: 43, rearTop: 109,
  midTop: 90, midBottom: 106, midText: 102.5,
  // Axle brake reading on the centre line x = 83: the 12-unit temperature vertically centred
  // on the axle (baseline + 4 ≈ half its cap height), the pad wear right underneath it.
  axleTempDy: 4, axlePadDy: 17,
  // ENGINE OFF / LIMITER ON boxes (square corners), centred on the front / rear axle.
  statusWidth: 80, statusHeight: 48,
})

export type RaceTyreValueKind = 'primary' | 'average' | 'loss'

/** Centre line of the front or rear axle (tyres, brakes, axle brake reading, status box). */
export function raceAxleCenterY(rear: boolean) {
  return (rear ? RACE_TYRE_GEOMETRY.rearTop : RACE_TYRE_GEOMETRY.frontTop) + RACE_TYRE_GEOMETRY.tyreHeight / 2
}

/** Columns from the outside in, plus the value order: front pressure first, rear pressure last. */
export function raceTyreCorner(index: number) {
  const G = RACE_TYRE_GEOMETRY
  const rear = index > 1
  const right = index % 2 === 1
  const top = rear ? G.rearTop : G.frontTop
  const centerY = raceAxleCenterY(rear)
  const bottom = top + G.tyreHeight
  // Front: above the tyre, top→bottom pressure, AVG, loss. Rear: below the tyre, loss, AVG, pressure.
  const valueLines: Array<{ kind: RaceTyreValueKind, y: number }> = rear
    ? [{ kind: 'loss', y: bottom + 12 }, { kind: 'average', y: bottom + 25 }, { kind: 'primary', y: bottom + 38 }]
    : [{ kind: 'primary', y: top - 29 }, { kind: 'average', y: top - 16 }, { kind: 'loss', y: top - 3 }]
  // Left side from the edge: slip bar at 2, tyre at 12, brake at 44; the right side mirrors it.
  const mirror = (x: number, width: number) => right ? G.width - x - width : x
  const tyreX = mirror(12, G.tyreWidth)
  return {
    rear, right, top, centerY, valueLines, valuesX: tyreX + G.tyreWidth / 2,
    slipX: mirror(2, G.slipWidth), tyreX, brakeX: mirror(44, G.brakeWidth),
  }
}

type AxleBrakeSource = { brakeTempC?: number | null, padLifePct?: number | null }

function presentAverage(values: Array<number | null | undefined>) {
  const present = values.filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
  return present.length ? present.reduce((sum, value) => sum + value, 0) / present.length : null
}

/**
 * One brake reading per axle, like ACC Drive: the mean brake temperature and pad wear of
 * that axle's wheels. A missing side does not count; with no side at all the value is null.
 */
export function raceAxleBrake(wheels: AxleBrakeSource[]) {
  return {
    brakeTempC: presentAverage(wheels.map(wheel => wheel.brakeTempC)),
    padLifePct: presentAverage(wheels.map(wheel => wheel.padLifePct)),
  }
}

export function raceNumber(value: number | null | undefined, digits = 0) {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '--'
  // Temperatures use Convert.ToInt32 in the reference (ties to even).
  if (digits === 0) {
    const lower = Math.floor(value)
    return String(value - lower === .5 ? lower + Math.abs(lower % 2) : Math.round(value))
  }
  return value.toFixed(digits)
}

export function raceDamageTime(ms: number | null | undefined) {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) return '--:--.---'
  const value = Math.trunc(ms)
  return `${Math.floor(value / 60000)}:${String(Math.floor(value / 1000) % 60).padStart(2, '0')}.${String(value % 1000).padStart(3, '0')}`
}

export function racePressureFlash(tyre: FastStateTyre, nowMs: number) {
  const event = tyre.racePressure
  const age = event?.eventTs == null ? Infinity : nowMs - event.eventTs * 1000
  return event && event.eventSeq > 0 && age >= 0 && age < 2000
    ? { key: `${tyre.id}:${event.eventSeq}:${event.eventTs}`, delay: `${-age}ms` } : null
}
