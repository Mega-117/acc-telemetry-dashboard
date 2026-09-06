import type { PitwallRealtimeTransport } from './pitwallRealtimeTransport'
import type { RealtimeConnection } from './pitwallRealtimeProtocol'
import { stablePitwallValue } from './pitwallChangePublisher'

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

  async function publish() {
    if (!wanted || !io.online()) return
    const captured = wanted
    const token = generation
    if (!connectionId) connectionId = crypto.randomUUID()
    const id = connectionId
    const nextSignature = stablePitwallValue(captured)
    if (signature === nextSignature) return
    const removals: Record<string, null> = { [`connections/${uid}/${id}`]: null }
    if (captured.roomId) removals[`rooms/${captured.roomId}/presence/${uid}/${id}`] = null
    const cancel = await io.registerDisconnectUpdates(removals)
    disconnectCancellations.add(cancel)
    for (const path of Object.keys(removals)) ownedPaths.add(path)
    if (token !== generation || !io.online()) return
    const changes: Record<string, unknown> = {
      [`connections/${uid}/${id}`]: { ...captured, uid, connectionId: id, protocolVersion: 3, updatedAt: io.serverTimestamp() },
    }
    if (currentRoom && currentRoom !== captured.roomId) changes[`rooms/${currentRoom}/presence/${uid}/${id}`] = null
    if (captured.roomId) changes[`rooms/${captured.roomId}/presence/${uid}/${id}`] = true
    await io.write('', changes)
    if (token !== generation) {
      // The SDK can acknowledge an old queued presence after reconnect. Retire that
      // connection's paths before publishing the new generation, even if onDisconnect already ran.
      if (io.online()) await io.write('', removals)
      return
    }
    // Re-registering updates the same server disconnect operation; never cancel the old handle here.
    currentRoom = captured.roomId
    signature = nextSignature
    for (const listener of connectionListeners) listener()
  }
  function enqueue() { busy = busy.then(publish).catch(error => { for (const listener of errors) listener(error) }); return busy }
  const stopConnection = io.onConnection(online => {
    generation++
    signature = ''
    connectionId = ''
    currentRoom = null
    for (const listener of connectionListeners) listener()
    if (online) void enqueue()
  })
  return {
    uid, io,
    connectionId: () => connectionId,
    roomId: () => currentRoom,
    update(value: NonNullable<typeof wanted>) { wanted = value; return enqueue() },
    onReady(callback: () => void) { connectionListeners.add(callback); return () => { connectionListeners.delete(callback) } },
    onError(callback: (error: unknown) => void) { errors.add(callback); return () => { errors.delete(callback) } },
    async stop() {
      wanted = null; generation++; stopConnection()
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
