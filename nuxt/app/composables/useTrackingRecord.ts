import { ref } from 'vue'
import type { LiveLapState } from '~/composables/useLiveStatePoller'

/**
 * @description Records training session lifecycle events (start, step completion) via the Electron
 * IPC API, attaching live lap context (track, car, lap counts) from the poller snapshot.
 * Tracks the active training id and start timestamp so downstream analytics can correlate records.
 * @param getApi - Factory that returns the current Electron API instance, or null.
 * @param getLiveLap - Returns the current LiveLapState snapshot from useLiveStatePoller.
 * @param getTrainingId - Returns the id of the training plan being recorded.
 * @param getModeId - Returns the duration mode id for the current session.
 * @param getTotalSteps - Returns the total number of steps in the current training plan.
 * @returns Object with activeTrainingId ref, activeTrainingStartedAt ref, trackingStart and trackingComplete functions.
 */
export function useTrackingRecord(
  getApi: () => any | null,
  getLiveLap: () => LiveLapState,
  getTrainingId: () => string,
  getModeId: () => string,
  getTotalSteps: () => number,
) {
  const activeTrainingId = ref<string | null>(null)
  const activeTrainingStartedAt = ref<string | null>(null)
  let sourceKey: string | null = null
  // Lifecycle IPC replies can arrive after a source change or a stop request.
  // Serialize them, retaining the context captured when the user acted.
  let pending: Promise<void> = Promise.resolve()
  function serialize(operation: () => Promise<void>) {
    const result = pending.then(operation)
    pending = result.catch(() => {})
    return result
  }
  const key = (lap: LiveLapState) => JSON.stringify([lap.gameId ?? 'acc', lap.sourceSessionId ?? null, lap.track, lap.trackVariant ?? null, lap.car])

  async function trackingStart() {
    const api = getApi()
    if (!api?.trainingStart) return

    const lap = { ...getLiveLap() }
    const startingSource = key(lap)
    const track = lap.track ?? ''
    const car = lap.car ?? ''
    const trainingId = getTrainingId(), modeId = getModeId(), totalSteps = getTotalSteps()

    return serialize(async () => {
      try {
        const result = await api.trainingStart({
          trainingId, modeId, totalSteps,
          gameId: lap.gameId ?? 'acc', sourceSessionId: lap.sourceSessionId ?? null,
          trackVariant: lap.trackVariant ?? null, track, car,
        })
        if (result?.ok) {
          if (key(getLiveLap()) !== startingSource) {
            await api.trainingAbandon?.({ id: result.id, lapsCompleted: null, lapsValid: null, stepsCompleted: 0 })
            return
          }
          sourceKey = startingSource
          activeTrainingId.value = result.id
          activeTrainingStartedAt.value = new Date().toISOString()
        }
      } catch { /* non critico */ }
    })
  }

  function buildPayload(stepsCompleted: number, lap: LiveLapState) {
    const sameSource = sourceKey === key(lap)
    return {
      id: activeTrainingId.value,
      // A car counter can include a teammate's stint or an observed car.
      // Only the connector's accepted personal counters may enter history.
      lapsCompleted: sameSource ? lap.personalLapsCompleted ?? null : null,
      lapsValid: sameSource ? lap.personalLapsValid ?? null : null,
      stepsCompleted,
      startedAt: activeTrainingStartedAt.value,
    }
  }

  async function finish(method: 'trainingComplete' | 'trainingAbandon', stepsCompleted: number) {
    const api = getApi()
    if (!api?.[method]) return
    const lap = { ...getLiveLap() }
    return serialize(async () => {
      if (!activeTrainingId.value) return
      try { await api[method](buildPayload(stepsCompleted, lap)) } catch { /* non critico */ }
      activeTrainingId.value = null
      activeTrainingStartedAt.value = null
      sourceKey = null
    })
  }

  const trackingComplete = (stepsCompleted: number) => finish('trainingComplete', stepsCompleted)
  const trackingAbandon = (stepsCompleted: number) => finish('trainingAbandon', stepsCompleted)

  return { activeTrainingId, activeTrainingStartedAt, trackingStart, trackingComplete, trackingAbandon }
}
