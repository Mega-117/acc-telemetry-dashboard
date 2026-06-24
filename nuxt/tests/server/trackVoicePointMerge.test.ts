import { describe, expect, it } from 'vitest'
import {
  mergeTrackVoicePointStores,
  type TrackVoicePoint,
  type TrackVoicePointStore,
} from '../../server/utils/trackVoicePointMerge'

function store(points: TrackVoicePoint[]): TrackVoicePointStore {
  return { schema: 'acc.track_voice_points.v1', version: 1, points }
}

const defaultSpa: TrackVoicePoint[] = [
  { id: 'spa-1', track: 'Spa', type: 'braking_reference', normalized_car_position: 0.1, label: 'Default 1', text: 'default uno', speed: 1.1, enabled: true, audio_paths: { if_sara: '/default-sara-1.wav' } },
  { id: 'spa-2', track: 'Spa', type: 'braking_reference', normalized_car_position: 0.2, label: 'Default 2', text: 'default due', speed: 1.1, enabled: true, audio_paths: { if_sara: '/default-sara-2.wav' } },
]

describe('trackVoicePointMerge', () => {
  it('preserva le personalizzazioni locali quando il numero riferimenti pista resta uguale', () => {
    const localSpa: TrackVoicePoint[] = [
      { ...defaultSpa[0], text: 'utente uno', speed: 1.3, enabled: false, audio_paths: { im_nicola: '/local-nicola-1.wav' } },
      { ...defaultSpa[1], text: 'utente due', audio_path: '/local-sara-2.wav', audio_voice: 'if_sara' },
    ]

    const merged = mergeTrackVoicePointStores(store(defaultSpa), store(localSpa))

    expect(merged.points).toHaveLength(2)
    expect(merged.points[0]).toMatchObject({ id: 'spa-1', text: 'utente uno', speed: 1.3, enabled: false })
    expect(merged.points[0].audio_paths).toEqual({ if_sara: '/default-sara-1.wav', im_nicola: '/local-nicola-1.wav' })
    expect(merged.points[1].text).toBe('utente due')
    expect(merged.points[1].audio_paths?.if_sara).toBe('/local-sara-2.wav')
  })

  it('sostituisce il set locale della pista quando il numero riferimenti cambia', () => {
    const localSpa = [{ ...defaultSpa[0], text: 'utente uno' }]

    const merged = mergeTrackVoicePointStores(store(defaultSpa), store(localSpa))

    expect(merged.points.map(point => point.id)).toEqual(['spa-1', 'spa-2'])
    expect(merged.points[0].text).toBe('default uno')
  })

  it('aggiunge nuove piste default senza cancellare piste locali non presenti nel rilascio', () => {
    const localMonza: TrackVoicePoint = { id: 'monza-1', track: 'Monza', type: 'braking_reference', normalized_car_position: 0.5, text: 'utente monza' }

    const merged = mergeTrackVoicePointStores(store(defaultSpa), store([localMonza]))

    expect(merged.points.map(point => point.track)).toEqual(['Spa', 'Spa', 'Monza'])
  })
})
