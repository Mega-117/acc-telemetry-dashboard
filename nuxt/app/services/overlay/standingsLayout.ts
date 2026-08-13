export interface StandingsLayout {
  width: number
  height: number
  rowCapacity: number
  paddingX: number
  paddingY: number
  headerHeight: number
  rowHeight: number
  columnGap: number
  columnWidths: {
    position: number
    driver: number
    carNumber: number
    pit: number
    bestLap: number
    lastLap: number
    progress: number
  }
}

export const EMPTY_STANDINGS_LAYOUT: Readonly<StandingsLayout> = Object.freeze({
  width: 0,
  height: 0,
  rowCapacity: 0,
  paddingX: 0,
  paddingY: 0,
  headerHeight: 0,
  rowHeight: 0,
  columnGap: 0,
  columnWidths: Object.freeze({
    position: 0,
    driver: 0,
    carNumber: 0,
    pit: 0,
    bestLap: 0,
    lastLap: 0,
    progress: 0,
  }),
})

/** Validate manager-owned geometry without deriving or measuring it here. */
export function normalizeStandingsLayout(value: unknown): StandingsLayout | null {
  if (!value || typeof value !== 'object') return null
  const source = value as Partial<StandingsLayout>
  const columns = source.columnWidths
  if (!columns || typeof columns !== 'object') return null
  const numericKeys: Array<keyof Omit<StandingsLayout, 'columnWidths'>> = [
    'width', 'height', 'rowCapacity', 'paddingX', 'paddingY', 'headerHeight', 'rowHeight', 'columnGap',
  ]
  const columnKeys: Array<keyof StandingsLayout['columnWidths']> = [
    'position', 'driver', 'carNumber', 'pit', 'bestLap', 'lastLap', 'progress',
  ]
  if (numericKeys.some(key => !Number.isFinite(Number(source[key])) || Number(source[key]) < 0)) return null
  if (columnKeys.some(key => !Number.isFinite(Number(columns[key])) || Number(columns[key]) <= 0)) return null
  if (
    Number(source.width) <= 0
    || Number(source.height) <= 0
    || !Number.isInteger(Number(source.rowCapacity))
    || Number(source.rowCapacity) <= 0
  ) return null
  return {
    width: Number(source.width),
    height: Number(source.height),
    rowCapacity: Number(source.rowCapacity),
    paddingX: Number(source.paddingX),
    paddingY: Number(source.paddingY),
    headerHeight: Number(source.headerHeight),
    rowHeight: Number(source.rowHeight),
    columnGap: Number(source.columnGap),
    columnWidths: Object.fromEntries(
      columnKeys.map(key => [key, Number(columns[key])]),
    ) as StandingsLayout['columnWidths'],
  }
}
