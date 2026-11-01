import { lapKind } from '~/services/telemetry/lapChoice'
import { ref, watch, type Ref } from 'vue'
import { electronLapSource, pilotLapSource, type LocalLapBridge } from '~/services/telemetry/lapSources'
import type { LapsArchiveDeps } from '~/services/telemetry/lapsArchiveClient'
import type { LapTraceView } from '~/services/telemetry/lapTraceChart'
import { loadSharedLapLink, type SharedLapLoaded } from '~/services/telemetry/sharedLapLoad'
import type { RefReason } from '~/services/telemetry/lapChoice'
import { carMismatchNote, type Entry, type useReferenceLibrary } from './useReferenceLibrary'

export interface CompareTarget { ownerUid: string, sessionToken: string, sharedSessionId: string | null, label: string }

/**
 * PIP-652: the page's one "Confronta", seen from the Telemetria. A lap link pasted there arrives once your
 * laps are loaded and becomes the reference; a session picked there (yours or by link) brings its whole
 * valid laps as references, its best one proposed. Errors are sentences for the page.
 */
export function useCompareTargets(o: {
  pendingLapLink: () => string | null | undefined
  compareWith: () => CompareTarget | null | undefined
  currentLap: () => LapTraceView | null
  entries: Ref<Entry[]>
  refId: Ref<string>
  library: ReturnType<typeof useReferenceLibrary>
  deps: LapsArchiveDeps
  bridge: () => LocalLapBridge | null
  /** The shown session's owner (coach view: the pilot), to read your own compared session from the PC. */
  viewerUid: () => string | null
  ownView: () => boolean
  traces: Ref<Record<string, LapTraceView>>
  isCurrent: () => () => boolean
  handled: () => void
  /** PIP-695: the reference proposed by a link or a compared session, with its reason (default: set it). */
  propose?: (id: string, reason: RefReason) => void
}) {
  const linkError = ref('')
  const propose = o.propose ?? ((id: string) => { o.refId.value = id })
  // A lap shared with a link becomes the reference (one at a time); another car gets its note.
  function addSharedLap(shared: SharedLapLoaded) {
    o.traces.value = { ...o.traces.value, [shared.id]: shared.trace }
    o.entries.value = [...o.entries.value.filter(e => e.origin !== 'shared'), sharedLapEntry(shared)]
    propose(shared.id, { kind: 'link', driver: shared.driver ?? null })
  }
  watch([o.pendingLapLink, o.currentLap], async ([link, current]) => {
    if (!link || !current) return
    const isCurrent = o.isCurrent()
    linkError.value = ''
    const result = await loadSharedLapLink(link, current, o.deps, { isCurrent })
    o.handled()
    if (result?.error) linkError.value = result.error
    else if (result?.lap) addSharedLap(result.lap)
  })
  // Only the latest request counts: a second run (target set again, laps reloaded) never mixes with the first.
  let run = 0
  watch([o.compareWith, () => o.entries.value.some(e => e.origin === 'local' || e.origin === 'pilot')], async ([target, ready]) => {
    const mineRun = ++run
    if (!target) { o.library.clearCompareSession(); return }
    if (!ready) return
    const sameView = o.isCurrent(), bridge = o.bridge()
    const isCurrent = () => sameView() && mineRun === run
    const mine = target.ownerUid === o.viewerUid()
    const source = mine && o.ownView() && typeof bridge?.listLapTraces === 'function' ? electronLapSource(bridge)
      : pilotLapSource(target.ownerUid, o.deps, mine ? null : target.sharedSessionId)
    const best = await o.library.loadCompareSession(isCurrent, source, target, lapKind(o.currentLap()?.fuelL))
    if (best && isCurrent()) propose(best, { kind: 'compare', label: target.label })
  })
  return { linkError }
}

/** A lap received by link as a Telemetria lap (shared origin, another car noted). */
export function sharedLapEntry(shared: SharedLapLoaded): Entry {
  return { id: shared.id, lapNumber: shared.lapNumber, lapTimeMs: shared.lapTimeMs, valid: true, complete: shared.trace.complete,
    origin: 'shared', sessionToken: shared.sessionToken ?? '', label: shared.label, note: shared.carMismatch ? carMismatchNote() : undefined,
    driver: shared.driver ?? null, ownerUid: shared.ownerUid ?? null }
}
