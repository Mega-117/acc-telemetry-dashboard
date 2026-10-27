/**
 * PIP-650: which lap of another driver to suggest as your reference (Garage 61 / Delta style).
 * A step above you: 1-2% quicker than your best, so it is reachable and moves up as you improve;
 * among those, the closest conditions (grip, air, track, fuel). The fastest stays available too.
 */
import type { LibraryEntry } from './lapsArchiveClient'

export interface ReferenceConditions { grip: string | null, airC: number | null, roadC: number | null, fuelL: number | null }

/** Lower is closer. Each unknown value costs half a point, so laps with full conditions win ties. */
export function conditionDistance(entry: ReferenceConditions, mine: ReferenceConditions): number {
  const part = (a: number | null, b: number | null, scale: number) => a === null || b === null ? 0.5 : Math.min(Math.abs(a - b) / scale, 3)
  const grip = !entry.grip || !mine.grip ? 0.5 : entry.grip.toLowerCase() === mine.grip.toLowerCase() ? 0 : 1
  return grip + part(entry.airC, mine.airC, 5) + part(entry.roadC, mine.roadC, 8) + part(entry.fuelL, mine.fuelL, 30)
}

// The agreed step (user decision 27/10): 1-2% quicker than your best.
export const STEP_UP = Object.freeze({ min: 0.98, max: 0.99 })

export function pickReferences(entries: LibraryEntry[], ctx: { myUid: string | null, myBestMs: number | null, mine: ReferenceConditions }):
  { suggested: LibraryEntry | null, fastest: LibraryEntry | null } {
  const others = entries.filter(e => e.uid !== ctx.myUid)
  if (!others.length) return { suggested: null, fastest: null }
  const fastest = [...others].sort((a, b) => a.lapTimeMs - b.lapTimeMs)[0]!
  const best = ctx.myBestMs
  let suggested: LibraryEntry | null = null
  if (best) {
    const band = others.filter(e => e.lapTimeMs >= best * STEP_UP.min && e.lapTimeMs <= best * STEP_UP.max)
    const aim = best * (STEP_UP.min + STEP_UP.max) / 2
    const rank = (e: LibraryEntry) => conditionDistance(e, ctx.mine) + Math.abs(e.lapTimeMs - aim) / aim * 50
    // Nobody in the step: the nearest quicker driver; nobody quicker: no suggestion (the fastest is shown).
    suggested = band.sort((a, b) => rank(a) - rank(b))[0]
      ?? others.filter(e => e.lapTimeMs < best).sort((a, b) => b.lapTimeMs - a.lapTimeMs)[0] ?? null
  } else {
    suggested = [...others].sort((a, b) => conditionDistance(a, ctx.mine) - conditionDistance(b, ctx.mine))[0] ?? null
  }
  return { suggested, fastest: suggested?.libId === fastest.libId ? null : fastest }
}
