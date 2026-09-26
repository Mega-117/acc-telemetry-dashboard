import { describe, expect, it } from 'vitest'
import { TRACK_METADATA, normalizeTrackId } from '~/services/projections/trackMetadata'
import { buildTrackOverviewProjection } from '~/services/projections/buildTrackOverviewProjection'

function build(trackStats: Array<{ track: string; sessions: number; bestQualy?: number }> = []) {
  return buildTrackOverviewProjection({ trackMetadata: TRACK_METADATA, trackStats, trackBestsMap: {}, normalizeTrackId, formatLapTime: value => String(value) })
}
describe('track catalog aliases', () => {
  it('shows one empty Spa and Donington, and includes Nordschleife separately from GP', () => {
    const tracks = build()
    expect(tracks.filter(t => t.name === 'Spa-Francorchamps')).toHaveLength(1)
    expect(tracks.filter(t => t.name === 'Donington Park')).toHaveLength(1)
    expect(tracks.some(t => t.id === 'nordschleife')).toBe(true)
    expect(tracks.find(t => t.id === 'nordschleife')?.image).toBe('/tracks/track_nordschleife_placeholder.svg')
    expect(tracks.some(t => t.id === 'nurburgring')).toBe(true)
  })
  it.each(['spa', 'spa_francorchamps'])('preserves populated %s route and its times', track => {
    const spa = build([{ track, sessions: 3, bestQualy: 140000 }]).filter(t => t.name === 'Spa-Francorchamps')
    expect(spa).toHaveLength(1)
    expect(spa[0]).toMatchObject({ id: track, sessions: 3, bestQualy: '140000' })
  })
  it('does not discard real sessions stored under two different IDs', () => {
    const spa = build([{ track: 'spa', sessions: 3 }, { track: 'spa_francorchamps', sessions: 2 }]).filter(t => t.name === 'Spa-Francorchamps')
    expect(spa.map(t => t.sessions).sort()).toEqual([2,3])
  })
})
