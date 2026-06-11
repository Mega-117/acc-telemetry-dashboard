export interface SpotterVoiceRuntimeDeps {
  fetchImpl?: typeof fetch
  speechSynthesis?: SpeechSynthesis | null
  utteranceCtor?: typeof SpeechSynthesisUtterance
  audioFactory?: (url: string) => HTMLAudioElement
  createObjectURL?: (blob: Blob) => string
  revokeObjectURL?: (url: string) => void
  ttsServer?: string
}

export type SpotterVoiceEngine = 'kokoro' | 'web-speech' | 'none'

export async function speakSpotterText(
  text: string,
  deps: SpotterVoiceRuntimeDeps = {},
  opts: { voice?: string; speed?: number } = {}
): Promise<SpotterVoiceEngine> {
  const cleanText = text.trim()
  if (!cleanText) return 'none'

  const fetchImpl = deps.fetchImpl
  const server = deps.ttsServer || 'http://localhost:5111'

  if (fetchImpl) {
    try {
      const url = `${server}/speak?text=${encodeURIComponent(cleanText)}&voice=${encodeURIComponent(opts.voice || 'if_sara')}&speed=${encodeURIComponent(String(opts.speed || 1.08))}`
      const response = await fetchImpl(url)
      if (!response.ok) throw new Error(`HTTP ${response.status}`)
      if (deps.audioFactory && deps.createObjectURL && typeof response.blob === 'function') {
        const blob = await response.blob()
        const audioUrl = deps.createObjectURL(blob)
        await playAudioUrl(audioUrl, deps)
      }
      return 'kokoro'
    } catch {
      // Fall back to browser speech synthesis below.
    }
  }

  const synth = deps.speechSynthesis
  const Utterance = deps.utteranceCtor
  if (synth && Utterance) {
    synth.cancel()
    const utterance = new Utterance(cleanText)
    utterance.lang = 'it-IT'
    utterance.rate = opts.speed || 1.08
    synth.speak(utterance)
    return 'web-speech'
  }

  return 'none'
}

function playAudioUrl(url: string, deps: SpotterVoiceRuntimeDeps): Promise<void> {
  return new Promise((resolve) => {
    const audio = deps.audioFactory?.(url)
    if (!audio) {
      deps.revokeObjectURL?.(url)
      resolve()
      return
    }
    audio.onended = () => {
      deps.revokeObjectURL?.(url)
      resolve()
    }
    audio.onerror = () => {
      deps.revokeObjectURL?.(url)
      resolve()
    }
    void audio.play().catch(() => {
      deps.revokeObjectURL?.(url)
      resolve()
    })
  })
}
