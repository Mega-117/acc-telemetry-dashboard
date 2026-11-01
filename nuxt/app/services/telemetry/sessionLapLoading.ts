// Reading the laps of one session for the Telemetria tab, out of the panel so the rule is tested alone.
import type { LapSource } from './lapSources'
import { normalizeLapTrace, type LapTraceView } from './lapTraceChart'
import type { Entry } from '~/composables/useReferenceLibrary'

export interface SessionLapRead { trace: LapTraceView, entry: Entry }
export interface SessionLapResult { total: number, ok: SessionLapRead[] }

/**
 * All laps of the session (about 120 KB each). A lap that cannot be read (pruned meanwhile, damaged) is
 * left out here, never on a later click. Laps on the PC are read together; from the archive one at a time,
 * stopping as soon as the view changed (`null`).
 */
export async function readSessionLaps(source: LapSource, sessionToken: string, validByLap: Map<number, boolean>,
  isCurrent: () => boolean, oneByOne: boolean): Promise<SessionLapResult | null> {
  const list = await source.list(sessionToken)
  if (!isCurrent()) return null
  const readOne = async (d: (typeof list)[number]): Promise<SessionLapRead | null> => {
    try {
      const trace = normalizeLapTrace(await source.read(d))
      return trace ? { trace, entry: { id: d.id, lapNumber: d.lapNumber, lapTimeMs: d.lapTimeMs,
        valid: d.valid ?? validByLap.get(d.lapNumber) ?? false, complete: trace.complete, origin: d.origin, sessionToken: d.sessionToken } } : null
    } catch { return null }
  }
  let read: (SessionLapRead | null)[] = []
  if (oneByOne) {
    for (const d of list) {
      if (!isCurrent()) return null
      read.push(await readOne(d))
    }
  } else read = await Promise.all(list.map(readOne))
  if (!isCurrent()) return null
  return { total: list.length, ok: read.filter((r): r is SessionLapRead => r !== null) }
}

/**
 * 01/11: in the program a session driven with another installation or PC has its laps in that
 * installation's folder, not on this one; the online archive has them, as in the browser. Own laps only:
 * the archive is asked only when the PC has no complete lap of the session.
 */
export async function withArchiveFallback(local: SessionLapResult, archive: () => Promise<SessionLapResult | null>):
  Promise<{ result: SessionLapResult, fromArchive: boolean } | null> {
  if (local.ok.some(r => r.trace.complete)) return { result: local, fromArchive: false }
  const archived = await archive().catch(() => null)
  if (archived === null) return { result: local, fromArchive: false }
  return archived.ok.some(r => r.trace.complete) ? { result: archived, fromArchive: true } : { result: local, fromArchive: false }
}
