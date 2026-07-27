import type { FastOverlayState, FastStateInfo } from '~/composables/useFastStatePoller'

export interface InfoOptions {
  showYellowFlag: boolean
  showDelta: boolean
  showStint: boolean
  showQFuel: boolean
  showFuelLeft: boolean
  showIncidents: boolean
  showGrip: boolean
  showPitExitTraffic: boolean
  showOptimal: boolean
  showBest: boolean
  showDamage: boolean
  showTime: boolean
}

export interface InfoRow {
  id: string
  label: string
  value: string
  tone: 'default' | 'yellow' | 'orange' | 'green' | 'red'
  localTime?: boolean
  lapTimer?: boolean
}

export interface InfoPresentation {
  delta: {
    visible: boolean
    value: string
    side: 'negative' | 'positive' | 'zero'
    ratio: number
    purple: boolean
  }
  yellowFlagActive: boolean
  rows: InfoRow[]
}

export interface InfoTargetSettings {
  active: boolean
  targetTimeMs: number | null
  toleranceMs: number
  keepBetweenSessions: boolean
}

export type InfoTargetOutcome = 'neutral' | 'inside' | 'outside'

export const DEFAULT_INFO_OPTIONS: InfoOptions = {
  showYellowFlag: true,
  showDelta: true,
  showStint: true,
  showQFuel: false,
  showFuelLeft: false,
  showIncidents: false,
  showGrip: true,
  showPitExitTraffic: true,
  showOptimal: false,
  showBest: true,
  showDamage: true,
  showTime: false,
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function positive(value: number | null | undefined): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null
}

export function formatInfoLapTime(valueMs: number | null | undefined): string {
  const value = positive(valueMs)
  if (value === null) return '--:--.---'
  const total = Math.max(0, Math.round(value))
  const minutes = Math.floor(total / 60_000)
  const seconds = Math.floor((total % 60_000) / 1000)
  const milliseconds = total % 1000
  return `${minutes}:${String(seconds).padStart(2, '0')}.${String(milliseconds).padStart(3, '0')}`
}

export function formatInfoLocalTime(valueMs: number): string {
  const date = new Date(valueMs)
  const hours = String(date.getHours()).padStart(2, '0')
  const minutes = String(date.getMinutes()).padStart(2, '0')
  const seconds = String(date.getSeconds()).padStart(2, '0')
  return `${hours}:${minutes}:${seconds}`
}

export function formatInfoDuration(valueMs: number | null | undefined): string {
  const value = positive(valueMs)
  if (value === null) return '--:--.---'
  const totalSeconds = Math.floor(value / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  return `${minutes}:${String(seconds).padStart(2, '0')}.000`
}

export function formatInfoStintDuration(valueMs: number | null | undefined): string {
  if (typeof valueMs !== 'number' || !Number.isFinite(valueMs) || valueMs < 0) return '--:--.---'
  const totalSeconds = Math.floor(valueMs / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  if (hours > 0) return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  return `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function formatInfoFuelDuration(valueMs: number | null | undefined): string {
  const value = positive(valueMs)
  if (value === null) return '-:--.---'
  const totalSeconds = Math.floor(value / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}

export function formatInfoDelta(valueMs: number | null | undefined): string {
  const value = typeof valueMs === 'number' && Number.isFinite(valueMs) ? Math.round(valueMs) : 0
  const sign = value < 0 ? '-' : '+'
  return `${sign}${(Math.abs(value) / 1000).toFixed(3)}`
}

export function evaluateInfoTarget(
  lapTimeMs: number | null,
  lapValid: boolean,
  target: InfoTargetSettings | null,
): InfoTargetOutcome {
  if (!lapValid || !target?.active || positive(lapTimeMs) === null || positive(target.targetTimeMs) === null) {
    return 'neutral'
  }
  const tolerance = clamp(Math.round(target.toleranceMs || 0), 100, 1000)
  return (lapTimeMs as number) <= (target.targetTimeMs as number) + tolerance ? 'inside' : 'outside'
}

function fuelTone(value: number | null): InfoRow['tone'] {
  if (value === null) return 'default'
  return value < 0 ? 'green' : 'yellow'
}

function fuelValue(value: number | null): string {
  return value === null ? '---' : `${value.toFixed(1)}L`
}

function trafficValue(value: number | null): { value: string, tone: InfoRow['tone'] } {
  if (value === null) return { value: '--', tone: 'default' }
  if (value <= 0) return { value: 'Clear', tone: 'default' }
  if (value <= 2) return { value: String(value), tone: 'yellow' }
  if (value <= 4) return { value: String(value), tone: 'orange' }
  return { value: String(value), tone: 'red' }
}

export function buildInfoPresentation(
  state: FastOverlayState,
  options: InfoOptions = DEFAULT_INFO_OPTIONS,
): InfoPresentation {
  const info: FastStateInfo | null = state.info
  const traffic = trafficValue(info?.pitExitTraffic ?? null)
  const rows: InfoRow[] = []
  if (options.showStint) rows.push({ id: 'stint', label: 'Stint:', value: formatInfoStintDuration(info?.stintTimeLeftMs), tone: 'default' })
  if (options.showQFuel) rows.push({ id: 'q-fuel', label: `${info?.fuelLabel || 'Q-Fuel'}:`, value: fuelValue(info?.fuelNeededL ?? null), tone: fuelTone(info?.fuelNeededL ?? null) })
  if (options.showFuelLeft) rows.push({ id: 'fuel-left', label: 'Fuel Left:', value: formatInfoFuelDuration(info?.fuelLeftTimeMs), tone: (info?.fuelLeftTimeMs ?? Infinity) <= 240_000 ? 'yellow' : 'default' })
  if (options.showIncidents) rows.push({ id: 'incidents', label: 'Incidents:', value: info ? String(info.incidents) : '--', tone: 'default' })
  if (options.showGrip) rows.push({ id: 'grip', label: 'Grip:', value: info?.grip || '--', tone: 'default' })
  if (options.showPitExitTraffic && state.sessionType === 2) rows.push({ id: 'pit-exit', label: 'Pit Exit:', value: traffic.value, tone: traffic.tone })
  if (options.showOptimal) rows.push({ id: 'optimal', label: 'Optimal:', value: formatInfoLapTime(info?.optimalLapTimeMs), tone: 'default' })
  if (options.showBest) rows.push({ id: 'best', label: 'Best:', value: formatInfoLapTime(info?.bestLapTimeMs), tone: 'default' })
  if (options.showDamage) rows.push({ id: 'damage', label: 'Damage:', value: formatInfoLapTime(info?.damageTimeMs), tone: 'default' })
  if (options.showTime) rows.push({ id: 'local-time', label: 'Time:', value: '--:--:--', tone: 'default', localTime: true })
  rows.push({ id: 'lap-timer', label: 'Lap Timer:', value: formatInfoLapTime(info?.currentLapTimeMs ?? 0), tone: 'default', lapTimer: true })

  return {
    yellowFlagActive: options.showYellowFlag && state.flag === 2,
    delta: {
      visible: options.showDelta,
      value: formatInfoDelta(info?.delta.ms),
      side: info?.delta.side || 'zero',
      ratio: clamp(info?.delta.ratio ?? 0, 0, 1),
      purple: info?.delta.purple === true,
    },
    rows,
  }
}
