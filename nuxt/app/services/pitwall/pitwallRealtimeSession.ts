import type { PitwallRealtimeTransport } from './pitwallRealtimeTransport'
import type { RealtimeConnection } from './pitwallRealtimeProtocol'
import { stablePitwallValue } from './pitwallChangePublisher'
import { PITWALL_SOCIAL_ROOT } from './pitwallSocialRoom'
import { emitPitwallDiagnostic } from './pitwallDiagnostics'
import { recordUsage } from '../usage/usageClient'

/** Canonical device presence; room presence is only an index to this connection. */
export function createPitwallRealtimeSession(io: PitwallRealtimeTransport, uid: string) {
  let connectionId = ''
  let wanted: Omit<RealtimeConnection, 'connectionId' | 'protocolVersion' | 'updatedAt' | 'uid'> | null = null
  let currentRoom: string | null = null
  let signature = ''
  let generation = 0
  let busy: Promise<void> = Promise.resolve()
  const errors = new Set<(error: unknown) => void>()
  const connectionListeners = new Set<() => void>()
  const ownedPaths = new Set<string>()
  const disconnectCancellations = new Set<() => Promise<void>>()
  // PIP-593: directory/<uid> names the account's last publisher. When that device closes, the room rules
  // (own_alive) refuse the account after the disconnect grace, and the signature dedup kept another live
  // device of the same account from publishing again. That device now points the directory back at its own
  // live occupancy. Only the directory is written: the directory rule needs the writer's occupancy, not the
  // departed device's authority, so it also works after a clean stop or after the grace (Codex review).
  let stopFailover: (() => void) | null = null
  let directoryEntry: { roomId?: string, connectionId?: string, slot?: string } | null = null
  let ownConnections: Record<string, unknown> | null = null
  function checkFailover() {
    if (!currentRoom || !connectionId || !directoryEntry || !ownConnections) return
    if (directoryEntry.roomId !== currentRoom || directoryEntry.connectionId === connectionId) return
    if (directoryEntry.connectionId && ownConnections[directoryEntry.connectionId]) return // that device is alive
    if (!directoryEntry.slot) return
    const pointer = { roomId: currentRoom, slot: directoryEntry.slot, connectionId }
    const token = generation
    emitPitwallDiagnostic('connection_changed', { uid, connectionId, roomId: currentRoom, reason: 'directory-failover' })
    busy = busy.then(async () => {
      if (token !== generation || !io.online() || currentRoom !== pointer.roomId || connectionId !== pointer.connectionId) return
      await io.write('', { [`directory/${uid}`]: pointer })
    }).catch(error => { for (const listener of errors) listener(error) })
  }
  function watchFailover() {
    if (stopFailover || io.namespace !== PITWALL_SOCIAL_ROOT || typeof io.watch !== 'function') return
    // A cancelled listener drops the cached state; the next successful publication subscribes again.
    const cancelled = () => stopFailover?.()
    const stops = [
      io.watch(`directory/${uid}`, (value) => { directoryEntry = value as typeof directoryEntry; checkFailover() }, cancelled),
      io.watch(`connections/${uid}`, (value) => { ownConnections = (value ?? {}) as Record<string, unknown>; checkFailover() }, cancelled),
    ]
    stopFailover = () => { for (const stop of stops) stop(); stopFailover = null; directoryEntry = null; ownConnections = null }
  }

  async function publish() {
    if (!wanted || !io.online()) return
    const captured = wanted
    const token = generation
    if (!connectionId) connectionId = crypto.randomUUID()
    const id = connectionId
    const nextSignature = stablePitwallValue(captured)
    if (signature === nextSignature) return
    const removals: Record<string, unknown> = { [`connections/${uid}/${id}`]: null }
    if (captured.roomId) removals[`rooms/${captured.roomId}/presence/${uid}/${id}`] = null
    if (captured.roomId && io.namespace === PITWALL_SOCIAL_ROOT) {
      removals[`rooms/${captured.roomId}/occupancy/${uid}/${id}`] = { nickname: captured.nickname, connectedAt: io.serverTimestamp(), disconnectedAt: io.serverTimestamp() }
    }
    const cancel = await io.registerDisconnectUpdates(removals)
    disconnectCancellations.add(cancel)
    for (const path of Object.keys(removals)) ownedPaths.add(path.replace(/\/disconnectedAt$/, ''))
    if (token !== generation || !io.online()) return
    const changes: Record<string, unknown> = {
      [`connections/${uid}/${id}`]: { ...captured, uid, connectionId: id, protocolVersion: 3, updatedAt: io.serverTimestamp() },
    }
    if (currentRoom && currentRoom !== captured.roomId) changes[`rooms/${currentRoom}/presence/${uid}/${id}`] = null
    if (captured.roomId) changes[`rooms/${captured.roomId}/presence/${uid}/${id}`] = true
    if (captured.roomId && io.namespace === PITWALL_SOCIAL_ROOT) {
      changes[`rooms/${captured.roomId}/occupancy/${uid}/${id}`] = { nickname: captured.nickname, connectedAt: io.serverTimestamp(), disconnectedAt: null }
      const directory = await io.read<{ roomId: string, connectionId: string, slot: string }>(`directory/${uid}`)
      if (!directory || directory.roomId !== captured.roomId) throw new Error('Appartenenza alla stanza non più disponibile.')
      if (token !== generation || !io.online()) return
      changes[`directory/${uid}`] = { ...directory, connectionId: id }
    }
    await io.write('', changes)
    if (token !== generation) {
      // The SDK can acknowledge an old queued presence after reconnect. Retire that
      // connection's paths before publishing the new generation, even if onDisconnect already ran.
      if (io.online()) await io.write('', removals)
      return
    }
    // Re-registering updates the same server disconnect operation; never cancel the old handle here.
    currentRoom = captured.roomId
    recordUsage({ feature: `pitwall.${captured.kind}`, active: !!currentRoom })
    signature = nextSignature
    // Leaving the room also stops listening to the account's connections.
    if (currentRoom) watchFailover(); else stopFailover?.()
    for (const listener of connectionListeners) listener()
  }
  function enqueue() {
    const publication = busy.then(publish)
    // Keep the queue usable, but let the caller observe a refused publication.
    busy = publication.catch(error => { for (const listener of errors) listener(error) })
    return publication
  }
  const stopConnection = io.onConnection(online => {
    if (!online && wanted) recordUsage({ feature: `pitwall.${wanted.kind}`, active: false })
    emitPitwallDiagnostic('connection_changed', { uid, connectionId: connectionId || undefined, roomId: currentRoom ?? undefined, reason: online ? 'connected' : 'reconnecting' })
    generation++
    signature = ''
    connectionId = ''
    currentRoom = null
    for (const listener of connectionListeners) listener()
    if (online && wanted) void enqueue().catch(() => {})
  })
  return {
    uid, io,
    connectionId: () => connectionId,
    roomId: () => currentRoom,
    isReady: (roomId: string) => io.online() && !!connectionId && currentRoom === roomId
      && !!wanted && signature === stablePitwallValue(wanted),
    update(value: NonNullable<typeof wanted>) {
      if (wanted && wanted.kind !== value.kind) recordUsage({ feature: `pitwall.${wanted.kind}`, active: false })
      wanted = value; return enqueue()
    },
    onReady(callback: () => void) { connectionListeners.add(callback); return () => { connectionListeners.delete(callback) } },
    onError(callback: (error: unknown) => void) { errors.add(callback); return () => { errors.delete(callback) } },
    async stop() {
      if (wanted) recordUsage({ feature: `pitwall.${wanted.kind}`, active: false })
      wanted = null; generation++; stopConnection(); stopFailover?.()
      await busy
      connectionId = ''; signature = ''; currentRoom = null
      if (ownedPaths.size && io.online()) {
        const changes: Record<string, null> = Object.fromEntries([...ownedPaths].map(path => [path, null]))
        await io.write('', changes)
        for (const cancel of disconnectCancellations) await cancel()
      }
      ownedPaths.clear(); disconnectCancellations.clear()
      errors.clear(); connectionListeners.clear()
    },
  }
}
export type PitwallRealtimeSession = ReturnType<typeof createPitwallRealtimeSession>
