export type SpotterSector = 1 | 2 | 3

const SECTOR_LABELS: Record<SpotterSector, string> = {
  1: 'uno',
  2: 'due',
  3: 'tre',
}

const TENTHS_LABELS: Record<number, string> = {
  1: 'un decimo',
  2: 'due decimi',
  3: 'tre decimi',
  4: 'quattro decimi',
  5: 'cinque decimi',
  6: 'sei decimi',
  7: 'sette decimi',
  8: 'otto decimi',
  9: 'nove decimi',
}

const TENTH_NUMBER_LABELS: Record<number, string> = {
  1: 'uno',
  2: 'due',
  3: 'tre',
  4: 'quattro',
  5: 'cinque',
  6: 'sei',
  7: 'sette',
  8: 'otto',
  9: 'nove',
}

export function formatSpotterDelta(ms: number | null | undefined): string {
  const value = Math.abs(Math.trunc(ms || 0))
  if (value < 100) return 'meno di un decimo'
  if (value >= 2000) return 'oltre due secondi'

  const seconds = Math.floor(value / 1000)
  const tenths = Math.floor((value % 1000) / 100)

  if (seconds <= 0) {
    return TENTHS_LABELS[Math.max(1, tenths)] || 'meno di un decimo'
  }

  const secondLabel = seconds === 1 ? 'un secondo' : `${seconds} secondi`
  if (tenths <= 0) return secondLabel
  return `${secondLabel} e ${TENTH_NUMBER_LABELS[tenths]}`
}

export function formatSpotterSector(sector: SpotterSector | null | undefined): string {
  if (!sector) return 'nessun settore chiaro'
  return SECTOR_LABELS[sector] || 'nessun settore chiaro'
}

export function resolveDemoKeySector(
  sectorsMs: number[] | null | undefined,
  mode: 'strongest' | 'weakest'
): SpotterSector | null {
  const sectors = (sectorsMs || []).slice(0, 3)
  if (sectors.length < 3 || sectors.some((value) => !Number.isFinite(value) || value <= 0)) return null

  let selectedIndex = 0
  for (let i = 1; i < sectors.length; i++) {
    if (mode === 'strongest' && sectors[i]! < sectors[selectedIndex]!) selectedIndex = i
    if (mode === 'weakest' && sectors[i]! > sectors[selectedIndex]!) selectedIndex = i
  }
  return (selectedIndex + 1) as SpotterSector
}
