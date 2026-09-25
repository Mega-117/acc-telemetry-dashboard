import type { FastOverlayState } from '../../composables/useFastStatePoller'
import type { PressureRecommendationVoiceRuntime } from './pressureRecommendationVoiceRuntime'

/** One coherent fast snapshot owns the lap boundary, time and pressure plan. */
export function createFinishLineVoiceRuntime(options: {
  pressure: PressureRecommendationVoiceRuntime
  announceLap: (id: string, timeMs: number, valid: boolean) => void
}) {
  let session: string | null = null
  let generation = 0
  let lastLap: number | null = null
  let pendingLap: number | null = null

  function reset() {
    lastLap = null
    pendingLap = null
    options.pressure.reset()
  }

  function update(frame: FastOverlayState) {
    // A temporary stale sample is not a new session or a reset to lap zero.
    if (!frame.isFresh || frame.dataSource === 'focused') return
    const recommendation = frame.tyreSetup.pressureRecommendation
    const identity = frame.context?.sessionUid || recommendation?.sessionId
    if (!identity) return
    const key = JSON.stringify([identity, frame.context?.track, frame.context?.sessionType, frame.context?.sessionIndex])
    const lap = frame.lapsCompleted
    if (!Number.isInteger(lap) || lap < 0) return
    if (session !== key || (lastLap !== null && lap < lastLap)) {
      session = key
      generation += 1
      reset()
    }
    if (lastLap === null) {
      // Attach/reconnect establishes a baseline, never announces old laps.
      lastLap = lap
      options.pressure.recordRecommendation(recommendation)
      return
    }
    if (lap > lastLap) {
      lastLap = lap
      pendingLap = lap
    }
    if (pendingLap !== null) {
      const time = frame.info?.lapsCompleted === lap
        ? frame.info.lastLapTimeMs ?? frame.lastLapTimeMs : frame.lastLapTimeMs
      const valid = frame.info?.lapsCompleted === lap ? frame.info.lastLapValid : null
      if (time !== null && Number.isFinite(time) && time > 0 && typeof valid === 'boolean') {
        options.announceLap(`lap-time-${generation}-${pendingLap}`, time, valid)
        pendingLap = null
      }
    }
    // The same snapshot supplies the source lap; live_state polling cannot
    // lose the pressure crossing. Delayed plans are matched by the coordinator.
    options.pressure.recordRecommendation(recommendation)
    options.pressure.recordFinishCrossing(lap)
  }

  return { update, reset }
}
