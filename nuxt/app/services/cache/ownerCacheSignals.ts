// PIP-442: segnale "una cache owner e' stata riempita da Firebase". I repository lo
// emettono dopo una lettura andata a buon fine; la cache persistente lo ascolta per
// salvare su disco con debounce. Nessuna dipendenza: evita il ciclo repository ->
// cache persistente -> repository.

type OwnerCacheListener = (uid: string) => void

const listeners = new Set<OwnerCacheListener>()

export function notifyOwnerCacheChanged(uid: string) {
  for (const listener of Array.from(listeners)) {
    try { listener(uid) } catch { /* un ascoltatore rotto non deve toccare i repository */ }
  }
}

export function onOwnerCacheChanged(listener: OwnerCacheListener): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}

/** Solo test. */
export function resetOwnerCacheSignals() {
  listeners.clear()
}
