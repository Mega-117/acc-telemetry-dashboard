import { ref } from 'vue'
import { speakSpotterText } from '~/services/spotter/spotterVoiceRuntime'

export function useSpotterVoice(selectedVoiceId: () => string, isEnabled: () => boolean) {
  const isSpeaking = ref(false)
  let generation = 0
  let queue = Promise.resolve()

  function stopSpotterVoice() {
    generation += 1
    queue = Promise.resolve()
    isSpeaking.value = false
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      window.speechSynthesis.cancel()
    }
  }

  function enqueueSpotterText(text: string) {
    if (!isEnabled()) return
    const gen = generation
    queue = queue.then(async () => {
      if (gen !== generation || !isEnabled()) return
      isSpeaking.value = true
      try {
        await speakSpotterText(text, {
          fetchImpl: typeof fetch !== 'undefined' ? fetch : undefined,
          speechSynthesis: typeof window !== 'undefined' ? window.speechSynthesis : null,
          utteranceCtor: typeof window !== 'undefined' ? window.SpeechSynthesisUtterance : undefined,
          audioFactory: typeof Audio !== 'undefined' ? (url) => new Audio(url) : undefined,
          createObjectURL: typeof URL !== 'undefined' ? URL.createObjectURL.bind(URL) : undefined,
          revokeObjectURL: typeof URL !== 'undefined' ? URL.revokeObjectURL.bind(URL) : undefined,
        }, { voice: selectedVoiceId(), speed: 1.08 })
      } finally {
        if (gen === generation) isSpeaking.value = false
      }
    })
  }

  return { isSpeaking, enqueueSpotterText, stopSpotterVoice }
}
