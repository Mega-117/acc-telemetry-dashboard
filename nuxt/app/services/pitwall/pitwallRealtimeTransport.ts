import {
  get, onValue, ref, update, runTransaction, onDisconnect, serverTimestamp,
  type Database, type Unsubscribe,
} from 'firebase/database'
import { createPitwallIoMetrics, jsonPayloadBytes } from './pitwallIoMetrics'

export const PITWALL_ROOT = 'pitwallV3'
export const PITWALL_PROTOCOL = 3 as const
export type RealtimeRecord = Record<string, unknown>
type Watcher = (value: unknown) => void
type Watched = { ready: boolean, value: unknown, watchers: Set<Watcher>, errors: Set<(error: Error) => void>, stop: Unsubscribe }

/** One SDK connection, shared subscriptions, and server-confirmed mutations. */
export function createPitwallRealtimeTransport(database: Database) {
  const metrics = createPitwallIoMetrics()
  const watches = new Map<string, Watched>()
  const reads = new Map<string, Promise<unknown>>()
  const connectionWatchers = new Set<(online: boolean) => void>()
  let connected = false
  let offsetMs = 0
  let disposed = false
  let connectionGeneration = 0
  const pathOf = (path: string) => `${PITWALL_ROOT}/${path}`
  const at = (path: string) => ref(database, pathOf(path))
  const requireOnline = () => { if (!connected || disposed) throw new Error('Collegamento Pitwall non disponibile. Riprova quando torna online.') }
  const stopOffset = onValue(ref(database, '.info/serverTimeOffset'), snapshot => { offsetMs = Number(snapshot.val()) || 0 })
  const stopConnected = onValue(ref(database, '.info/connected'), snapshot => {
    const next = snapshot.val() === true
    if (next === connected) return
    connected = next
    connectionGeneration++
    metrics.record({ operation: 'connection', path: '.info/connected', bytes: 0, success: true, connected })
    for (const listener of connectionWatchers) listener(connected)
  })

  function watch(path: string, callback: Watcher, onError: (error: Error) => void = () => {}) {
    let entry = watches.get(path)
    if (!entry) {
      entry = { ready: false, value: null, watchers: new Set(), errors: new Set(), stop: () => {} }
      watches.set(path, entry)
      const shared = entry
      metrics.record({ operation: 'listen', path, bytes: 0, success: true })
      shared.stop = onValue(at(path), snapshot => {
        shared.value = snapshot.val()
        shared.ready = true
        // RTDB has no Firestore-style fromCache metadata: deliveries include SDK local echoes.
        metrics.record({ operation: 'receive', path, bytes: jsonPayloadBytes(shared.value), success: true })
        for (const listener of shared.watchers) listener(shared.value)
      }, error => {
        shared.ready = false
        shared.value = null
        // Firebase cancels denied listeners. A later explicit rejoin must create
        // a fresh subscription instead of reusing this permanently dead entry.
        if (watches.get(path) === shared) watches.delete(path)
        metrics.record({ operation: 'receive', path, bytes: 0, success: false })
        for (const listener of shared.errors) listener(error)
      })
    }
    entry.watchers.add(callback)
    entry.errors.add(onError)
    if (entry.ready) callback(entry.value)
    const shared = entry
    return () => {
      shared.watchers.delete(callback)
      shared.errors.delete(onError)
      if (!shared.watchers.size) { shared.stop(); if (watches.get(path) === shared) watches.delete(path) }
    }
  }

  function read<T>(path: string): Promise<T | null> {
    requireOnline()
    const cached = watches.get(path)
    if (cached?.ready) { metrics.record({ operation: 'cache', path, bytes: 0, success: true }); return Promise.resolve(cached.value as T | null) }
    const pending = reads.get(path)
    if (pending) { metrics.record({ operation: 'read-shared', path, bytes: 0, success: true }); return pending as Promise<T | null> }
    // An attached listener provides the initial value; a second get would download it twice.
    if (cached) return new Promise<T | null>((resolve, reject) => {
      metrics.record({ operation: 'read-shared', path, bytes: 0, success: true })
      let stop = () => {}
      let stopConnection = () => {}
      const timer = setTimeout(() => { stop(); stopConnection(); reject(new Error('Tempo esaurito in attesa del primo snapshot Pitwall.')) }, 15_000)
      const finish = () => { clearTimeout(timer); stop(); stopConnection() }
      stop = watch(path, value => { finish(); resolve(value as T | null) }, error => { finish(); reject(error) })
      stopConnection = onConnection(online => { if (!online) { finish(); reject(new Error('Connessione interrotta durante la lettura.')) } })
    })
    const generation = connectionGeneration
    const request = (async () => { try {
      const snapshot = await get(at(path))
      requireOnline()
      if (generation !== connectionGeneration) throw new Error('Connessione cambiata durante la lettura.')
      metrics.record({ operation: 'read', path, bytes: jsonPayloadBytes(snapshot.val()), success: true })
      return snapshot.val() as T | null
    } catch (error) {
      metrics.record({ operation: 'read', path, bytes: 0, success: false })
      throw error
    } finally { reads.delete(path) } })()
    reads.set(path, request)
    return request
  }

  async function write(path: string, changes: RealtimeRecord) {
    requireOnline()
    const removing = Object.values(changes).every(value => value === null)
    try {
      await update(at(path), changes)
      metrics.record({ operation: removing ? 'delete' : 'write', path, bytes: jsonPayloadBytes(changes), success: true,
        deletedPaths: Object.values(changes).filter(value => value === null).length })
    } catch (error) {
      metrics.record({ operation: removing ? 'delete' : 'write', path, bytes: jsonPayloadBytes(changes), success: false })
      throw error
    }
  }

  async function transact<T>(path: string, change: (current: T | null) => T | null | undefined) {
    requireOnline()
    const generation = connectionGeneration
    let attempts = 0
    let bytes = 0
    try {
      const result = await runTransaction(at(path), current => {
        attempts++
        if (!connected || disposed || generation !== connectionGeneration) return undefined
        const next = change(current as T | null)
        if (next !== undefined) bytes += jsonPayloadBytes(next)
        return next
      }, { applyLocally: false })
      metrics.record({ operation: 'transaction', path, bytes, attempts, committed: result.committed, success: true,
        responseBytes: jsonPayloadBytes(result.snapshot.val()), deletedPaths: result.committed && !result.snapshot.exists() ? 1 : 0 })
      return { committed: result.committed, value: result.snapshot.val() as T | null }
    } catch (error) {
      metrics.record({ operation: 'transaction', path, bytes, attempts, success: false })
      throw error
    }
  }

  async function registerDisconnect(path: string) {
    requireOnline()
    const action = onDisconnect(at(path))
    await action.remove()
    requireOnline()
    return () => action.cancel()
  }

  async function registerDisconnectUpdates(changes: Record<string, null>) {
    requireOnline()
    const action = onDisconnect(ref(database, PITWALL_ROOT))
    await action.update(changes)
    metrics.record({ operation: 'disconnect-register', path: PITWALL_ROOT, bytes: jsonPayloadBytes(changes), success: true })
    requireOnline()
    // Cancelling the root operation would also cancel another session's presence.
    return async () => { await Promise.all(Object.keys(changes).map(path => onDisconnect(at(path)).cancel())) }
  }

  function onConnection(callback: (online: boolean) => void) {
    connectionWatchers.add(callback)
    callback(connected)
    return () => { connectionWatchers.delete(callback) }
  }

  function dispose() {
    if (disposed) return
    disposed = true
    stopConnected(); stopOffset()
    for (const entry of watches.values()) entry.stop()
    watches.clear(); connectionWatchers.clear()
    if (connected) metrics.record({ operation: 'connection', path: '.info/connected', bytes: 0, success: true, connected: false })
    connected = false
  }

  return { database, metrics, watch, read, write, transact, registerDisconnect, registerDisconnectUpdates, onConnection,
    online: () => connected && !disposed, serverNow: () => Date.now() + offsetMs,
    clockOffsetMs: () => offsetMs, serverTimestamp, dispose }
}
export type PitwallRealtimeTransport = ReturnType<typeof createPitwallRealtimeTransport>
