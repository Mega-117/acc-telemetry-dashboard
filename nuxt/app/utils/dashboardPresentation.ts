import type { FastOverlayState } from '~/composables/useFastStatePoller'
import { resolveOptimalShiftRpm } from '~/config/optimalShiftRpm'
import {
  formatStandingsDriverName,
  formatStandingsLapTime,
} from '~/services/overlay/standingsPresentation'
import type { StandingsCarSnapshot, StandingsLapSnapshot } from '~/services/overlay/standingsPresentation'
import { SESSION_TYPES } from '~/utils/telemetryFormat'

export interface DashboardOptions {
  electronicsReference: boolean
  rpmReference: boolean
  gearReference: boolean
  speedDelta: boolean
  fuelCriticalFlashEnabled: boolean
  fuelCriticalLapsThreshold: number
}

export interface DashboardSpectatorTiming {
  label: 'CURRENT' | 'LAST' | 'BEST'
  lapTime: string
  splits: [string, string, string]
  validity: 'VALID' | 'INVALID' | '—'
}

export interface DashboardSpectatorPresentation {
  driverName: string
  carLabel: string
  position: string
  laps: string
  progress: string
  session: string
  timings: [
    DashboardSpectatorTiming,
    DashboardSpectatorTiming,
    DashboardSpectatorTiming,
  ]
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
  tractionControlActive: boolean
  tractionControlOffWarning: boolean
  absActive: boolean
  brakeBias: string
  inputsAvailable: boolean
  cornerSpeed: string
  cornerSpeedTone: 'neutral' | 'faster' | 'slower'
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
  spectator: DashboardSpectatorPresentation | null
}

export const DEFAULT_DASHBOARD_OPTIONS: DashboardOptions = {
  electronicsReference: false,
  rpmReference: false,
  gearReference: false,
  speedDelta: false,
  fuelCriticalFlashEnabled: false,
  fuelCriticalLapsThreshold: 0.5,
}

export const DASHBOARD_FUEL_LOW_LAPS_THRESHOLD = 1

const NORMALIZED_SESSION_LABELS: Readonly<Record<number, string>> = Object.freeze({
  [SESSION_TYPES.PRACTICE]: 'PRACTICE',
  [SESSION_TYPES.QUALIFY]: 'QUALIFY',
  [SESSION_TYPES.RACE]: 'RACE',
})

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max)
}

function oneDecimal(value: number | null, fallback = '--.-'): string {
  return value === null ? fallback : value.toFixed(1)
}

