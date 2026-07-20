import { ref } from 'vue'
import { normalizeCoachState, type CoachVoiceState } from '~/services/spotter/coachVoiceController'

/**
 * @description Polling di coach_state.json (PIP-255/256): lo stato del coach
 * cambia al massimo una volta per giro, quindi la cadenza e' lenta. Runtime
 * senza `getCoachState` (vecchie release) o file assente = coach muto,
 * nessun errore (degradazione graduale).
 */
const COACH_STATE_POLL_MS = 3_000
const MAX_CONSECUTIVE_ERRORS = 3

export function useCoachStatePoller(getApi: () => any | null) {
  const coachState = ref<CoachVoiceState | null>(null)
  let pollInterval: ReturnType<typeof setInterval> | null = null

  function startCoachStatePolling() {
    stopCoachStatePolling()
    const api = getApi()
    if (typeof api?.getCoachState !== 'function') {
      coachState.value = null
      return
    }
    let errorCount = 0
    async function pollOnce() {
      try {
        coachState.value = normalizeCoachState(await api.getCoachState())
        errorCount = 0
      } catch {
        errorCount++
        if (errorCount >= MAX_CONSECUTIVE_ERRORS) {
          stopCoachStatePolling()
          coachState.value = null
        }
      }
    }
    void pollOnce()
    pollInterval = setInterval(pollOnce, COACH_STATE_POLL_MS)
  }

  function stopCoachStatePolling() {
    if (pollInterval) {
      clearInterval(pollInterval)
      pollInterval = null
    }
  }

  return { coachState, startCoachStatePolling, stopCoachStatePolling }
}
