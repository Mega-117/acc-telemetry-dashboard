export interface StandingsCarNumberColors {
  background: string
  color: string
}

export function standingsCarNumberColors(carClass: unknown): StandingsCarNumberColors {
  const normalized = typeof carClass === 'string'
    ? carClass.trim().slice(0, 80).toUpperCase()
    : ''
  const backgrounds: Readonly<Record<string, string>> = {
    GT4: 'rgb(38, 38, 69)',
    ST: 'rgb(204, 168, 0)',
    CUP: 'rgb(69, 124, 69)',
    CHL: 'red',
    TCX: 'rgb(0, 124, 167)',
    GT2: 'darkred',
  }
  return {
    background: backgrounds[normalized] ?? 'transparent',
    color: 'white',
  }
}
