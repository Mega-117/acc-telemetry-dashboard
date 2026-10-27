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
 * HUD style v2 (27/10, revised 28/10): Race tyres laid out like a car inside the 166x241 viewBox
 * (the native window and its scale contract are unchanged). Right corners mirror left.
 * Pressure values sit above the front tyres and below the rear ones; tyres wide and low,
 * brakes taller and thicker, larger type so it stays readable in the small format.
 */
export const RACE_TYRE_GEOMETRY = Object.freeze({
  tyreWidth: 36, tyreHeight: 46, tyreRadius: 2.5,
  slipWidth: 4.5,
  brakeWidth: 10, brakeHeight: 34, brakeRadius: 1.5,
  frontTop: 33, rearTop: 105,
  midTop: 83, midBottom: 101, midText: 95,
  damageTop: 189,
  // Vertical shift that centres the content with and without the damage section.
  offsetWithDamage: 6, offsetWithoutDamage: 28,
})

export type RaceTyreValueKind = 'primary' | 'average' | 'loss'

/** Columns from the outside in, plus the value order: front pressure first, rear pressure last. */
export function raceTyreCorner(index: number) {
  const rear = index > 1
  const right = index % 2 === 1
  const top = rear ? RACE_TYRE_GEOMETRY.rearTop : RACE_TYRE_GEOMETRY.frontTop
  const centerY = top + RACE_TYRE_GEOMETRY.tyreHeight / 2
  const bottom = top + RACE_TYRE_GEOMETRY.tyreHeight
  // Front: above the tyre, top→bottom pressure, AVG, loss. Rear: below the tyre, loss, AVG, pressure.
  const valueLines: Array<{ kind: RaceTyreValueKind, y: number }> = rear
    ? [{ kind: 'loss', y: bottom + 10 }, { kind: 'average', y: bottom + 19 }, { kind: 'primary', y: bottom + 30 }]
    : [{ kind: 'primary', y: top - 21 }, { kind: 'average', y: top - 11.5 }, { kind: 'loss', y: top - 3 }]
  const tyreX = right ? 119 : 11
  return right
    ? { rear, right, top, centerY, valueLines, valuesX: tyreX + RACE_TYRE_GEOMETRY.tyreWidth / 2, slipX: 157.5, tyreX, brakeX: 106, brakeInfoX: 103.5 }
    : { rear, right, top, centerY, valueLines, valuesX: tyreX + RACE_TYRE_GEOMETRY.tyreWidth / 2, slipX: 4, tyreX, brakeX: 50, brakeInfoX: 62.5 }
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
