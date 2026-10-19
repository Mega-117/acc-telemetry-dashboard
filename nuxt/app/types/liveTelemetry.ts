import type { CommonLive } from '~/services/telemetry/commonLive'
import type { TrackReferencePhase } from '~/services/spotter/trackVoiceReferences'
import type { TyreSetupViewModel } from '~/services/overlay/tyreSetupViewModel'

export interface LiveLapState {
  /** Accepted local-driver laps; live/observed car counters are separate. */
  personalLapsCompleted?: number | null
  personalLapsValid?: number | null
  gameId?: string
  sourceSessionId?: string | null
  trackVariant?: string | null
  currentLap: number | null
  lapsCompleted: number | null
  lapsValid: number | null
  lapValid: boolean | null
  lastLapValid: boolean | null
  lastLapTimeMs: number | null
  sectorHud: SectorHudState | null
  // Contesto sessione dal logger: servono al Training Tracker (PIP-95).
  track: string | null
  car: string | null
}

export type SectorHudColor = 'purple' | 'green' | 'yellow' | 'red' | 'white' | 'grey'
export type SectorHudMode = 'running' | 'last_lap'
export type SectorHudEntryState = 'pending' | 'running' | 'complete'

export interface SectorHudEntry {
  index: number
  state: SectorHudEntryState
  currentMs: number | null
  referenceMs: number | null
  bestMs: number | null
  bestReferenceMs: number | null
  deltaMs: number | null
  color: SectorHudColor
}

export interface SectorHudState {
  version: number
  mode: SectorHudMode
  lap: number | null
  referenceLap: number | null
  currentSectorIndex: number | null
  currentLapTimeMs: number | null
  lastLapTimeMs: number | null
  bestLapTimeMs: number | null
  lapValid: boolean | null
  awaitingFlyingLap: boolean
  holdUntilTs?: number | null
  sectors: SectorHudEntry[]
}


export type FastStateSlipBand = 'white' | 'green' | 'yellow' | 'orange' | 'red'
export type FastStateSlipState = 'ok' | 'limit' | 'sliding' | 'wheelspin' | 'lockup'

export interface FastStateTyre {
  temperatureTargetRatio?: number | null
  brakeTemperatureTargetRatio?: number | null
  id: 'FL' | 'FR' | 'RL' | 'RR'
  wheelSlip: number | null
  wheelSlipScaled: number | null
  slipBand: FastStateSlipBand
  slipState: FastStateSlipState
  slipRatio: number | null
  wheelSlipRaw?: number | null
  racePressure?: { variationPsi: number | null; eventSeq: number; eventTs: number | null } | null
  pressurePsi: number | null
  pressureLossPsi: number | null
  coreTempC: number | null
  brakeTempC: number | null
  brakeCompound: number | null
  padLifePct: number | null
  discLifePct: number | null
}

export interface FastStateLapPressureAverage {
  status: 'waiting_for_full_lap' | 'available'
  lap: number | null
  tyreSet: number | null
  values: Record<FastStateTyre['id'], number | null>
}

export interface FastStateContext {
  gameId?: string
  variant?: string | null
  track: string | null
  car: string | null
  sessionType: number | null
  sessionIndex: number | null
  sessionUid: string | null
  serverId: string | null
}

export interface FastStateLocalDriver {
  carIndex: number | null
  firstName: string | null
  lastName: string | null
  position: number | null
}

export interface FastStateInfo {
  initialGrip?: string | null
  delta: {
    ms: number
    available: boolean
    side: 'negative' | 'positive' | 'zero'
    ratio: number
    purple: boolean
  }
  stintTimeLeftMs: number | null
  stintTimeElapsedMs?: number | null
  fuelLabel: string
  fuelNeededL: number | null
  fuelLeftTimeMs: number | null
  fuelLeftReferenceLapMs: number | null
  incidents: number | null
  grip: string | null
  pitExitTraffic: number | null
  optimalLapTimeMs: number | null
  bestLapTimeMs: number | null
  damageTimeMs: number | null
  currentLapTimeMs: number | null
  lastLapTimeMs: number | null
  lapValid: boolean | null
  lastLapValid: boolean | null
  lapsCompleted: number | null
}

