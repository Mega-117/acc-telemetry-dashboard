import { getPitwallRealtime } from '~/config/pitwallRealtime'
import { createPitwallRealtimeSession } from './pitwallRealtimeSession'
import { createPitwallRealtimeOrders } from './pitwallRealtimeOrders'
import { createPitwallChangePublisher } from './pitwallChangePublisher'
import { roomFromRealtime, memberFromRealtime, type RealtimeConnection, type RealtimeMfd, type RealtimeRoomMeta, type RoomRole } from './pitwallRealtimeProtocol'
import type { PitwallRealtimeTransport } from './pitwallRealtimeTransport'
import { boundPitwallCrew, boundPitwallStrategy } from './pitwallLink'
import { PITWALL_MAX_ROOM_ALLOWED, PITWALL_VEHICLE_POINTER_TTL_MS, type PitwallRoom, type PitwallRoomMember, type PitwallVehiclePointer } from './pitwallRoomContract'
import type { PitwallRoomResult } from './pitwallRoomOrders'

const instances = new Map<string, ReturnType<typeof buildPitwallRealtimeRoomService>>()
export function createPitwallRealtimeRoomService(options: { uid: string, io?: PitwallRealtimeTransport }) {
  if (options.io) return buildPitwallRealtimeRoomService(options.uid, options.io)
  let instance = instances.get(options.uid)
  if (!instance) { instance = buildPitwallRealtimeRoomService(options.uid, getPitwallRealtime()); instances.set(options.uid, instance) }
  return instance
}
export async function stopPitwallRealtimeAccount(uid: string) {
  const instance = instances.get(uid)
  instances.delete(uid)
  await instance?.dispose()
}
const failure = (error: unknown): { ok: false, reason: string } => ({ ok: false, reason: error instanceof Error ? error.message : String(error) })
const success = (): PitwallRoomResult<true> => ({ ok: true, value: true })

