// 05/11 (user): corner times on the minimap never cover each other (Monza corners 3 and 4).
import { describe, expect, it } from 'vitest'
import { placeMapLabels } from '~/services/telemetry/mapLabelPlacement'

const box = (p: { x: number, y: number }, w = 44, h = 13) => ({ x0: p.x - w / 2, y0: p.y - h / 2, x1: p.x + w / 2, y1: p.y + h / 2 })
const overlap = (a: ReturnType<typeof box>, b: ReturnType<typeof box>) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1

describe('placeMapLabels', () => {
  it('a lone time keeps its spot outside the bend', () => {
    const [p] = placeMapLabels([{ anchor: { x: 100, y: 100 }, preferred: { x: 100, y: 134 }, width: 44, height: 13 }], [], 11)
    expect(p).toEqual({ x: 100, y: 134 })
  })

  it('two close bends (Monza 3-4) get two times that do not overlap, and none on a corner number', () => {
    // Corners 3 and 4 on the same side, 30 px apart: both would write at (x, 134).
    const items = [
      { anchor: { x: 100, y: 100 }, preferred: { x: 100, y: 134 }, width: 44, height: 13 },
      { anchor: { x: 130, y: 100 }, preferred: { x: 130, y: 134 }, width: 44, height: 13 },
    ]
    const numbers = [{ x: 100, y: 116 }, { x: 130, y: 116 }]
    const [a, b] = placeMapLabels(items, numbers, 11)
    expect(a).toEqual({ x: 100, y: 134 })
    expect(overlap(box(a!), box(b!))).toBe(false)
    for (const n of numbers) {
      const bx = box(b!)
      const nx = Math.min(Math.max(n.x, bx.x0), bx.x1), ny = Math.min(Math.max(n.y, bx.y0), bx.y1)
      expect((n.x - nx) ** 2 + (n.y - ny) ** 2).toBeGreaterThanOrEqual(11 * 11)
    }
  })

  it('a spot kept inside the map by the caller is still checked for overlaps', () => {
    const clampX = (p: { x: number, y: number }) => ({ x: Math.min(p.x, 150), y: p.y })
    const items = [
      { anchor: { x: 140, y: 100 }, preferred: { x: 140, y: 134 }, width: 44, height: 13 },
      { anchor: { x: 150, y: 100 }, preferred: { x: 150, y: 134 }, width: 44, height: 13 },
    ]
    const [a, b] = placeMapLabels(items, [], 11, clampX)
    expect(overlap(box(a!), box(b!))).toBe(false)
    expect(b!.x).toBeLessThanOrEqual(150)
  })
})