export interface FastStateDamageBodyZone {
  rawValue?: number | null
  percentage: number | null
  repairTimeMs: number | null
}

export interface FastStateDamageSuspensionCorner {
  percentage: number | null
}

export interface FastStateDamage {
  version: number
  body: Record<'front' | 'rear' | 'left' | 'right', FastStateDamageBodyZone> & {
    rawValue?: number | null
    repairTimeMs: number | null
  }
  suspension: Record<'FL' | 'FR' | 'RL' | 'RR', FastStateDamageSuspensionCorner> & {
    repairTimeMs: number | null
  }
  totalRepairTimeMs: number | null
  eventSeq: number
  eventTs: number | null
}

export type FastStatePitConfidence = 'high' | 'low' | null

// PIP-376: il logger dichiara il pallino; qui non si stima nulla.
export interface FastStatePitPrediction {
  available: boolean
  reason: string | null
  spline: number | null
  confidence: FastStatePitConfidence
  pitTimeS: number | null
  pitTimeBaseS: number | null
  pitTimeSource: string | null
  // Secondi da fermo su cui si basa il totale (null col tempo manuale).
  stopTimeS: number | null
  inPitLane: boolean
  damage: { visible: boolean, spline: number | null, confidence: FastStatePitConfidence }
}

export interface FastOverlayState {
  commonLive?: CommonLive | null
  dataSource?: 'local' | 'focused'
  context: FastStateContext | null
  localDriver: FastStateLocalDriver | null
  info: FastStateInfo | null
  sectorHud: SectorHudState | null
  damage: FastStateDamage | null
  pitPrediction: FastStatePitPrediction | null
  flag: number | null
  lapsCompleted: number | null
  currentLapTimeMs: number | null
  lastLapTimeMs: number | null
  bestLapTimeMs: number | null
  lapValid: boolean | null
  isFresh: boolean
  isLive: boolean
  ignitionOn: boolean
  isEngineRunning: boolean
  pitLimiterOn: boolean
  isInPitLane: boolean
  // PIP-556: ACC pit box and setup screen, used by the Control K context.
  isInPitBox?: boolean
  isSetupMenuVisible?: boolean
  sessionType: number | null
  normalizedCarPosition: number | null
  speedKmh: number | null
  speedDeltaKmh: number | null
  referenceSpeedKmh: number | null
  referenceRpm: number | null
  referenceGear: number | null
  referenceEngineMap: number | null
  referenceTractionControl: number | null
  referenceTractionControl2: number | null
  referenceAbs: number | null
  gas: number | null
  brake: number | null
  rpm: number | null
  maxRpm: number | null
  gear: number | null
  fuelL: number | null
  fuelPerLapL: number | null
  fuelLapsRemaining: number | null
  fuelLeftTimeMs: number | null
  sessionLapsRemaining: number | null
  sessionTimeLeftMs: number | null
  engineMap: number | null
  tractionControl: number | null
  tractionControl2: number | null
  abs: number | null
  tractionControlInAction: boolean
  absInAction: boolean
  brakeBiasPct: number | null
  cornerSpeedKmh: number | null
  cornerSpeedDeltaKmh: number | null
  cornerSpeedMode: 'empty' | 'absolute' | 'delta'
  directionLightsLeft: boolean
  directionLightsRight: boolean
  lightsStage: number | null
  rainLights: boolean
  currentTyreSet: number | null
  tyreSetAvailable: boolean
  tyreCompound: 'DRY' | 'WET' | null
  rainIntensity: number | null
  rainIntensity10Min: number | null
  rainIntensity30Min: number | null
  lapPressureAverage: FastStateLapPressureAverage
  tyreSetup: TyreSetupViewModel
  trackReferencePhase: TrackReferencePhase | null
  trackReferencesEligible: boolean
  tyres: FastStateTyre[]
}
