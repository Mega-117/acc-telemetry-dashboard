export interface TrackMetadata {
  id: string
  name: string
  fullName: string
  country: string
  countryCode: string
  length: string
  turns: number
  image: string
}

export function normalizeTrackId(track: string | null | undefined): string {
  return (track || '').toLowerCase().replace(/[^a-z0-9]/g, '_')
}

const DEFAULT_TRACK_METADATA: TrackMetadata = {
  id: 'unknown',
  name: 'Unknown',
  fullName: 'Unknown Track',
  country: '-',
  countryCode: '??',
  length: '-',
  turns: 0,
  image: '/tracks/track_default.png'
}

export const TRACK_METADATA: Record<string, TrackMetadata> = {
  monza: {
    id: 'monza',
    name: 'Monza',
    fullName: 'Autodromo Nazionale Monza',
    country: 'Italia',
    countryCode: 'IT',
    length: '5.793 km',
    turns: 11,
    image: '/tracks/track_monza.png'
  },
  donington: {
    id: 'donington',
    name: 'Donington Park',
    fullName: 'Donington Park Racing Circuit',
    country: 'Regno Unito',
    countryCode: 'GB',
    length: '4.020 km',
    turns: 12,
    image: '/tracks/track_donington.png'
  },
  donington_park: {
    id: 'donington_park',
    name: 'Donington Park',
    fullName: 'Donington Park Racing Circuit',
    country: 'Regno Unito',
    countryCode: 'GB',
    length: '4.020 km',
    turns: 12,
    image: '/tracks/track_donington.png'
  },
  spa: {
    id: 'spa',
    name: 'Spa-Francorchamps',
    fullName: 'Circuit de Spa-Francorchamps',
    country: 'Belgio',
    countryCode: 'BE',
    length: '7.004 km',
    turns: 19,
    image: '/tracks/track_spa.png'
  },
  spa_francorchamps: {
    id: 'spa_francorchamps',
    name: 'Spa-Francorchamps',
    fullName: 'Circuit de Spa-Francorchamps',
    country: 'Belgio',
    countryCode: 'BE',
    length: '7.004 km',
    turns: 19,
    image: '/tracks/track_spa.png'
  },
  paul_ricard: {
    id: 'paul_ricard',
    name: 'Paul Ricard',
    fullName: 'Circuit Paul Ricard',
    country: 'Francia',
    countryCode: 'FR',
    length: '5.842 km',
    turns: 15,
    image: '/tracks/track_paul_ricard.png'
  },
  valencia: {
    id: 'valencia',
    name: 'Valencia',
    fullName: 'Circuit Ricardo Tormo',
    country: 'Spagna',
    countryCode: 'ES',
    length: '4.005 km',
    turns: 14,
    image: '/tracks/track_valencia.png'
  },
  barcelona: {
    id: 'barcelona',
    name: 'Barcelona-Catalunya',
    fullName: 'Circuit de Barcelona-Catalunya',
    country: 'Spagna',
    countryCode: 'ES',
    length: '4.655 km',
    turns: 16,
    image: '/tracks/track_barcelona.png'
  },
  brands_hatch: {
    id: 'brands_hatch',
    name: 'Brands Hatch',
    fullName: 'Brands Hatch Circuit',
    country: 'Regno Unito',
    countryCode: 'GB',
    length: '3.908 km',
    turns: 9,
    image: '/tracks/track_brands_hatch.png'
  },
  hungaroring: {
    id: 'hungaroring',
    name: 'Hungaroring',
    fullName: 'Hungaroring',
    country: 'Ungheria',
    countryCode: 'HU',
    length: '4.381 km',
    turns: 14,
    image: '/tracks/track_hungaroring.png'
  },
  imola: {
    id: 'imola',
    name: 'Imola',
    fullName: 'Autodromo Enzo e Dino Ferrari',
    country: 'Italia',
    countryCode: 'IT',
    length: '4.909 km',
    turns: 19,
    image: '/tracks/track_imola.png'
  },
  kyalami: {
    id: 'kyalami',
    name: 'Kyalami',
    fullName: 'Kyalami Grand Prix Circuit',
    country: 'Sudafrica',
    countryCode: 'ZA',
    length: '4.522 km',
    turns: 16,
    image: '/tracks/track_kyalami.png'
  },
  laguna_seca: {
    id: 'laguna_seca',
    name: 'Laguna Seca',
    fullName: 'WeatherTech Raceway Laguna Seca',
    country: 'Stati Uniti',
    countryCode: 'US',
    length: '3.602 km',
    turns: 11,
    image: '/tracks/track_laguna_seca.png'
  },
  misano: {
    id: 'misano',
    name: 'Misano',
    fullName: 'Misano World Circuit',
    country: 'Italia',
    countryCode: 'IT',
    length: '4.226 km',
    turns: 16,
    image: '/tracks/track_misano.png'
  },
  mount_panorama: {
    id: 'mount_panorama',
    name: 'Mount Panorama',
    fullName: 'Mount Panorama Circuit',
    country: 'Australia',
    countryCode: 'AU',
    length: '6.213 km',
    turns: 23,
    image: '/tracks/track_mount_panorama.png'
  },
  nurburgring: {
    id: 'nurburgring',
    name: 'Nurburgring',
    fullName: 'Nurburgring Grand Prix Strecke',
    country: 'Germania',
    countryCode: 'DE',
    length: '5.148 km',
    turns: 16,
    image: '/tracks/track_nurburgring.png'
  },
  oulton_park: {
    id: 'oulton_park',
    name: 'Oulton Park',
    fullName: 'Oulton Park Circuit',
    country: 'Regno Unito',
    countryCode: 'GB',
    length: '4.307 km',
    turns: 17,
    image: '/tracks/track_oulton_park.png'
  },
  silverstone: {
    id: 'silverstone',
    name: 'Silverstone',
    fullName: 'Silverstone Circuit',
    country: 'Regno Unito',
    countryCode: 'GB',
    length: '5.891 km',
    turns: 18,
    image: '/tracks/track_silverstone.png'
  },
  snetterton: {
    id: 'snetterton',
    name: 'Snetterton',
    fullName: 'Snetterton Circuit',
    country: 'Regno Unito',
    countryCode: 'GB',
    length: '4.779 km',
    turns: 12,
    image: '/tracks/track_snetterton.png'
  },
  suzuka: {
    id: 'suzuka',
    name: 'Suzuka',
    fullName: 'Suzuka International Racing Course',
    country: 'Giappone',
    countryCode: 'JP',
    length: '5.807 km',
    turns: 18,
    image: '/tracks/track_suzuka.png'
  },
  watkins_glen: {
    id: 'watkins_glen',
    name: 'Watkins Glen',
    fullName: 'Watkins Glen International',
    country: 'Stati Uniti',
    countryCode: 'US',
    length: '5.472 km',
    turns: 11,
    image: '/tracks/track_watkins_glen.png'
  },
  zandvoort: {
    id: 'zandvoort',
    name: 'Zandvoort',
    fullName: 'Circuit Zandvoort',
    country: 'Paesi Bassi',
    countryCode: 'NL',
    length: '4.259 km',
    turns: 14,
    image: '/tracks/track_zandvoort.png'
  },
  zolder: {
    id: 'zolder',
    name: 'Zolder',
    fullName: 'Circuit Zolder',
    country: 'Belgio',
    countryCode: 'BE',
    length: '4.011 km',
    turns: 10,
    image: '/tracks/track_zolder.png'
  },
  cota: {
    id: 'cota',
    name: 'COTA',
    fullName: 'Circuit of the Americas',
    country: 'Stati Uniti',
    countryCode: 'US',
    length: '5.513 km',
    turns: 20,
    image: '/tracks/track_cota.png'
  },
  indianapolis: {
    id: 'indianapolis',
    name: 'Indianapolis',
    fullName: 'Indianapolis Motor Speedway',
    country: 'Stati Uniti',
    countryCode: 'US',
    length: '4.192 km',
    turns: 14,
    image: '/tracks/track_indianapolis.png'
  },
  red_bull_ring: {
    id: 'red_bull_ring',
    name: 'Red Bull Ring',
    fullName: 'Red Bull Ring',
    country: 'Austria',
    countryCode: 'AT',
    length: '4.318 km',
    turns: 10,
    image: '/tracks/track_red_bull_ring.png'
  }
}

export function resolveTrackMetadata(trackId: string | null | undefined): TrackMetadata {
  const normalized = normalizeTrackId(trackId)
  return TRACK_METADATA[normalized] || {
    ...DEFAULT_TRACK_METADATA,
    id: normalized || DEFAULT_TRACK_METADATA.id,
    name: trackId || DEFAULT_TRACK_METADATA.name,
    fullName: trackId || DEFAULT_TRACK_METADATA.fullName
  }
}
