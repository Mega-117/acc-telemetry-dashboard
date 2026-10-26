// Bordi della pista (ACC Drive _L/_R) per le mappe della Telemetria; null sulle piste senza bordi, e la mappa
// disegna la sola linea. PIP-636: dal programma desktop (Electron) o, nel browser, dai file del sito.
import { computed, ref, watch, type Ref } from 'vue'
import { loadWebTrackEdges, type TrackEdges } from '~/services/telemetry/trackEdges'
import { usePublicPath } from '~/composables/usePublicPath'

interface EdgesLap { gameId: string, track: string, variant?: string | null }
type EdgesBridge = { hudOverlayGetTrackEdges?: (track: string, sim: string, variant: string | null) => Promise<TrackEdges | null> } | null

export function useTrackEdges(lap: Ref<EdgesLap | null>, bridge: () => EdgesBridge) {
  const edges = ref<TrackEdges | null>(null)
  const webDeps = { fetch: (input: RequestInfo | URL) => fetch(input), publicPath: usePublicPath().getPublicPath }
  const key = computed(() => lap.value ? `${lap.value.gameId}/${lap.value.track}/${lap.value.variant ?? ''}` : '')
  watch(key, async (current) => {
    edges.value = null
    const l = lap.value, b = bridge()
    if (!l) return
    try {
      const loaded = typeof b?.hudOverlayGetTrackEdges === 'function'
        ? await b.hudOverlayGetTrackEdges(l.track, l.gameId, l.variant ?? null)
        : await loadWebTrackEdges(l.track, l.gameId, l.variant ?? null, webDeps)
      // Conta solo se la pista e' ancora quella aperta.
      if (key.value === current) edges.value = loaded ?? null
    } catch { edges.value = null }
  }, { immediate: true })
  return edges
}
