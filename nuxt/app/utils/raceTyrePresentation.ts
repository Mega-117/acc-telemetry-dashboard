import type { FastStateTyre } from '~/composables/useFastStatePoller'

// Measured reference rules; Classic keeps its independent coaching labels.
export function raceSlip(wheelSlip: number | null | undefined) {
  const raw = typeof wheelSlip === 'number' && Number.isFinite(wheelSlip) ? wheelSlip : 0
  const limits = [1, 1.4, 1.5, 1.7]
  const colors = ['#ffffff', '#6dff38', '#ffeb38', '#ff9838', '#ff3838']
  const band = limits.findIndex(limit => raw < limit)
  return { height: raw < 0.1 ? 0 : Math.min(56, raw * 28), color: colors[band < 0 ? 4 : band]! }
}

export function racePressureHeight(pressure: number | null, compound: string | null) {
  if (pressure === null || !Number.isFinite(pressure) || pressure <= 0) return 56
  return 56 * pressure / (compound === 'WET' ? 30 : 26.9)
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