function buildPitwallRealtimeRoomService(uid: string, io: PitwallRealtimeTransport) {
  const session = createPitwallRealtimeSession(io, uid)
  const members = new Map<string, RealtimeConnection[]>()
  const memberReaders = new Map<string, number>()
  const roomCache = new Map<string, PitwallRoom | null>()
  let localPresence: Parameters<typeof session.update>[0] | null = null
  let mfdWanted: { strategy: Record<string, unknown> | null, crew: unknown } | null = null
  let stopped = false
  let lastError: Error | null = null
  const mfdPublisher = createPitwallChangePublisher(async (snapshot: NonNullable<typeof mfdWanted>) => {
    const connectionId = session.connectionId()
    const roomId = session.roomId()
    if (!roomId || !connectionId || localPresence?.kind !== 'driver' || !localPresence.sourceValid) return
    await io.write(`rooms/${roomId}`, { mfd: { uid, connectionId, crew: snapshot.crew,
      strategy: snapshot.strategy ? { ...snapshot.strategy, updatedAt: new Date(io.serverNow()).toISOString() } : null,
      updatedAt: io.serverTimestamp() } })
  }, error => { lastError = new Error(failure(error).reason) })
  let lastConnectionId = ''
  const stopReady = session.onReady(() => {
    const id = `${session.connectionId()}/${session.roomId() ?? ''}`
    if (id !== lastConnectionId) { lastConnectionId = id; mfdPublisher.reset() }
    if (mfdWanted && session.roomId()) mfdPublisher.offer(mfdWanted)
  })
  const orders = createPitwallRealtimeOrders({ io, session, connections: roomId => members.get(roomId) ?? [] })

  function watchRoom(roomId: string, callback: (room: PitwallRoom | null) => void, error?: (error: Error) => void) {
    let meta: RealtimeRoomMeta | null = null
    let access: Record<string, RoomRole> = {}
    let metaReady = false; let accessReady = false
    const emit = () => { if (metaReady && accessReady) { const room = roomFromRealtime(meta, access); roomCache.set(roomId, room); callback(room) } }
    const failed = (cause: Error) => { roomCache.delete(roomId); callback(null); error?.(cause) }
    const stops = [
      io.watch(`rooms/${roomId}/meta`, value => { meta = value as RealtimeRoomMeta | null; metaReady = true; emit() }, failed),
      io.watch(`rooms/${roomId}/access`, value => { access = (value ?? {}) as Record<string, RoomRole>; accessReady = true; emit() }, failed),
    ]
    return () => { for (const stop of stops) stop() }
  }

  async function readRoom(roomId: string): Promise<PitwallRoom | null> {
    const [meta, access] = await Promise.all([
      io.read<RealtimeRoomMeta>(`rooms/${roomId}/meta`), io.read<Record<string, RoomRole>>(`rooms/${roomId}/access`),
    ])
    return roomFromRealtime(meta, access ?? {})
  }

  function watchRooms(callback: (rooms: PitwallRoom[]) => void, error?: (error: Error) => void) {
    const stops = new Map<string, () => void>()
    const values = new Map<string, PitwallRoom>()
    const emit = () => callback([...values.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt)))
    const stopIndex = io.watch(`roomIndex/${uid}`, value => {
      const ids = new Set(Object.keys((value ?? {}) as Record<string, true>))
      for (const [id, stop] of stops) if (!ids.has(id)) { stop(); stops.delete(id); values.delete(id); roomCache.delete(id) }
      for (const id of ids) if (!stops.has(id)) {
        stops.set(id, () => {})
        stops.set(id, watchRoom(id, room => { if (room) values.set(id, room); else values.delete(id); emit() }, error))
      }
      emit()
    }, cause => { values.clear(); emit(); error?.(cause) })
    return () => { stopIndex(); for (const stop of stops.values()) stop(); values.clear() }
  }

  function watchMembers(roomId: string, callback: (list: PitwallRoomMember[]) => void, error?: (error: Error) => void) {
    memberReaders.set(roomId, (memberReaders.get(roomId) ?? 0) + 1)
    const connections = new Map<string, RealtimeConnection>()
    const stops = new Map<string, () => void>()
    const ready = new Set<string>()
    let indexReady = false
    let mfd: RealtimeMfd | null = null
    const emit = () => {
      if (!io.online()) { members.set(roomId, []); callback([]); return }
      if (!indexReady || [...stops.keys()].some(id => !ready.has(id))) return
      const list = [...connections.values()]; members.set(roomId, list); callback(list.map(value => memberFromRealtime(value, mfd)))
    }
    const stopMfd = io.watch(`rooms/${roomId}/mfd`, value => { mfd = value as RealtimeMfd | null; emit() }, cause => { mfd = null; emit(); error?.(cause) })
    const stopIndex = io.watch(`rooms/${roomId}/presence`, value => {
      indexReady = false
      const ids = new Set<string>()
      for (const [memberUid, entries] of Object.entries((value ?? {}) as Record<string, Record<string, true>>)) {
        for (const id of Object.keys(entries)) ids.add(`${memberUid}/${id}`)
      }
      for (const [id, stop] of stops) if (!ids.has(id)) { stop(); stops.delete(id); connections.delete(id); ready.delete(id) }
      for (const id of ids) if (!stops.has(id)) {
        stops.set(id, () => {})
        stops.set(id, io.watch(`connections/${id}`, value => {
          const connection = value as RealtimeConnection | null
          ready.add(id)
          if (connection?.roomId === roomId && connection.protocolVersion === 3) connections.set(id, connection)
          else connections.delete(id)
          emit()
        }, cause => { ready.add(id); connections.delete(id); emit(); error?.(cause) }))
      }
      indexReady = true
      emit()
    }, cause => { connections.clear(); members.set(roomId, []); callback([]); error?.(cause) })
    const stopOnline = io.onConnection(() => emit())
    return () => {
      stopIndex(); stopMfd(); stopOnline(); for (const stop of stops.values()) stop()
      const remaining = (memberReaders.get(roomId) ?? 1) - 1
      if (remaining > 0) memberReaders.set(roomId, remaining)
      else { members.delete(roomId); memberReaders.delete(roomId) }
    }
  }

  async function publishPresence(roomId: string | null, input: { nickname: string, kind: 'driver' | 'engineer', driving: boolean, runtimeSessionId: string, crew?: unknown, strategy?: unknown, car?: string | null, track?: string | null }): Promise<PitwallRoomResult<true>> {
    try {
      if (stopped) throw new Error('Sessione Pitwall terminata.')
      // The desktop room UI shares its runtime's connection; it must not overwrite the driver role.
      if (input.kind === 'engineer' && localPresence?.kind === 'driver') return success()
      localPresence = { roomId, nickname: input.nickname.slice(0, 60), kind: input.kind, driving: input.driving,
        sourceValid: input.kind === 'driver' && input.strategy != null, runtimeSessionId: input.runtimeSessionId,
        car: input.car ?? null, track: input.track ?? null }
      if (input.kind === 'driver') {
        const bounded = boundPitwallStrategy(input.strategy, '')
        if (bounded) { const { updatedAt, ...strategy } = bounded; void updatedAt; mfdWanted = { strategy, crew: boundPitwallCrew(input.crew) } }
        else mfdWanted = { strategy: null, crew: boundPitwallCrew(input.crew) }
      }
      await session.update(localPresence)
      if (mfdWanted && input.kind === 'driver') mfdPublisher.offer(mfdWanted)
      return success()
    } catch (error) { return failure(error) }
  }

  async function clearPresence(roomId: string) {
    if (localPresence?.roomId !== roomId) return
    localPresence = { ...localPresence, roomId: null, driving: false, sourceValid: false }
    mfdPublisher.reset(); mfdWanted = null
    await session.update(localPresence)
  }
  async function deactivateDriver() {
    if (localPresence?.kind !== 'driver') return
    localPresence = { ...localPresence, kind: 'engineer', roomId: null, driving: false, sourceValid: false }
    mfdPublisher.reset(); mfdWanted = null
    await session.update(localPresence)
  }

  async function joinRoom(roomId: string): Promise<PitwallRoomResult<PitwallRoom>> {
    try {
      // RTDB can invoke the first transaction callback with an empty local cache.
      // Propose the member role and let the server compare/retry and enforce the invitation.
      const result = await io.transact<RoomRole>(`rooms/${roomId}/access/${uid}`, current => current == null || current === 'invited' ? 'member' : undefined)
      const room = await readRoom(roomId)
      if (!room || (!result.committed && !room.memberUids.includes(uid))) throw new Error('Ingresso non autorizzato.')
      return { ok: true, value: room }
    } catch (error) { return failure(error) }
  }

  async function ensureRoomForVehicle(input: { fingerprint: string, label: string, track?: string | null, raceNumber?: number | null, teamName?: string | null, seedAllowedUids?: string[] }): Promise<PitwallRoomResult<PitwallRoom>> {
    try {
      const pointer = await io.read<PitwallVehiclePointer>(`vehicles/${input.fingerprint}`)
      if (pointer && pointer.expiresAtMs > io.serverNow()) {
        const room = await readRoom(pointer.roomId)
        if (room) return room.memberUids.includes(uid) ? { ok: true, value: room } : joinRoom(room.roomId)
      }
      const bytes = crypto.getRandomValues(new Uint8Array(10))
      const roomId = [...bytes].map(value => value.toString(16).padStart(2, '0')).join('')
      const now = io.serverNow()
      const meta: RealtimeRoomMeta = { roomId, hostUid: uid, label: input.label.slice(0, 120), vehicleFingerprint: input.fingerprint,
        createdAt: new Date(now).toISOString(), updatedAt: new Date(now).toISOString(),
        track: input.track ?? null, raceNumber: input.raceNumber ?? null, teamName: input.teamName ?? null }
      const access: Record<string, RoomRole> = { [uid]: 'manager' }
      for (const id of [...new Set(input.seedAllowedUids ?? [])].filter(id => id !== uid).slice(0, PITWALL_MAX_ROOM_ALLOWED)) access[id] = 'invited'
      const changes: Record<string, unknown> = { [`rooms/${roomId}/meta`]: meta, [`rooms/${roomId}/access`]: access }
      for (const id of Object.keys(access)) changes[`roomIndex/${id}/${roomId}`] = true
      await io.write('', changes)
      // A conditional pointer prevents a simultaneous opener overwriting a live crew's discovery.
      const selected = await io.transact<PitwallVehiclePointer>(`vehicles/${input.fingerprint}`, current => {
        if (current && current.expiresAtMs > io.serverNow()) return undefined
        return { schemaVersion: 2, fingerprint: input.fingerprint, roomId, createdBy: uid, createdAt: meta.createdAt, expiresAtMs: now + PITWALL_VEHICLE_POINTER_TTL_MS }
      })
      if (!selected.committed) {
        await closeRoom(roomId)
        if (!selected.value) throw new Error('La gara e cambiata durante l’apertura. Riprova.')
        return joinRoom(selected.value.roomId)
      }
      return { ok: true, value: roomFromRealtime(meta, access)! }
    } catch (error) { return failure(error) }
  }

  async function syncInvites(roomId: string, trustedUids: string[]): Promise<PitwallRoomResult<number>> {
    try {
      const room = await readRoom(roomId)
      if (!room || !room.managerUids.includes(uid)) return { ok: true, value: 0 }
      const known = new Set([...room.memberUids, ...room.allowedUids])
      const additions = [...new Set(trustedUids)].filter(id => id && !known.has(id)).slice(0, PITWALL_MAX_ROOM_ALLOWED - room.allowedUids.length)
      if (!additions.length) return { ok: true, value: 0 }
      const changes: Record<string, unknown> = {}
      for (const id of additions) { changes[`rooms/${roomId}/access/${id}`] = 'invited'; changes[`roomIndex/${id}/${roomId}`] = true }
      await io.write('', changes)
      return { ok: true, value: additions.length }
    } catch (error) { return failure(error) }
  }
  async function invite(roomId: string, inviteeUid: string): Promise<PitwallRoomResult<true>> {
    const result = await syncInvites(roomId, [inviteeUid]); return result.ok ? success() : result
  }
  async function revoke(roomId: string, memberUid: string): Promise<PitwallRoomResult<true>> {
    try {
      await io.write('', { [`rooms/${roomId}/access/${memberUid}`]: null, [`rooms/${roomId}/presence/${memberUid}`]: null, [`roomIndex/${memberUid}/${roomId}`]: null })
      return success()
    } catch (error) { return failure(error) }
  }
  async function promote(roomId: string, memberUid: string): Promise<PitwallRoomResult<true>> {
    try { await io.write(`rooms/${roomId}/access`, { [memberUid]: 'manager' }); return success() }
    catch (error) { return failure(error) }
  }
  async function leaveRoom(roomId: string): Promise<PitwallRoomResult<true>> {
    try { await clearPresence(roomId); return revoke(roomId, uid) }
    catch (error) { return failure(error) }
  }
  async function closeRoom(roomId: string): Promise<PitwallRoomResult<true>> {
    try {
      const room = await readRoom(roomId)
      if (!room) return success()
      const changes: Record<string, null> = { [`rooms/${roomId}`]: null }
      for (const id of [...room.memberUids, ...room.allowedUids]) changes[`roomIndex/${id}/${roomId}`] = null
      await io.write('', changes)
      await io.transact<PitwallVehiclePointer>(`vehicles/${room.vehicleFingerprint}`, value => !value || value.roomId === roomId ? null : undefined)
      await clearPresence(roomId)
      roomCache.delete(roomId)
      return success()
    } catch (error) { return failure(error) }
  }
  async function listRooms(): Promise<PitwallRoom[]> {
    const index = await io.read<Record<string, true>>(`roomIndex/${uid}`)
    return (await Promise.all(Object.keys(index ?? {}).map(readRoom))).filter((room): room is PitwallRoom => room != null)
  }
  async function closeDormantRooms(rooms: PitwallRoom[], selectedRoomId: string | null, attempted: Set<string>) {
    for (const room of rooms) {
      if (room.roomId === selectedRoomId || attempted.has(room.roomId) || !room.managerUids.includes(uid)
        || io.serverNow() - Date.parse(room.createdAt) < PITWALL_VEHICLE_POINTER_TTL_MS) continue
      attempted.add(room.roomId)
      try {
        // Compare-and-delete includes presence: a simultaneous join aborts cleanup.
        // This rare expiry transaction reads the whole expired room, never the live listeners.
        const removed = await io.transact<{ presence?: Record<string, unknown>, meta?: RealtimeRoomMeta }>(`rooms/${room.roomId}`, value => {
          if (value === null) return null // Let the server provide its current value on conflict.
          if (Object.keys(value.presence ?? {}).length || !value.meta
            || io.serverNow() - Date.parse(value.meta.createdAt) < PITWALL_VEHICLE_POINTER_TTL_MS) return undefined
          return null
        })
        if (!removed.committed) continue
        const changes: Record<string, null> = {}
        for (const id of [...room.memberUids, ...room.allowedUids]) changes[`roomIndex/${id}/${room.roomId}`] = null
        await io.write('', changes)
        await io.transact<PitwallVehiclePointer>(`vehicles/${room.vehicleFingerprint}`, value => value?.roomId === room.roomId ? null : undefined)
      } catch { /* A concurrent join or loss of access leaves cleanup to the next session. */ }
    }
  }
  async function dispose() { stopped = true; mfdPublisher.stop(); stopReady(); await session.stop(); members.clear(); roomCache.clear() }
  return { uid, io, session, ...orders, readRoom, watchRoom, watchRooms, watchMembers, publishPresence, clearPresence, deactivateDriver,
    ensureRoomForVehicle, joinRoom, leaveRoom, closeRoom, closeDormantRooms, listRooms, invite, syncInvites, revoke, promote, dispose,
    serverNow: io.serverNow, toLocalMs: (serverMs: number) => serverMs - io.clockOffsetMs(), clockOffsetMs: io.clockOffsetMs,
    clockOutOfSync: () => Math.abs(io.clockOffsetMs()) > 30_000, lastError: () => lastError }
}
export type PitwallRealtimeRoomService = ReturnType<typeof createPitwallRealtimeRoomService>
