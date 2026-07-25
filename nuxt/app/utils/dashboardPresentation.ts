import type { FastOverlayState } from '~/composables/useFastStatePoller'

export interface DashboardOptions {
  electronicsReference: boolean
  rpmReference: boolean
  gearReference: boolean
  speedDelta: boolean
  shiftFlashEnabled: boolean
  shiftRpmThreshold: number
  fuelCriticalFlashEnabled: boolean
  fuelCriticalLapsThreshold: number
}

export interface DashboardPresentation {
  ignitionLabel: string
  speed: string
  speedDelta: string | null
  speedDeltaFaster: boolean
  gear: string
  gearReference: string | null
  fuelPerLap: string
  fuel: string
  remainingLabel: 'Laps Left'
  remainingValue: string
  lapsLeft: string
  fuelLeft: string
  engineMap: string
  engineMapReference: string | null
  tractionControl: string
  tractionControlReference: string | null
  tractionControl2: string
  tractionControl2Reference: string | null
  abs: string
  absReference: string | null
  brakeBias: string
  cornerSpeed: string
  throttlePct: number
  brakePct: number
  rpmRatio: number
  rpmReferenceRatio: number | null
  shiftThresholdRatio: number | null
  rpmBand: 'off' | 'green' | 'blue' | 'pit'
  shiftFlash: boolean
  fuelUrgency: 'normal' | 'low' | 'critical'
  fuelCriticalPulse: boolean
  pitLimiterOn: boolean
  leftIndicatorActive: boolean
  rightIndicatorActive: boolean
  lightsStage: number
  rainLightsActive: boolean
}

export const DEFAULT_DASHBOARD_OPTIONS: DashboardOptions = {
  electronicsReference: false,
  rpmReference: false,
  gearReference: false,
  speedDelta: false,
  shiftFlashEnabled: true,
  shiftRpmThreshold: 8200,
  fuelCriticalFlashEnabled: false,
  fuelCriticalLapsThreshold: 0.5,
}

export const DASHBOARD_FUEL_LOW_LAPS_THRESHOLD = 1

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function oneDecimal(value: number | null, fallback = '--.-'): string {
  return value === null ? fallback : value.toFixed(1)
}

function integer(value: number | null): string {
  return value === null ? '-' : String(Math.round(value))
}

function fuelTime(valueMs: number | null): string {
  if (valueMs === null) return '-:--:--'
  const totalSeconds = Math.max(0, Math.floor(valueMs / 1000))
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, '0')
  const seconds = String(totalSeconds % 60).padStart(2, '0')
  return `${hours}:${minutes}:${seconds}`
}

function formatGear(value: number | null): string {
  if (value === null) return '-'
  if (value === -1) return 'R'
  if (value === 0) return 'N'
  return String(Math.max(1, Math.round(value)))
}

export function normalizeShiftRpmThreshold(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return DEFAULT_DASHBOARD_OPTIONS.shiftRpmThreshold
  return Math.round(clamp(parsed, 1000, 20000))
}

export function normalizeFuelCriticalLapsThreshold(value: unknown): number {
  const parsed = Number(value)
  if (!Number.isFinite(parsed)) return DEFAULT_DASHBOARD_OPTIONS.fuelCriticalLapsThreshold
  return Math.round(clamp(parsed, 0.1, DASHBOARD_FUEL_LOW_LAPS_THRESHOLD) * 10) / 10
}

function resolveFuelUrgency(
  state: FastOverlayState,
  criticalThreshold: number,
): DashboardPresentation['fuelUrgency'] {
  if (!state.isFresh || !state.isLive || !state.ignitionOn || !state.isEngineRunning) return 'normal'
  if (state.fuelLapsRemaining === null) return 'normal'
  if (state.fuelLapsRemaining <= criticalThreshold) return 'critical'
  if (state.fuelLapsRemaining <= DASHBOARD_FUEL_LOW_LAPS_THRESHOLD) return 'low'
  return 'normal'
}

function resolveRpmBand(
  state: FastOverlayState,
  rpm: number,
  threshold: number,
): DashboardPresentation['rpmBand'] {
  if (!state.ignitionOn || !state.isEngineRunning) return 'off'
  if (state.pitLimiterOn) return 'pit'

  if (rpm < threshold) return 'green'
  return 'blue'
}

