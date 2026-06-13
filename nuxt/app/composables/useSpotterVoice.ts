import { ref } from 'vue'
import { spotterBrickPath, spotterEventToBricks, type SpotterBricksInput } from '~/services/spotter/spotterBricks'

/**
 * Voce spotter a frammenti pre-generati (PIP-103): concatena i WAV Kokoro dei
 * mattoncini (parti letterali + valori finiti di delta/settore), come l'annuncio
 * dei tempi giro. Nessun motore TTS sul PC utente, offline, niente Web Speech.
 *
 * @param getPublicPath - Risolve un path /voice/... nell'URL pubblico assoluto.
 * @param selectedVoiceId - Voce attiva (Sara/Nicola).
 * @param isEnabled - Spotter + audio attivi.
 */
export function useSpotterVoice(
  getPublicPath: (p: string) => string,
  selectedVoiceId: () => string,
  isEnabled: () => boolean,
) {
  const isSpeaking = ref(false)
  let audio: HTMLAudioElement | null = null
  let generation = 0
  let queue = Promise.resolve()

  function stopSpotterVoice() {
    generation += 1
    if (audio) { audio.pause(); audio.currentTime = 0; audio = null }
    queue = Promise.resolve()
    isSpeaking.value = false
  }

  function enqueueSpotterEvent(event: SpotterBricksInput) {
    if (!isEnabled() || typeof window === 'undefined') return
    const bricks = spotterEventToBricks(event)
    if (!bricks.length) return
    const voice = selectedVoiceId()
    // "Ultimo conta": un nuovo evento sostituisce quello eventualmente in coda.
    stopSpotterVoice()
    const gen = generation
    isSpeaking.value = true
    for (const id of bricks) {
      const path = getPublicPath(spotterBrickPath(id, voice))
      queue = queue.then(() => new Promise<void>((resolve) => {
        if (gen !== generation || !isEnabled()) { resolve(); return }
        const el = new Audio(path)
        audio = el
        el.onended = () => { if (audio === el) audio = null; resolve() }
        el.onerror = () => { if (audio === el) audio = null; resolve() }
        void el.play().catch(() => { if (audio === el) audio = null; resolve() })
      }))
    }
    queue = queue.then(() => { if (gen === generation) isSpeaking.value = false })
  }

  return { isSpeaking, enqueueSpotterEvent, stopSpotterVoice }
}
