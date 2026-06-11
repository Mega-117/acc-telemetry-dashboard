import { computed, ref, watch } from 'vue'
import { createSpotterAnalyzer, type SpotterEvent } from '~/services/spotter/spotterAnalysisService'

export function useSpotterController(
  getApi: () => any | null,
  isEnabled: () => boolean,
  speak: (text: string) => void,
) {
  const lastSpotterEvent = ref<SpotterEvent | null>(null)
  const isSpotterPolling = ref(false)
  const analyzer = createSpotterAnalyzer()
  let interval: ReturnType<typeof setInterval> | null = null

  const spotterStatusLabel = computed(() => {
    if (!isEnabled()) return 'Spotter spento'
    if (!isSpotterPolling.value) return 'Spotter attivo, in attesa dati'
    return 'Spotter attivo'
  })

  function startSpotter() {
    stopSpotter({ reset: false })
    if (!isEnabled()) return
    const api = getApi()
    if (!api?.getLiveState) return

    async function pollOnce() {
      if (!isEnabled()) return
      try {
        const state = await api.getLiveState()
        isSpotterPolling.value = true
        const events = analyzer.analyze(state)
        const event = events[0]
        if (event) {
          lastSpotterEvent.value = event
          speak(event.messageText)
        }
      } catch {
        isSpotterPolling.value = false
      }
    }

    void pollOnce()
    interval = setInterval(pollOnce, 2000)
  }

  function stopSpotter(opts: { reset?: boolean } = {}) {
    if (interval) {
      clearInterval(interval)
      interval = null
    }
    isSpotterPolling.value = false
    if (opts.reset !== false) analyzer.reset()
  }

  watch(() => isEnabled(), (enabled) => {
    if (enabled) startSpotter()
    else stopSpotter()
  })

  return { lastSpotterEvent, isSpotterPolling, spotterStatusLabel, startSpotter, stopSpotter }
}
