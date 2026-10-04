import { TRACK_METADATA, normalizeTrackId } from './trackMetadata'
import { historyTrackId } from './vehicleHistory'
import type { TrackOverviewProjectionItem } from '~/types/trackProjections'

// Official circuit inventory and dedicated-server layout identifiers, checked 2026-10-04.
// https://assettocorsa.gg/assetto-corsa-evo/
// https://github.com/zino1337/acevo-server#tracks (third-party server implementation)
const EVO: Array<[string, string[], string]> = [
  ['Mount Panorama', ['GP'], 'mount_panorama'], ['Brands Hatch', ['GP', 'Indy'], 'brands_hatch'],
  ['Circuit Of The Americas', ['GP', 'National'], 'cota'],
  ['Donington Park', ['GP', 'National'], 'donington'], ['Fuji Speedway', ['GP', 'GP Short'], 'fuji'],
  ['Imola', ['GP'], 'imola'], ['Kyalami', ['GP'], 'kyalami'], ['Laguna Seca', ['GP'], 'laguna_seca'],
  ['Monza', ['GP'], 'monza'], ['Nurburgring', ['Gp Strecke', 'Sprint', '24h', 'Nordschleife', 'Touristenfahrten'], 'nurburgring'],
  ['Oulton Park', ['International', 'Fosters'], 'oulton_park'],
  ['Paul Ricard', ['Layout 1A-V2', 'Layout 1C-V2', 'Layout 3A', 'Layout 3C'], 'paul_ricard'],
  ['Red Bull Ring', ['GP', 'National'], 'red_bull_ring'], ['Road Atlanta', ['GP'], 'road_atlanta'],
  ['Sebring International Raceway', ['GP'], 'sebring'], ['Circuit de Spa Francorchamps', ['GP'], 'spa'],
  ['Suzuka', ['GP', 'East', 'West'], 'suzuka'],
  ['Watkins Glen International', ['GP', 'GP Inner Loop', 'Short', 'Short Inner Loop'], 'watkins_glen'],
]
export function gameTrackCatalogue(gameId: string): TrackOverviewProjectionItem[] {
  if (gameId === 'acc') {
    const seen = new Set<string>()
    return Object.values(TRACK_METADATA).filter(t => !seen.has(t.name) && !!seen.add(t.name))
      .map(t => ({ ...t, sessions: 0 }))
  }
  if (gameId !== 'evo') return []
  return EVO.flatMap(([track, variants, artwork]) => variants.map(variant => ({ id: historyTrackId(track, variant),
    name: [track, variant].filter(Boolean).join(' · '), country: '', length: '', sessions: 0,
    // Existing artwork contains a circuit outline: do not show GP geometry for a different layout.
    image: variant === 'GP' || (track === 'Nurburgring' && variant === 'Gp Strecke')
      ? TRACK_METADATA[normalizeTrackId(artwork)]?.image : undefined })))
}
