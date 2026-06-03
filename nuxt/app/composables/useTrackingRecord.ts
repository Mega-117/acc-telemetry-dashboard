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

  async function trackingStart() {
    const api = getApi()
    if (!api?.trainingStart) return

    const lap = getLiveLap()
    const track = (lap as any)?.track ?? ''
    const car = (lap as any)?.car ?? ''

    try {
      const result = await api.trainingStart({
        trainingId: getTrainingId(),
        modeId: getModeId(),
        totalSteps: getTotalSteps(),
        track,
        car,
      })
      if (result?.ok) {
        activeTrainingId.value = result.id
        activeTrainingStartedAt.value = new Date().toISOString()
      }
    } catch { /* non critico */ }
  }

  function buildPayload(stepsCompleted: number) {
    const lap = getLiveLap()
    return {
      id: activeTrainingId.value,
      lapsCompleted: lap.lapsCompleted ?? 0,
      lapsValid: lap.lapsValid ?? 0,
      stepsCompleted,
      startedAt: activeTrainingStartedAt.value,
    }
  }

  async function trackingComplete(stepsCompleted: number) {
    const api = getApi()
    if (!api?.trainingComplete || !activeTrainingId.value) return
    try { await api.trainingComplete(buildPayload(stepsCompleted)) } catch { /* non critico */ }
    activeTrainingId.value = null
    activeTrainingStartedAt.value = null
  }

  async function trackingAbandon(stepsCompleted: number) {
    const api = getApi()
    if (!api?.trainingAbandon || !activeTrainingId.value) return
    try { await api.trainingAbandon(buildPayload(stepsCompleted)) } catch { /* non critico */ }
    activeTrainingId.value = null
    activeTrainingStartedAt.value = null
  }

  return { activeTrainingId, activeTrainingStartedAt, trackingStart, trackingComplete, trackingAbandon }
}
