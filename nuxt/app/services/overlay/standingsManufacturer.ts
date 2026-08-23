export interface StandingsManufacturerLogo {
  key: string | null
  src: string
  name: string
}

export type StandingsPublicPathResolver = (path: string) => string

const identityPublicPath: StandingsPublicPathResolver = path => path

const LOGO_ROOT = '/standings/manufacturers'
const FALLBACK_LOGO: Readonly<Omit<StandingsManufacturerLogo, 'key'>> = Object.freeze({
  src: `${LOGO_ROOT}/none.png`,
  name: 'Costruttore non disponibile',
})

const LOGOS: Readonly<Record<string, Readonly<Omit<StandingsManufacturerLogo, 'key'>>>> = Object.freeze({
  'aston-martin': { src: `${LOGO_ROOT}/aston_martin.png`, name: 'Aston Martin' },
  audi: { src: `${LOGO_ROOT}/audi.png`, name: 'Audi' },
  bentley: { src: `${LOGO_ROOT}/bentley.png`, name: 'Bentley' },
  bmw: { src: `${LOGO_ROOT}/bmw.png`, name: 'BMW' },
  ferrari: { src: `${LOGO_ROOT}/ferrari.png`, name: 'Ferrari' },
  ford: { src: `${LOGO_ROOT}/ford.png`, name: 'Ford' },
  honda: { src: `${LOGO_ROOT}/honda.png`, name: 'Honda' },
  jaguar: { src: `${LOGO_ROOT}/jaguar.png`, name: 'Jaguar' },
  lamborghini: { src: `${LOGO_ROOT}/lamborghini.png`, name: 'Lamborghini' },
  lexus: { src: `${LOGO_ROOT}/lexus.png`, name: 'Lexus' },
  mclaren: { src: `${LOGO_ROOT}/mclaren.png`, name: 'McLaren' },
  'mercedes-amg': { src: `${LOGO_ROOT}/mercedes.png`, name: 'Mercedes-AMG' },
  nissan: { src: `${LOGO_ROOT}/nissan.png`, name: 'Nissan' },
  porsche: { src: `${LOGO_ROOT}/porsche.png`, name: 'Porsche' },
})

export function standingsManufacturerLogo(
  value: unknown,
  resolvePublicPath: StandingsPublicPathResolver = identityPublicPath,
): StandingsManufacturerLogo {
  const key = typeof value === 'string' ? value.trim().toLowerCase() : null
  const logo = key ? LOGOS[key] : null
  const resolved = logo ?? FALLBACK_LOGO
  return {
    key: logo ? key : null,
    ...resolved,
    src: resolvePublicPath(resolved.src),
  }
}
