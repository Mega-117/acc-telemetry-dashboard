import { describe, expect, it } from 'vitest'
import { normalizeStandingsLayout } from '../../app/services/overlay/standingsLayout'

const layout = {
  width: 606,
  height: 444,
  rowCapacity: 10,
  paddingX: 10,
  paddingY: 10,
  headerHeight: 48,
  rowHeight: 34,
  rowGap: 4,
  columnGap: 8,
  vehicleGap: 4,
  columnWidths: {
    position: 30,
    driver: 140,
    manufacturer: 38,
    carNumber: 50,
    pit: 28,
    bestLap: 92,
    lastLap: 92,
    progress: 76,
    gap: 64,
  },
}

describe('standingsLayout', () => {
  it('accetta e normalizza soltanto il layout completo ricevuto dal manager', () => {
    expect(normalizeStandingsLayout(layout)).toEqual(layout)
    const { rowGap: _rowGap, ...legacyLayout } = layout
    expect(normalizeStandingsLayout(legacyLayout)).toEqual({ ...legacyLayout, rowGap: 0 })
  })

  it('fallisce chiuso su viewport, capacità o colonne non affidabili', () => {
    expect(normalizeStandingsLayout(null)).toBeNull()
    expect(normalizeStandingsLayout({ ...layout, width: 0 })).toBeNull()
    expect(normalizeStandingsLayout({ ...layout, rowCapacity: 1.5 })).toBeNull()
    expect(normalizeStandingsLayout({ ...layout, columnWidths: null })).toBeNull()
    expect(normalizeStandingsLayout({
      ...layout,
      columnWidths: { ...layout.columnWidths, progress: -1 },
    })).toBeNull()
    expect(normalizeStandingsLayout({ ...layout, rowGap: -1 })).toBeNull()
  })
})