function integer(value: number | null, fallback = '-'): string {
  return value === null ? fallback : String(Math.round(value))
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

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

function normalizedSessionLabel(value: unknown): string | null {
  const sessionType = finiteNumber(value)
  if (sessionType === null || !Number.isInteger(sessionType)) return null
  return NORMALIZED_SESSION_LABELS[sessionType] ?? null
}

function nonNegativeInteger(value: unknown): number | null {
  const numeric = finiteNumber(value)
  return numeric !== null && Number.isInteger(numeric) && numeric >= 0 ? numeric : null
}

function positiveInteger(value: unknown): number | null {
  const numeric = nonNegativeInteger(value)
  return numeric !== null && numeric > 0 ? numeric : null
}

function spectatorLapTime(value: unknown): string {
  return formatStandingsLapTime(value) ?? '—'
}

function spectatorSplits(lap: StandingsLapSnapshot | null | undefined): [string, string, string] {
  const raw = Array.isArray(lap?.splits_ms) ? lap.splits_ms : []
  return [0, 1, 2].map(index => spectatorLapTime(raw[index])) as [string, string, string]
}

function spectatorValidity(lap: StandingsLapSnapshot | null | undefined): DashboardSpectatorTiming['validity'] {
  if (lap?.is_invalid === true) return 'INVALID'
  if (lap?.is_invalid === false) return 'VALID'
  return '—'
}

function spectatorSessionTime(value: number | null): string | null {
  if (value === null || !Number.isFinite(value) || value < 0) return null
  const totalSeconds = Math.floor(value / 1000)
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = String(totalSeconds % 60).padStart(2, '0')
  return hours > 0
    ? `${hours}:${String(minutes).padStart(2, '0')}:${seconds}`
    : `${minutes}:${seconds}`
}

function spectatorTiming(
  label: DashboardSpectatorTiming['label'],
  lapTimeMs: number | null,
  lap: StandingsLapSnapshot | null | undefined,
): DashboardSpectatorTiming {
  return {
    label,
    lapTime: spectatorLapTime(lapTimeMs),
    splits: spectatorSplits(lap),
    validity: spectatorValidity(lap),
  }
}

function buildDashboardSpectatorPresentation(
  state: FastOverlayState,
  car: StandingsCarSnapshot | null,
): DashboardSpectatorPresentation | null {
  if (state.dataSource !== 'focused') return null
  const driverName = car ? formatStandingsDriverName(car) : 'NoData'
  const raceNumber = positiveInteger(car?.race_number)
  const position = positiveInteger(car?.position)
  const laps = nonNegativeInteger(car?.laps)
  const progress = finiteNumber(state.normalizedCarPosition)
  const sessionLabel = normalizedSessionLabel(state.sessionType) ?? 'SESSION'
  const sessionTime = spectatorSessionTime(state.sessionTimeLeftMs)
  return {
    driverName: driverName === 'NoData' ? '—' : driverName,
    carLabel: raceNumber !== null ? `#${raceNumber}` : car ? `CAR ${car.car_index}` : 'CAR —',
    position: position === null ? 'P—' : `P${position}`,
    laps: laps === null ? '—' : String(laps),
    progress: progress === null ? '—' : `${(clamp(progress, 0, 1) * 100).toFixed(1)}%`,
    session: sessionTime ? `${sessionLabel} · ${sessionTime}` : sessionLabel,
    timings: [
      spectatorTiming('CURRENT', state.currentLapTimeMs, car?.current_lap),
      spectatorTiming('LAST', state.lastLapTimeMs, car?.last_lap),
      spectatorTiming('BEST', state.bestLapTimeMs, car?.best_lap),
    ],
  }
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

function interventionVisible(state: FastOverlayState, active: boolean): boolean {
  return active
    && state.isFresh
    && state.isLive
    && state.ignitionOn
    && state.isEngineRunning
    && !state.isInPitLane
}

function resolveRpmBand(
  state: FastOverlayState,
  rpm: number,
  threshold: number | null,
): DashboardPresentation['rpmBand'] {
  if (!state.ignitionOn || !state.isEngineRunning) return 'off'
  if (state.pitLimiterOn) return 'pit'
  if (threshold === null || rpm < threshold) return 'green'
  return 'blue'
}

export function buildDashboardPresentation(
  state: FastOverlayState,
  options: DashboardOptions = DEFAULT_DASHBOARD_OPTIONS,
  focusedCar: StandingsCarSnapshot | null = null,
): DashboardPresentation {
  const spectatorMode = state.dataSource === 'focused'
  const rpmValid = typeof state.rpm === 'number' && Number.isFinite(state.rpm) && state.rpm >= 0
  const rpm = rpmValid ? state.rpm as number : 0
  const maxRpm = state.maxRpm && state.maxRpm > 0 ? state.maxRpm : null
  const threshold = resolveOptimalShiftRpm(state.context?.car)
  const fuelCriticalThreshold = normalizeFuelCriticalLapsThreshold(options.fuelCriticalLapsThreshold)
  const referenceVisible = state.isFresh && state.isLive && state.ignitionOn && state.isEngineRunning
  const fuelUrgency = resolveFuelUrgency(state, fuelCriticalThreshold)
  const cornerDelta = state.cornerSpeedMode === 'delta' ? state.cornerSpeedDeltaKmh : null
  const cornerValue = cornerDelta ?? state.cornerSpeedKmh

  const remainingLabel = 'Laps Left' as const
  const remainingValue = oneDecimal(state.fuelLapsRemaining)

  return {
    ignitionLabel: spectatorMode
      ? '—'
      : state.ignitionOn && state.isEngineRunning
        ? state.pitLimiterOn ? 'PIT LIMITER ON' : String(Math.round(rpm))
        : 'IGNITION OFF',
    speed: spectatorMode && state.speedKmh === null ? '—' : integer(state.speedKmh),
    speedDelta: referenceVisible && options.speedDelta && state.speedDeltaKmh !== null
      ? Math.abs(state.speedDeltaKmh).toFixed(1) : null,
    speedDeltaFaster: referenceVisible && options.speedDelta && (state.speedDeltaKmh ?? 0) > 0,
    gear: spectatorMode && state.gear === null ? '—' : formatGear(state.gear),
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
    tractionControlActive: interventionVisible(state, state.tractionControlInAction),
    tractionControlOffWarning: referenceVisible && state.tractionControl === 0,
    absActive: interventionVisible(state, state.absInAction),
    brakeBias: state.brakeBiasPct === null ? '--.-' : state.brakeBiasPct.toFixed(1),
    cornerSpeed: spectatorMode ? '-' : integer(cornerValue, '0'),
    cornerSpeedTone: cornerDelta === null || cornerDelta === 0
      ? 'neutral'
      : cornerDelta > 0 ? 'faster' : 'slower',
    inputsAvailable: state.gas !== null && state.brake !== null,
    throttlePct: clamp((state.gas ?? 0) * 100, 0, 100),
    brakePct: clamp((state.brake ?? 0) * 100, 0, 100),
    rpmRatio: maxRpm === null ? 0 : clamp(rpm / maxRpm, 0, 1),
    rpmReferenceRatio: referenceVisible && options.rpmReference
      && maxRpm !== null && state.referenceRpm !== null
      ? clamp(state.referenceRpm / maxRpm, 0, 1)
      : null,
    shiftThresholdRatio: referenceVisible && options.rpmReference && threshold !== null && maxRpm !== null
      ? clamp(threshold / maxRpm, 0, 1) : null,
    rpmBand: resolveRpmBand(state, rpm, threshold),
    shiftFlash: state.isFresh
      && state.isLive
      && state.ignitionOn
      && state.isEngineRunning
      && threshold !== null
      && rpmValid
      && rpm >= threshold,
    fuelUrgency,
    fuelCriticalPulse: fuelUrgency === 'critical' && options.fuelCriticalFlashEnabled,
    pitLimiterOn: state.pitLimiterOn,
    leftIndicatorActive: state.directionLightsLeft,
    rightIndicatorActive: state.directionLightsRight,
    lightsStage: Math.max(0, Math.min(2, Math.round(state.lightsStage ?? 0))),
    rainLightsActive: state.rainLights,
    spectator: buildDashboardSpectatorPresentation(state, focusedCar),
  }
}