export function buildDashboardPresentation(
  state: FastOverlayState,
  options: DashboardOptions = DEFAULT_DASHBOARD_OPTIONS,
): DashboardPresentation {
  const rpm = state.rpm ?? 0
  const maxRpm = state.maxRpm && state.maxRpm > 0 ? state.maxRpm : null
  const threshold = normalizeShiftRpmThreshold(options.shiftRpmThreshold)
  const fuelCriticalThreshold = normalizeFuelCriticalLapsThreshold(options.fuelCriticalLapsThreshold)
  const referenceVisible = state.isFresh && state.isLive && state.ignitionOn && state.isEngineRunning
  const fuelUrgency = resolveFuelUrgency(state, fuelCriticalThreshold)

  const remainingLabel = 'Laps Left' as const
  const remainingValue = oneDecimal(state.fuelLapsRemaining)

  return {
    ignitionLabel: state.ignitionOn && state.isEngineRunning ? String(Math.round(rpm)) : 'IGNITION OFF',
    speed: String(Math.round(state.speedKmh ?? 0)),
    speedDelta: referenceVisible && options.speedDelta && state.speedDeltaKmh !== null
      ? Math.abs(state.speedDeltaKmh).toFixed(1) : null,
    speedDeltaFaster: referenceVisible && options.speedDelta && (state.speedDeltaKmh ?? 0) > 0,
    gear: formatGear(state.gear),
    gearReference: referenceVisible && options.gearReference && state.referenceGear !== null
      ? formatGear(state.referenceGear) : null,
    fuelPerLap: state.fuelPerLapL === null ? '--.--' : state.fuelPerLapL.toFixed(2),
    fuel: oneDecimal(state.fuelL),
    remainingLabel,
    remainingValue,
    lapsLeft: oneDecimal(state.fuelLapsRemaining),
    fuelLeft: fuelTime(state.fuelLeftTimeMs),
    engineMap: integer(state.engineMap),
    engineMapReference: referenceVisible && options.electronicsReference && state.referenceEngineMap !== null
      ? integer(state.referenceEngineMap) : null,
    tractionControl: integer(state.tractionControl),
    tractionControlReference: referenceVisible && options.electronicsReference && state.referenceTractionControl !== null
      ? integer(state.referenceTractionControl) : null,
    tractionControl2: integer(state.tractionControl2),
    tractionControl2Reference: referenceVisible && options.electronicsReference && state.referenceTractionControl2 !== null
      ? integer(state.referenceTractionControl2) : null,
    abs: integer(state.abs),
    absReference: referenceVisible && options.electronicsReference && state.referenceAbs !== null
      ? integer(state.referenceAbs) : null,
    brakeBias: state.brakeBiasPct === null ? '--.-' : state.brakeBiasPct.toFixed(1),
    cornerSpeed: state.cornerSpeedKmh === null ? '0' : integer(state.cornerSpeedKmh),
    throttlePct: clamp((state.gas ?? 0) * 100, 0, 100),
    brakePct: clamp((state.brake ?? 0) * 100, 0, 100),
    rpmRatio: maxRpm === null ? 0 : clamp(rpm / maxRpm, 0, 1),
    rpmReferenceRatio: referenceVisible && options.rpmReference
      && maxRpm !== null && state.referenceRpm !== null
      ? clamp(state.referenceRpm / maxRpm, 0, 1)
      : null,
    shiftThresholdRatio: referenceVisible && options.rpmReference && options.shiftFlashEnabled && maxRpm !== null
      ? clamp(threshold / maxRpm, 0, 1) : null,
    rpmBand: resolveRpmBand(state, rpm, threshold),
    shiftFlash: state.isFresh
      && state.isLive
      && state.ignitionOn
      && state.isEngineRunning
      && options.shiftFlashEnabled
      && rpm >= threshold,
    fuelUrgency,
    fuelCriticalPulse: fuelUrgency === 'critical' && options.fuelCriticalFlashEnabled,
    pitLimiterOn: state.pitLimiterOn,
    leftIndicatorActive: state.directionLightsLeft,
    rightIndicatorActive: state.directionLightsRight,
    lightsStage: Math.max(0, Math.min(2, Math.round(state.lightsStage ?? 0))),
    rainLightsActive: state.rainLights,
  }
}
