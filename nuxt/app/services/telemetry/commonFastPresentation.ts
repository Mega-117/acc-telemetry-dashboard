import type { FastOverlayState, FastStateTyre } from '~/types/liveTelemetry'
import { commonValue, commonBoolean, type CommonLive } from './commonLive'
import { commonSectorHud } from './commonSectorHud'

export function commonFastPresentation(live: CommonLive): Partial<FastOverlayState> {
  const value = (name: string, unit: string) => commonValue(live, name, unit)
  const lapCount = value('lap_count', 'count')
  const currentLap = value('current_lap_time', 'ms')
  const lastLap = value('last_lap_time', 'ms')
  const bestLap = value('best_lap_time', 'ms')
  const delta = value('lap_delta', 'ms')
  const valid = commonBoolean(live, 'lap_valid')
  const initialGrip = value('initial_track_grip', 'track-grip')
  const pressureAverage = {
    FL: value('tyre.FL.lap_pressure_average', 'psi'), FR: value('tyre.FR.lap_pressure_average', 'psi'),
    RL: value('tyre.RL.lap_pressure_average', 'psi'), RR: value('tyre.RR.lap_pressure_average', 'psi'),
  }
  const tyres: FastStateTyre[] = []
  for (const id of ['FL', 'FR', 'RL', 'RR'] as const) {
    const prefix = `tyre.${id}.`
    if (!Object.keys(live.fields).some(name => name.startsWith(prefix))) continue
    tyres.push({ id, pressurePsi: value(prefix + 'pressure', 'psi'), coreTempC: value(prefix + 'core_temperature', 'C'),
      brakeTempC: value(prefix + 'brake_temperature', 'C'), pressureLossPsi: value(prefix + 'pressure_loss', 'psi'),
      temperatureTargetRatio: value(prefix + 'temperature_target_ratio', 'ratio'),
      brakeTemperatureTargetRatio: value(prefix + 'brake_temperature_target_ratio', 'ratio'),
      wheelSlip: value(prefix + 'slip', 'ratio'), wheelSlipScaled: null, slipBand: 'white', slipState: 'ok',
      slipRatio: value(prefix + 'slip_ratio', 'ratio'), brakeCompound: null,
      padLifePct: value(prefix + 'pad_life', '%'), discLifePct: value(prefix + 'disc_life', '%') })
  }
  return {
    sectorHud: commonSectorHud(live),
    commonLive: live, isFresh: live.fresh, isLive: live.connected && live.lifecycle === 'live',
    context: { track: live.identity?.track ?? null, car: live.identity?.car ?? null, sessionUid: live.sessionId,
      sessionType: null, sessionIndex: null, serverId: null, gameId: live.gameId, variant: live.identity?.variant ?? null },
    speedKmh: value('speed', 'km/h'), rpm: value('rpm', 'rpm'), maxRpm: value('max_rpm', 'rpm'),
    gear: value('gear', 'gear'), gas: value('throttle', 'ratio'), brake: value('brake', 'ratio'),
    currentLapTimeMs: value('current_lap_time', 'ms'), lastLapTimeMs: value('last_lap_time', 'ms'),
    bestLapTimeMs: value('best_lap_time', 'ms'), lapValid: commonBoolean(live, 'lap_valid'),
    lapsCompleted: lapCount,
    info: {
      delta: { ms: delta ?? 0, available: delta !== null,
        side: delta === null || delta === 0 ? 'zero' : delta < 0 ? 'negative' : 'positive',
        ratio: delta === null ? 0 : Math.min(Math.abs(delta) / 1000, 1), purple: false },
      stintTimeLeftMs: value('stint_time_remaining', 'ms'), stintTimeElapsedMs: value('stint_time_elapsed', 'ms'), fuelLabel: '', fuelNeededL: null,
      fuelLeftTimeMs: value('fuel_time_remaining', 'ms'), fuelLeftReferenceLapMs: value('fuel_reference_lap', 'ms'),
      incidents: value('incidents', 'count'), grip: null, pitExitTraffic: null,
      initialGrip: initialGrip === 0 ? 'Green' : initialGrip === 1 ? 'Fast' : initialGrip === 2 ? 'Optimum' : null,
      optimalLapTimeMs: value('optimal_lap_time', 'ms'), bestLapTimeMs: bestLap, damageTimeMs: null,
      currentLapTimeMs: currentLap, lastLapTimeMs: lastLap, lapValid: valid,
      lastLapValid: commonBoolean(live, 'last_lap_valid'), lapsCompleted: lapCount,
    },
    trackReferencesEligible: live.connected && live.lifecycle === 'live'
      && live.capabilities.track_position === true && commonBoolean(live, 'in_pit_lane') === false,
    normalizedCarPosition: value('normalized_position', 'ratio'),
    fuelL: live.capabilities.fuel ? value('fuel', 'L') : null,
    fuelPerLapL: live.capabilities.fuel ? value('fuel_per_lap', 'L/lap') : null,
    fuelLapsRemaining: value('fuel_laps_remaining', 'lap'), fuelLeftTimeMs: value('fuel_time_remaining', 'ms'),
    sessionLapsRemaining: value('session_laps_remaining', 'lap'), sessionTimeLeftMs: value('session_time_remaining', 'ms'),
    engineMap: value('engine_map', 'level'), tractionControl: value('traction_control', 'level'),
    tractionControl2: value('traction_control_2', 'level'), abs: value('abs', 'level'), brakeBiasPct: value('brake_bias', '%'),
    ignitionOn: commonBoolean(live, 'ignition_on') === true, isEngineRunning: commonBoolean(live, 'engine_running') === true,
    isInPitLane: commonBoolean(live, 'in_pit_lane') === true, pitLimiterOn: commonBoolean(live, 'pit_limiter_on') === true,
    tractionControlInAction: commonBoolean(live, 'tc_active') === true, absInAction: commonBoolean(live, 'abs_active') === true,
    tyres,
    lapPressureAverage: {
      status: Object.values(pressureAverage).every(pressure => pressure !== null) ? 'available' : 'waiting_for_full_lap',
      lap: value('pressure_average_lap', 'count'), tyreSet: null, values: pressureAverage,
    },
  }
}
