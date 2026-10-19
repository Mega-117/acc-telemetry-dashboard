import { describe, expect, it } from 'vitest'
import { nextTick, ref } from 'vue'
import { trackHasVoiceReferences, useTrackVoiceReferenceAvailability } from '~/composables/useTrackVoiceReferenceAvailability'
import type { TrackVoiceReference } from '~/services/spotter/trackVoiceReferences'

const spa: TrackVoiceReference = { id: 'spa-1', track: 'Spa', type: 'braking_reference', normalized_car_position: 0.1 }
const flush = async () => { await Promise.resolve(); await nextTick() }

describe('track voice reference availability (PIP-556)', () => {
  it('matches only enabled braking references of the current game, track and variant', () => {
    const context = { gameId: 'acc', track: 'spa', variant: null }
    expect(trackHasVoiceReferences([spa], context)).toBe(true)
    expect(trackHasVoiceReferences([spa], { ...context, track: 'Monza' })).toBe(false)
    expect(trackHasVoiceReferences([{ ...spa, enabled: false }], context)).toBe(false)
    expect(trackHasVoiceReferences([{ ...spa, type: 'note' }], context)).toBe(false)
    expect(trackHasVoiceReferences([{ ...spa, game_id: 'evo' }], context)).toBe(false)
    expect(trackHasVoiceReferences([spa], { ...context, track: null })).toBe(false)
  })

  it('is unknown (null) without the desktop API or a track, and follows the track', async () => {
    const context = ref({ gameId: 'acc', track: 'Spa' as string | null, variant: null as string | null })
    const none = useTrackVoiceReferenceAvailability(() => null, context)
    await flush()
    expect(none.available.value).toBeNull()

    const api = { voiceLabReadVoicePoints: async () => ({ points: [spa] }) }
    const live = useTrackVoiceReferenceAvailability(() => api, context)
    await flush()
    expect(live.available.value).toBe(true)
    context.value = { ...context.value, track: 'Monza' }
    await flush(); await flush()
    expect(live.available.value).toBe(false)
    context.value = { ...context.value, track: null }
    await flush(); await flush()
    expect(live.available.value).toBeNull()
  })

  it('a failed read keeps the alert visible', async () => {
    const context = ref({ gameId: 'acc', track: 'Spa' as string | null, variant: null as string | null })
    const failing = useTrackVoiceReferenceAvailability(() => ({ voiceLabReadVoicePoints: async () => { throw new Error('x') } }), context)
    await flush()
    expect(failing.available.value).toBeNull()
  })
})
