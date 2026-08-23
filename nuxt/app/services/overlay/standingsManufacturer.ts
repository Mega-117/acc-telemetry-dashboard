export interface StandingsManufacturerBadge {
  key: string | null
  code: string
  name: string
}

const BADGES: Readonly<Record<string, Readonly<Omit<StandingsManufacturerBadge, 'key'>>>> = Object.freeze({
  'aston-martin': { code: 'AM', name: 'Aston Martin' },
  audi: { code: 'AUD', name: 'Audi' },
  bentley: { code: 'BEN', name: 'Bentley' },
  bmw: { code: 'BMW', name: 'BMW' },
  ferrari: { code: 'FER', name: 'Ferrari' },
  ford: { code: 'FRD', name: 'Ford' },
  honda: { code: 'HND', name: 'Honda' },
  jaguar: { code: 'JAG', name: 'Jaguar' },
  lamborghini: { code: 'LAM', name: 'Lamborghini' },
  lexus: { code: 'LEX', name: 'Lexus' },
  mclaren: { code: 'MCL', name: 'McLaren' },
  'mercedes-amg': { code: 'AMG', name: 'Mercedes-AMG' },
  nissan: { code: 'NIS', name: 'Nissan' },
  porsche: { code: 'POR', name: 'Porsche' },
})

export function standingsManufacturerBadge(value: unknown): StandingsManufacturerBadge {
  if (typeof value !== 'string') return { key: null, code: '—', name: 'Costruttore non disponibile' }
  const key = value.trim().toLowerCase()
  const badge = BADGES[key]
  return badge ? { key, ...badge } : { key: null, code: '—', name: 'Costruttore non disponibile' }
}
