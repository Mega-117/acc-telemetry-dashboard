/**
 * 05/11 (user): the corner times on the minimap must never cover each other (Monza: corners 3 and 4 a few
 * metres apart wrote "−0.0xx" and "+0.069" on top of one another). Greedy placement, as map labelling does:
 * each time keeps its preferred spot (outside the bend) when free; otherwise it tries spots around its own
 * corner - turning away from the preferred direction, then a little further out - and takes the first that
 * covers neither an earlier time nor a corner number. Pure: points and sizes in, positions out.
 */
export interface LabelPoint { x: number, y: number }
export interface LabelToPlace {
  /** The corner the time belongs to (its number circle). */
  anchor: LabelPoint
  /** Where it would go (outside the bend). */
  preferred: LabelPoint
  /** Text box size. */
  width: number
  height: number
}

interface Box { x0: number, y0: number, x1: number, y1: number }
const boxOf = (c: LabelPoint, w: number, h: number): Box => ({ x0: c.x - w / 2, y0: c.y - h / 2, x1: c.x + w / 2, y1: c.y + h / 2 })
const overlaps = (a: Box, b: Box) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1
const hitsCircle = (b: Box, c: LabelPoint, r: number) => {
  const nx = Math.min(Math.max(c.x, b.x0), b.x1), ny = Math.min(Math.max(c.y, b.y0), b.y1)
  return (c.x - nx) ** 2 + (c.y - ny) ** 2 < r * r
}

/** Angles tried around the corner, from the preferred direction outwards (degrees). */
const TURNS = [0, 35, -35, 70, -70, 110, -110, 150, -150, 180]
const REACH = [1, 1.35, 1.7]

export function placeMapLabels(items: LabelToPlace[], corners: LabelPoint[], cornerRadius: number,
  keepInside: (p: LabelPoint) => LabelPoint = p => p): LabelPoint[] {
  const placed: Box[] = []
  return items.map((item) => {
    const dx = item.preferred.x - item.anchor.x, dy = item.preferred.y - item.anchor.y
    const dist = Math.hypot(dx, dy) || 1
    const base = Math.atan2(dy, dx)
    const free = (p: LabelPoint) => {
      const b = boxOf(p, item.width, item.height)
      return !placed.some(o => overlaps(o, b)) && !corners.some(c => hitsCircle(b, c, cornerRadius))
    }
    let chosen: LabelPoint | null = null
    for (const reach of REACH) {
      for (const turn of TURNS) {
        const a = base + (turn * Math.PI) / 180
        const p = keepInside({ x: item.anchor.x + Math.cos(a) * dist * reach, y: item.anchor.y + Math.sin(a) * dist * reach })
        if (free(p)) { chosen = p; break }
      }
      if (chosen) break
    }
    // Nowhere free (a crowded hairpin): the preferred spot, as before.
    const at = chosen ?? keepInside(item.preferred)
    placed.push(boxOf(at, item.width, item.height))
    return at
  })
}
