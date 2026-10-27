import {
  get, onValue, ref, update, runTransaction, onDisconnect, serverTimestamp,
  type Database, type Unsubscribe,
} from 'firebase/database'
import { createPitwallIoMetrics, jsonPayloadBytes, pitwallIoErrorCode } from './pitwallIoMetrics'

export const PITWALL_ROOT = 'pitwallV3'
export const PITWALL_PROTOCOL = 3 as const
export type RealtimeRecord = Record<string, unknown>
type Watcher = (value: unknown) => void
type Watched = { ready: boolean, value: unknown, watchers: Set<Watcher>, errors: Set<(error: Error) => void>, stop: Unsubscribe }

/** One SDK connection, shared subscriptions, and server-confirmed mutations. */
// PIP-660: every transport of a Database, so the idle decision covers them all (main, social, history).
type TransportHandle = { idle: () => boolean }
const transportsByDatabase = new WeakMap<Database, Set<TransportHandle>>()
const wakeByDatabase = new WeakMap<Database, () => Promise<void>>()
/** The config registers how to reopen an idle-closed connection; transports created later use it too. */
export function setPitwallRealtimeWake(database: Database, wake: () => Promise<void>) { wakeByDatabase.set(database, wake) }
/** True when no transport of this Database is listening, working or holding an onDisconnect. */
export function pitwallRealtimeDatabaseIdle(database: Database) {
  for (const handle of transportsByDatabase.get(database) ?? []) if (!handle.idle()) return false
  return true
}

export function createPitwallRealtimeTransport(database: Database, namespace: string = PITWALL_ROOT,
  // PIP-660: called before any use; after an idle disconnect it reopens the connection and waits for it.
  options: { wake?: () => Promise<void> } = {}) {
  const metrics = createPitwallIoMetrics(namespace)
  const watches = new Map<string, Watched>()
  const reads = new Map<string, Promise<unknown>>()
  const connectionWatchers = new Set<(online: boolean) => void>()
  let connected = false
  let offsetMs = 0
  let disposed = false
  let connectionGeneration = 0
  // PIP-660: work in progress and live onDisconnect registrations keep the connection open (see idle()).
  let inFlight = 0
  // Paths with a live onDisconnect: a later cancel on the same path (from any handle) releases it, as Firebase does.
  const disconnectPaths = new Set<string>()
  const pathOf = (path: string) => `${namespace}/${path}`
  const at = (path: string) => ref(database, pathOf(path))
  const requireOnline = () => { if (!connected || disposed) throw new Error('Collegamento Pitwall non disponibile. Riprova quando torna online.') }
  const wake = async () => {
    const reopen = options.wake ?? wakeByDatabase.get(database)
    if (reopen && !disposed) await reopen()
  }
  async function busy<T>(work: () => Promise<T>): Promise<T> {
    inFlight++
    try { await wake(); return await work() } finally { inFlight-- }
  }
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
      // A new listener needs the connection: reopen it if it was closed while idle (the listener attaches anyway).
      void wake().catch(() => {})
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
        metrics.record({ operation: 'receive', path, bytes: 0, success: false, errorCode: pitwallIoErrorCode(error) })
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
    // The clean-up must cover every exit, also a failed wake or "not connected" (else the read stays listed).
    const request = (async () => { try { return await busy(async () => { try {
      requireOnline()
      const generation = connectionGeneration
      const snapshot = await get(at(path))
      requireOnline()
      if (generation !== connectionGeneration) throw new Error('Connessione cambiata durante la lettura.')
      metrics.record({ operation: 'read', path, bytes: jsonPayloadBytes(snapshot.val()), success: true })
      return snapshot.val() as T | null
    } catch (error) {
      metrics.record({ operation: 'read', path, bytes: 0, success: false, errorCode: pitwallIoErrorCode(error) })
      throw error
    } }) } finally { reads.delete(path) } })()
    reads.set(path, request)
    return request
  }

  async function write(path: string, changes: RealtimeRecord) { return busy(async () => {
    requireOnline()
    const removing = Object.values(changes).every(value => value === null)
    try {
      await update(at(path), changes)
      metrics.record({ operation: removing ? 'delete' : 'write', path, bytes: jsonPayloadBytes(changes), success: true,
        deletedPaths: Object.values(changes).filter(value => value === null).length })
    } catch (error) {
      metrics.record({ operation: removing ? 'delete' : 'write', path, bytes: jsonPayloadBytes(changes), success: false, errorCode: pitwallIoErrorCode(error) })
      throw error
    }
  }) }

  async function transact<T>(path: string, change: (current: T | null) => T | null | undefined) { return busy(async () => {
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
      metrics.record({ operation: 'transaction', path, bytes, attempts, success: false, errorCode: pitwallIoErrorCode(error) })
      throw error
    }
  }) }

  async function registerDisconnect(path: string) { return busy(async () => {
    requireOnline()
    const action = onDisconnect(at(path))
    await action.remove()
    metrics.record({ operation: 'disconnect-register', path, bytes: 0, success: true })
    requireOnline()
    // PIP-660: a live onDisconnect (presence) pins the connection until it is cancelled.
    disconnectPaths.add(pathOf(path))
    return () => { disconnectPaths.delete(pathOf(path)); return action.cancel() }
  }) }

  async function registerDisconnectUpdates(changes: Record<string, unknown>) { return busy(async () => {
    requireOnline()
    const action = onDisconnect(ref(database, namespace))
    await action.update(changes)
    metrics.record({ operation: 'disconnect-register', path: namespace, bytes: jsonPayloadBytes(changes), success: true })
    requireOnline()
    for (const path of Object.keys(changes)) disconnectPaths.add(pathOf(path))
    // Cancelling the root operation would also cancel another session's presence.
    return async () => {
      for (const path of Object.keys(changes)) disconnectPaths.delete(pathOf(path))
      await Promise.all(Object.keys(changes).map(path => onDisconnect(at(path)).cancel()))
    }
  }) }

  function onConnection(callback: (online: boolean) => void) {
    connectionWatchers.add(callback)
    callback(connected)
    return () => { connectionWatchers.delete(callback) }
  }

  function dispose() {
    if (disposed) return
    disposed = true
    transportsByDatabase.get(database)?.delete(handle)
    stopConnected(); stopOffset()
    for (const entry of watches.values()) entry.stop()
    watches.clear(); connectionWatchers.clear()
    if (connected) metrics.record({ operation: 'connection', path: '.info/connected', bytes: 0, success: true, connected: false })
    connected = false
  }

  /** PIP-660: nothing listening, running or registered for disconnect: the connection may close. */
  const idle = () => disposed || (watches.size === 0 && reads.size === 0 && inFlight === 0 && disconnectPaths.size === 0)
  const handle: TransportHandle = { idle }
  if (!transportsByDatabase.has(database)) transportsByDatabase.set(database, new Set())
  transportsByDatabase.get(database)!.add(handle)

  return { database, namespace, metrics, watch, read, write, transact, registerDisconnect, registerDisconnectUpdates, onConnection, idle,
    online: () => connected && !disposed, serverNow: () => Date.now() + offsetMs,
    clockOffsetMs: () => offsetMs, serverTimestamp, dispose }
}
export type PitwallRealtimeTransport = ReturnType<typeof createPitwallRealtimeTransport>
