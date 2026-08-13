import { describe, expect, it } from 'vitest'
import { normalizeStandingsLayout } from '../../app/services/overlay/standingsLayout'

const layout = {
  width: 538,
  height: 340,
  rowCapacity: 10,
  paddingX: 10,
  paddingY: 10,
  headerHeight: 40,
  rowHeight: 28,
  columnGap: 8,
  columnWidths: {
    position: 30,
    driver: 140,
    carNumber: 50,
    pit: 22,
    bestLap: 76,
    lastLap: 76,
    progress: 76,
  },
}

describe('standingsLayout', () => {
  it('accetta e normalizza soltanto il layout completo ricevuto dal manager', () => {
    expect(normalizeStandingsLayout(layout)).toEqual(layout)
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
  })
})
