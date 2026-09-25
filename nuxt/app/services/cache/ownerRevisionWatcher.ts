// PIP-442: le cache owner non scadono a tempo. Per accorgersi di scritture dello stesso
// account da un altro PC, ogni OWNER_REVISION_CHECK_MS (solo a finestra visibile e online)
// si rilegge `users/{uid}` (1 lettura) e, se la revisione e' cambiata, si svuotano le cache.
import { loadOwnerDocument } from '~/repositories/ownerDocumentRepository'
import { OWNER_REVISION_CHECK_MS } from '~/services/cache/cachePolicy'
import { recordFirebaseJournalEvent } from '~/services/monitoring/firebaseOpsJournal'

export const OWNER_REVISION_CACHE_KEY = 'owner.revision'
const CALLER = 'OwnerRevisionCheck'

export interface OwnerRevisionWatcherOptions {
  uid: string
  /** Revisione da cui partire (quella letta all'avvio). */
  revision: string | null
  onChanged: (next: string | null, previous: string | null) => void
  isVisible?: () => boolean
  isOnline?: () => boolean
  intervalMs?: number
  setIntervalFn?: typeof setInterval
  clearIntervalFn?: typeof clearInterval
}

export interface OwnerRevisionWatcher {
  /** Esegue subito un controllo (usato dal timer e dai test). */
  check: () => Promise<'unchanged' | 'changed' | 'skipped'>
  /** Aggiorna la revisione nota senza leggere (dopo una sync locale). */
  setRevision: (revision: string | null) => void
  stop: () => void
}

function defaultVisible() {
  return typeof document === 'undefined' || document.visibilityState !== 'hidden'
}

function defaultOnline() {
  return typeof navigator === 'undefined' || navigator.onLine !== false
}

export function startOwnerRevisionWatch(options: OwnerRevisionWatcherOptions): OwnerRevisionWatcher {
  const {
    uid,
    onChanged,
    isVisible = defaultVisible,
    isOnline = defaultOnline,
    intervalMs = OWNER_REVISION_CHECK_MS,
    setIntervalFn = setInterval,
    clearIntervalFn = clearInterval
  } = options
  let known = options.revision
  let stopped = false
  let running: Promise<'unchanged' | 'changed' | 'skipped'> | null = null

  async function check(): Promise<'unchanged' | 'changed' | 'skipped'> {
    if (stopped || !isVisible() || !isOnline()) return 'skipped'
    if (running) return running
    running = (async () => {
      try {
        const snapshot = await loadOwnerDocument(uid, { fresh: true, caller: CALLER })
        if (stopped) return 'skipped'
        const changed = snapshot.revision !== known
        recordFirebaseJournalEvent({ kind: 'cache', cache: OWNER_REVISION_CACHE_KEY, reason: changed ? 'changed' : 'unchanged' })
        if (!changed) return 'unchanged'
        const previous = known
        known = snapshot.revision
        onChanged(snapshot.revision, previous)
        return 'changed'
      } catch (error) {
        // Offline o rules: si ritenta al giro successivo, le cache restano valide.
        console.warn('[OWNER_REVISION] check failed:', error)
        return 'skipped'
      } finally {
        running = null
      }
    })()
    return running
  }

  const timer = setIntervalFn(() => { void check() }, intervalMs)

  return {
    check,
    setRevision: (revision) => { known = revision },
    stop: () => {
      stopped = true
      clearIntervalFn(timer)
    }
  }
}
