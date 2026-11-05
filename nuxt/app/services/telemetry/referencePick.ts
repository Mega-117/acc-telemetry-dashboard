/**
 * PIP-650: which lap of another driver to suggest as your reference (Garage 61 / Delta style).
 * A step above you: 1-2% quicker than your best, so it is reachable and moves up as you improve;
 * among those, the closest conditions (grip, air, track, fuel). The fastest stays available too.
 *
 * dev.10 (user 05/11, as Delta's session-type and conditions filters): first the laps of your class,
 * same kind (qualifying/race), same weather (dry/wet) and the same fuel band; when nobody there is
 * quicker than you, one step wider at a time (band, then weather, then kind), and the reason says so.
 */
import type { LibraryEntry } from './lapsArchiveClient'
import { bandDistance, libraryClass, type LapClass, type Relaxed } from './lapChoice'

export interface ReferenceConditions { grip: string | null, airC: number | null, roadC: number | null, fuelL: number | null }

/** Lower is closer. Each unknown value costs half a point, so laps with full conditions win ties. */
export function conditionDistance(entry: ReferenceConditions, mine: ReferenceConditions): number {
  const part = (a: number | null, b: number | null, scale: number) => a === null || b === null ? 0.5 : Math.min(Math.abs(a - b) / scale, 3)
  const grip = !entry.grip || !mine.grip ? 0.5 : entry.grip.toLowerCase() === mine.grip.toLowerCase() ? 0 : 1
  return grip + part(entry.airC, mine.airC, 5) + part(entry.roadC, mine.roadC, 8) + part(entry.fuelL, mine.fuelL, 30)
}

// The agreed step (user decision 27/10): 1-2% quicker than your best.
export const STEP_UP = Object.freeze({ min: 0.98, max: 0.99 })

/** The ladder: each level keeps less of your lap's class (`relaxed`: what it gave up, for the reason). */
const LEVELS: { relaxed: Relaxed | null, keep: (e: LapClass, mine: LapClass) => boolean }[] = [
  { relaxed: null, keep: (e, m) => e.kind === m.kind && e.wet === m.wet && e.band === m.band },
  { relaxed: 'band', keep: (e, m) => e.kind === m.kind && e.wet === m.wet },
  { relaxed: 'weather', keep: (e, m) => e.kind === m.kind },
  { relaxed: 'kind', keep: () => true },
]

function stepUp(pool: LibraryEntry[], best: number, mine: ReferenceConditions, cls: LapClass | null): LibraryEntry | null {
  const aim = best * (STEP_UP.min + STEP_UP.max) / 2
  // Inside a wider level the nearest band still comes first.
  const near = (e: LibraryEntry) => cls ? bandDistance(libraryClass(e).band, cls.band) : 0
  const rank = (e: LibraryEntry) => conditionDistance(e, mine) + Math.abs(e.lapTimeMs - aim) / aim * 50 + near(e) * 2
  const step = pool.filter(e => e.lapTimeMs >= best * STEP_UP.min && e.lapTimeMs <= best * STEP_UP.max)
  // Nobody in the step: the nearest quicker driver (user 05/11: kept), the nearest band first.
  return step.sort((a, b) => rank(a) - rank(b))[0]
    ?? pool.filter(e => e.lapTimeMs < best).sort((a, b) => near(a) - near(b) || b.lapTimeMs - a.lapTimeMs)[0] ?? null
}

export function pickReferences(entries: LibraryEntry[], ctx: { myUid: string | null, myBestMs: number | null, mine: ReferenceConditions, cls?: LapClass | null }):
  { suggested: LibraryEntry | null, fastest: LibraryEntry | null, relaxed: Relaxed | null } {
  const others = entries.filter(e => e.uid !== ctx.myUid)
  if (!others.length) return { suggested: null, fastest: null, relaxed: null }
  const fastest = [...others].sort((a, b) => a.lapTimeMs - b.lapTimeMs)[0]!
  const best = ctx.myBestMs
  const cls = ctx.cls && ctx.cls.kind ? ctx.cls : null
  let suggested: LibraryEntry | null = null
  let relaxed: Relaxed | null = null
  if (best) {
    // Without a known class (no fuel): every lap at once, as before.
    for (const level of cls ? LEVELS : [LEVELS[3]!]) {
      const pool = cls ? others.filter(e => level.keep(libraryClass(e), cls)) : others
      suggested = pool.length ? stepUp(pool, best, ctx.mine, cls) : null
      if (suggested) { relaxed = cls ? level.relaxed : null; break }
    }
  } else {
    const same = cls ? others.filter(e => LEVELS[0]!.keep(libraryClass(e), cls)) : []
    const pool = same.length ? same : others
    relaxed = cls && !same.length ? 'kind' : null
    suggested = [...pool].sort((a, b) => conditionDistance(a, ctx.mine) - conditionDistance(b, ctx.mine))[0] ?? null
  }
  return { suggested, fastest: suggested?.libId === fastest.libId ? null : fastest, relaxed }
}
