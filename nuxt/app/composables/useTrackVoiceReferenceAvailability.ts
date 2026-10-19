import { computed, ref, watch, type Ref } from 'vue'
import { referenceMatchesContext, type TrackVoiceReference } from '~/services/spotter/trackVoiceReferences'

export interface TrackVoiceReferenceContext {
  gameId: string | null
  track: string | null
  variant: string | null
}

/** Same filter as the spotter runtime, without the per-voice audio path. */
export function trackHasVoiceReferences(points: TrackVoiceReference[], context: TrackVoiceReferenceContext): boolean {
  if (!context.track) return false
  return points.some(point => point.enabled !== false && point.type === 'braking_reference'
    && referenceMatchesContext(point, context.gameId ?? 'acc', context.track, context.variant))
}

/**
 * PIP-556: the Riferimenti alert is useful only on a track with audio
 * references (today Spa). Returns null while unknown, so the button is never
 * hidden because of a slow or failed read (graceful degradation).
 */
export function useTrackVoiceReferenceAvailability(
  getApi: () => { voiceLabReadVoicePoints?: () => Promise<{ points?: TrackVoiceReference[] }> } | null | undefined,
  context: Ref<TrackVoiceReferenceContext>,
) {
  const points = ref<TrackVoiceReference[] | null>(null)
  let request = 0
  async function load() {
    const current = ++request
    try {
      const data = await getApi()?.voiceLabReadVoicePoints?.()
      if (current !== request) return
      points.value = data && Array.isArray(data.points) ? data.points : null
    } catch {
      if (current === request) points.value = null
    }
  }
  // Reload when the track changes: recorded references may have been added meanwhile.
  watch(() => `${context.value.gameId}|${context.value.track}|${context.value.variant}`, () => { void load() }, { immediate: true })
  const available = computed<boolean | null>(() => points.value === null || !context.value.track
    ? null
    : trackHasVoiceReferences(points.value, context.value))
  return { available, reload: load }
}
