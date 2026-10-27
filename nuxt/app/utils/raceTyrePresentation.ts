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
 * HUD style v2 (27/10): Race tyres laid out like a car inside the 166x241 viewBox
 * (the native window and its scale contract are unchanged). Right corners mirror left.
 */
export const RACE_TYRE_GEOMETRY = Object.freeze({
  tyreWidth: 23, tyreHeight: 66, tyreRadius: 2.2,
  slipWidth: 4.5,
  // Lower than the tyre and a bit wider than the slip bar, centred on the tyre.
  brakeWidth: 7, brakeHeight: 26, brakeRadius: 1.3,
  frontTop: 8, rearTop: 104,
  midTop: 80, midBottom: 98, midText: 91.8,
  damageTop: 178,
  // Vertical shift that centres the content with and without the damage section.
  offsetWithDamage: 10, offsetWithoutDamage: 31,
})

export type RaceTyreValueKind = 'primary' | 'average' | 'loss'

/** Columns from the outside in, plus the value order: front pressure first, rear pressure last. */
export function raceTyreCorner(index: number) {
  const rear = index > 1
  const right = index % 2 === 1
  const top = rear ? RACE_TYRE_GEOMETRY.rearTop : RACE_TYRE_GEOMETRY.frontTop
  const centerY = top + RACE_TYRE_GEOMETRY.tyreHeight / 2
  const valueLines: Array<{ kind: RaceTyreValueKind, y: number }> = rear
    ? [{ kind: 'loss', y: centerY - 6 }, { kind: 'average', y: centerY + 2.5 }, { kind: 'primary', y: centerY + 12 }]
    : [{ kind: 'primary', y: centerY - 4 }, { kind: 'average', y: centerY + 4.5 }, { kind: 'loss', y: centerY + 13 }]
  return right
    ? { rear, right, top, centerY, valueLines, valuesX: 163, slipX: 137, tyreX: 112.5, brakeX: 104, brakeInfoX: 102 }
    : { rear, right, top, centerY, valueLines, valuesX: 3, slipX: 24.5, tyreX: 30.5, brakeX: 55, brakeInfoX: 64 }
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
