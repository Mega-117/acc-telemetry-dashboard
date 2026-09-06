import { doc, type Firestore } from 'firebase/firestore'
import { trackedOnDocSnapshot } from '~/composables/useFirebaseTracker'

/** Account-scoped profile subscriptions: initial snapshot, updates, and no navigation reloads. */
export function createPitwallProfileCache(db: Firestore) {
  type Entry = { name: string, ready: Promise<string>, stop: () => void, resolve: (value: string) => void }
  const entries = new Map<string, Entry>()
  const listeners = new Set<() => void>()
  let stopped = false
  function read(uid: string): Promise<string> {
    if (stopped) return Promise.resolve(uid)
    const existing = entries.get(uid)
    if (existing) return existing.ready.then(() => existing.name)
    let resolve!: (value: string) => void
    const entry: Entry = { name: uid, ready: new Promise<string>(done => { resolve = done }), stop: () => {}, resolve: value => resolve(value) }
    entries.set(uid, entry)
    entry.stop = trackedOnDocSnapshot(doc(db, 'publicProfiles', uid), 'pitwall.profileCache', snapshot => {
      if (stopped) return
      entry.name = snapshot.exists() ? String((snapshot.data() as { nickname?: string }).nickname || uid) : uid
      resolve(entry.name)
      for (const listener of listeners) listener()
    }, () => { resolve(uid); entries.delete(uid) })
    return entry.ready
  }
  return { read,
    onChange(callback: () => void) { listeners.add(callback); return () => { listeners.delete(callback) } },
    stop() { stopped = true; for (const entry of entries.values()) { entry.stop(); entry.resolve(entry.name) }; entries.clear(); listeners.clear() },
  }
}
