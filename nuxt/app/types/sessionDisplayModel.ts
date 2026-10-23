import type { SessionType } from '~/utils/telemetryFormat'

export interface SessionDisplayStint {
  number: number
  type: string
  intent: string
  fuelStart: number
  laps: number
  validLapsCount: number
  best: string
  bestMs: number | null
  avg: string
  avgWarning: boolean
  avgMs: number | null
  durationMs: number
  theoretical: string
  deltaVsTheo: string
  conditions: {
    weather: string
    avgAirTemp: number
    avgTrackTemp: number
  }
  breakdown: {
    base: string
    deltaTemp: string
    deltaGrip: string
  }
}

export interface SessionDisplayLap {
  completeness?: string
  validity?: string
  lap: number
  time: string
  lap_time_ms: number
  delta: string
  valid: boolean
  pit: boolean
  // PIP-591 (X-A05-24): giro di uscita box e affidabilita' dei settori arrivano fino ai calcoli
  // del dettaglio. Assenti nei dati vecchi: uscita box = no, settori = affidabili.
  pitOut?: boolean
  sectorsReliable?: boolean
  sectors: string[]
  sector_times_ms: number[]
  fuel: number
  airTemp: number
  roadTemp?: number
  weather: string
  grip: string
}

export interface SessionDisplayModel {
  id: string
  track: string
  trackId: string
  type: SessionType | 'unknown'
  date: string
  time: string
  car: string
  startConditions: {
    weather: string
    airTemp: number
    trackTemp: number
  }
  bestQualy: string
  bestRace: string
  theoQualy: string
  theoRace: string
  bestDeltaQ: { value: string; stintNum: number }
  bestDeltaR: { value: string; stintNum: number }
  stints: SessionDisplayStint[]
  lapsData: Record<number, SessionDisplayLap[]>
}
