export const TYRE_WHEEL_IDS = ['FL', 'FR', 'RL', 'RR'] as const
export type TyreWheelId = typeof TYRE_WHEEL_IDS[number]
export type TyreWheelValues = Record<TyreWheelId, number | null>

export interface TyreMetricStats {
  high: TyreWheelValues
  avg: TyreWheelValues
  low: TyreWheelValues
}

export interface PressureRecommendationViewModel {
  status: string
  eligible: boolean
  needsAdjustment: boolean
  completedLaps: number
  requiredCompletedLaps: number
  planId: string | null
}

export interface TyreSetupViewModel {
  status: 'waiting_for_full_lap' | 'available'
  currentTyreSet: number | null
  compound: 'DRY' | 'WET' | null
  lastLap: {
    lap: number | null
    tyreSet: number | null
    compound: 'DRY' | 'WET' | null
    pressure: Pick<TyreMetricStats, 'high' | 'avg'>
    tyreTemperature: TyreMetricStats | null
    brakeTemperature: TyreMetricStats | null
    brakeCompounds: Record<TyreWheelId, number | null>
  } | null
  totalPressureLoss: TyreWheelValues
  startingPressure: {
    status: 'available' | 'unavailable'
    source: 'mfd_applied' | null
    tyreSet: number | null
    values: TyreWheelValues | null
  }
  pressureRecommendation: PressureRecommendationViewModel | null
}

function toNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null
  const parsed = typeof value === 'number' ? value : Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function emptyWheelValues(): TyreWheelValues {
  return { FL: null, FR: null, RL: null, RR: null }
}

function normalizeWheelValues(raw: any): TyreWheelValues {
  return {
    FL: toNumber(raw?.FL),
    FR: toNumber(raw?.FR),
    RL: toNumber(raw?.RL),
    RR: toNumber(raw?.RR),
  }
}

function hasEveryWheel(values: TyreWheelValues): boolean {
  return TYRE_WHEEL_IDS.every(id => values[id] !== null)
}

function hasEveryPositiveWheel(values: TyreWheelValues): boolean {
  return TYRE_WHEEL_IDS.every(id => values[id] !== null && values[id] > 0)
}

function normalizeStats(raw: any): TyreMetricStats | null {
  const high = normalizeWheelValues(raw?.high)
  const avg = normalizeWheelValues(raw?.avg)
  const low = normalizeWheelValues(raw?.low)
  return hasEveryWheel(high) && hasEveryWheel(avg) && hasEveryWheel(low)
    ? { high, avg, low }
    : null
}

function normalizeCompound(value: unknown): 'DRY' | 'WET' | null {
  return value === 'DRY' || value === 'WET' ? value : null
}

export function emptyTyreSetupViewModel(): TyreSetupViewModel {
  return {
    status: 'waiting_for_full_lap',
    currentTyreSet: null,
    compound: null,
    lastLap: null,
    totalPressureLoss: emptyWheelValues(),
    startingPressure: {
      status: 'unavailable',
      source: null,
      tyreSet: null,
      values: null,
    },
    pressureRecommendation: null,
  }
}

function normalizePressureRecommendation(raw: any): PressureRecommendationViewModel | null {
  if (!raw || typeof raw !== 'object') return null
  const completedLaps = toNumber(raw.completed_laps)
  const requiredCompletedLaps = toNumber(raw.required_completed_laps)
  if (completedLaps === null || requiredCompletedLaps === null) return null
  return {
    status: typeof raw.status === 'string' ? raw.status : 'unknown',
    eligible: raw.eligible === true,
    needsAdjustment: raw.needs_adjustment === true,
    completedLaps,
    requiredCompletedLaps,
    planId: typeof raw.plan_id === 'string' && raw.plan_id ? raw.plan_id : null,
  }
}

export function normalizeTyreSetupViewModel(raw: any): TyreSetupViewModel {
  if (!raw || typeof raw !== 'object') return emptyTyreSetupViewModel()

  const lastLapRaw = raw.last_lap
  const pressureHigh = normalizeWheelValues(lastLapRaw?.pressure?.high)
  const pressureAvg = normalizeWheelValues(lastLapRaw?.pressure?.avg)
  const hasPressureLap = hasEveryWheel(pressureHigh) && hasEveryWheel(pressureAvg)
  const setupLoss = normalizeWheelValues(lastLapRaw?.total_pressure_loss)
  const setupStartingPressure = lastLapRaw?.starting_pressure
  const startingValues = normalizeWheelValues(setupStartingPressure?.values)
  const hasExactStartingPressure = (
    setupStartingPressure?.status === 'available'
    && setupStartingPressure?.source === 'mfd_applied'
    && hasEveryPositiveWheel(startingValues)
  )

  return {
    status: raw.status === 'available' && hasPressureLap
      ? 'available'
      : 'waiting_for_full_lap',
    currentTyreSet: toNumber(raw.current_tyre_set),
    compound: normalizeCompound(raw.compound),
    lastLap: hasPressureLap
      ? {
          lap: toNumber(lastLapRaw?.lap),
          tyreSet: toNumber(lastLapRaw?.tyre_set),
          compound: normalizeCompound(lastLapRaw?.compound),
          pressure: { high: pressureHigh, avg: pressureAvg },
          tyreTemperature: normalizeStats(lastLapRaw?.tyre_temperature),
          brakeTemperature: normalizeStats(lastLapRaw?.brake_temperature),
          brakeCompounds: normalizeWheelValues(lastLapRaw?.brake_compounds),
        }
      : null,
    // SETUP is one immutable valid-lap snapshot: never read current LIVE run
    // values from the top-level payload here.
    totalPressureLoss: setupLoss,
    startingPressure: hasExactStartingPressure
      ? {
          status: 'available',
          source: 'mfd_applied',
          tyreSet: toNumber(setupStartingPressure?.tyre_set),
          values: startingValues,
        }
      : {
          status: 'unavailable',
          source: null,
          tyreSet: toNumber(setupStartingPressure?.tyre_set),
          values: null,
        },
    pressureRecommendation: normalizePressureRecommendation(raw.pressure_recommendation),
  }
}
