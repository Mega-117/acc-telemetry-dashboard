import type { PitwallRealtimeTransport } from './pitwallRealtimeTransport'
import { emitPitwallDiagnostic } from './pitwallDiagnostics'
import type { PitwallRoom } from './pitwallRoomContract'
import { roomFromRealtime, type RealtimeRoomMeta, type RoomRole } from './pitwallRealtimeProtocol'
import { nextSocialExpiry, socialMemberUids, socialMemberNicknames, socialReconnectingUids, type SocialOccupancy } from './pitwallSocialRoom'

export interface SocialDirectoryEntry { roomId: string, connectionId: string, slot?: string }
interface SocialSlot { uid: string, reservedAt: number }
export interface SocialRoomState {
  meta: RealtimeRoomMeta & { closedAt?: string | null }
  access: Record<string, RoomRole>
  occupancy: SocialOccupancy
}

/** Membership and discovery; ACC data and strategy execution belong elsewhere. */
export function createPitwallSocialLifecycle(options: {
  uid: string
  io: PitwallRealtimeTransport
  connectionId: () => string
  ensureConnection: () => Promise<void>
  watchFriends: (callback: (uids: string[]) => void, error?: (error: Error) => void) => () => void
}) {
  const { uid, io } = options
  const witnesses = new Map<string, SocialDirectoryEntry & { sponsorUid: string }>()
  let opening: ReturnType<typeof openRoom> | null = null
  const fail = (error: unknown) => ({ ok: false as const, reason: error instanceof Error ? error.message : String(error) })
  const diagnostic = (event: string, roomId: string) => emitPitwallDiagnostic(event, { roomId, uid, connectionId: options.connectionId() })

  function present(meta: SocialRoomState['meta'] | null, access: Record<string, RoomRole>, occupancy: SocialOccupancy): PitwallRoom | null {
    if (!meta || meta.closedAt) return null
    const alive = new Set(socialMemberUids(occupancy, io.serverNow()))
    if (!alive.size) return null
    const roles = Object.fromEntries(Object.entries(access).filter(([id]) => alive.has(id)))
    // The entry witness is only a preview. Actual membership is granted by joinRoom.
    if (!roles[uid] && witnesses.has(meta.roomId)) roles[uid] = 'invited'
    return { ...roomFromRealtime(meta, roles)!, membershipModel: 'social', reconnectingUids: socialReconnectingUids(occupancy, io.serverNow()), memberNicknames: socialMemberNicknames(occupancy, io.serverNow()) }
  }

  function watchRoom(roomId: string, callback: (room: PitwallRoom | null) => void, error?: (error: Error) => void) {
    let meta: SocialRoomState['meta'] | null = null
    let access: Record<string, RoomRole> = {}
    let occupancy: SocialOccupancy = {}
    const ready = new Set<string>()
    let timer: ReturnType<typeof setTimeout> | null = null
    let stopped = false
    const emit = () => {
      if (stopped || ready.size !== 3) return
      if (timer) clearTimeout(timer)
      callback(present(meta, access, occupancy))
      const next = nextSocialExpiry(occupancy, io.serverNow())
      if (next != null) timer = setTimeout(emit, Math.max(1, next - io.serverNow()))
    }
    const denied = (cause: Error) => { if (!stopped) { callback(null); error?.(cause) } }
    const stops = [
      io.watch(`rooms/${roomId}/meta`, value => { meta = value as typeof meta; ready.add('meta'); emit() }, denied),
      io.watch(`rooms/${roomId}/access`, value => { access = (value ?? {}) as typeof access; ready.add('access'); emit() }, denied),
      io.watch(`rooms/${roomId}/occupancy`, value => { occupancy = (value ?? {}) as typeof occupancy; ready.add('occupancy'); emit() }, denied),
    ]
    return () => { stopped = true; if (timer) clearTimeout(timer); stops.forEach(stop => stop()) }
  }

  async function readRoom(roomId: string): Promise<PitwallRoom | null> {
    const [meta, access, occupancy] = await Promise.all([
      io.read<SocialRoomState['meta']>(`rooms/${roomId}/meta`),
      io.read<SocialRoomState['access']>(`rooms/${roomId}/access`),
      io.read<SocialOccupancy>(`rooms/${roomId}/occupancy`),
    ])
    return present(meta, access ?? {}, occupancy ?? {})
  }

  function watchRooms(callback: (rooms: PitwallRoom[]) => void, error?: (error: Error) => void) {
    const directories = new Map<string, SocialDirectoryEntry>()
    const directoryStops = new Map<string, () => void>()
    const roomStops = new Map<string, () => void>()
    const roomSources = new Map<string, string>()
    const rooms = new Map<string, PitwallRoom>()
    let stopped = false
    let version = 0
    const emit = () => { if (!stopped) callback([...rooms.values()]) }
    const sync = async () => {
      const generation = ++version
      const desired = new Map<string, Array<{ sponsorUid: string, entry: SocialDirectoryEntry }>>()
      for (const [sponsorUid, entry] of directories) {
        const sources = desired.get(entry.roomId) ?? []
        sources.push({ sponsorUid, entry })
        desired.set(entry.roomId, sources)
      }
      for (const [id, stop] of roomStops) if (!desired.has(id)) { stop(); roomStops.delete(id); rooms.delete(id); witnesses.delete(id) }
      for (const [roomId, sources] of desired) {
        const source = sources.map(({ sponsorUid, entry }) => `${sponsorUid}/${entry.connectionId}`).sort().join('|')
        if (roomStops.has(roomId) && roomSources.get(roomId) === source) continue
        roomStops.get(roomId)?.()
        roomStops.delete(roomId)
        try {
          // A logout leaves our directory behind. It must not mask a present
          // friend who can authorize the same room on the next login.
          let admitted = false
          for (const { sponsorUid, entry } of sources) {
            if (sponsorUid === uid) continue
            try {
              const witness = { ...entry, sponsorUid }
              await io.write(`admissions/${roomId}`, { [uid]: witness })
              if (stopped || generation !== version) return
              witnesses.set(roomId, witness)
              admitted = true
              break
            } catch (cause) {
              if (!/permission.?denied/i.test(String(cause))) throw cause
            }
          }
          if (!admitted && !sources.some(value => value.sponsorUid === uid)) { rooms.delete(roomId); continue }
          if (stopped || generation !== version) return
          let failed = false
          let stop = () => {}
          const handle = () => stop()
          roomStops.set(roomId, handle)
          roomSources.set(roomId, source)
          stop = watchRoom(roomId, room => {
            if (roomStops.get(roomId) !== handle) return
            if (room) rooms.set(roomId, room); else rooms.delete(roomId)
            emit()
          }, cause => {
            if (roomStops.get(roomId) !== handle) return
            failed = true; roomStops.delete(roomId); rooms.delete(roomId); stop(); emit(); error?.(cause)
          })
          if (failed) stop()
        } catch (cause) {
          rooms.delete(roomId)
          emitPitwallDiagnostic('room_access_denied', { roomId, uid, reason: String(cause) })
          error?.(cause instanceof Error ? cause : new Error(String(cause)))
        }
      }
      emit()
    }
    const stopFriends = options.watchFriends(friends => {
      const wanted = new Set([uid, ...friends])
      for (const [id, stop] of directoryStops) if (!wanted.has(id)) { stop(); directoryStops.delete(id); directories.delete(id) }
      for (const id of wanted) if (!directoryStops.has(id)) {
        let failed = false
        let stop = () => {}
        const handle = () => stop()
        directoryStops.set(id, handle)
        stop = io.watch(`directory/${id}`, value => {
          if (directoryStops.get(id) !== handle) return
          if (value) directories.set(id, value as SocialDirectoryEntry); else directories.delete(id)
          void sync()
        }, cause => {
          if (directoryStops.get(id) !== handle) return
          failed = true; directoryStops.delete(id); directories.delete(id); stop(); void sync(); error?.(cause)
        })
        if (failed) stop()
      }
      void sync()
    }, error)
    return () => { stopped = true; version++; stopFriends(); directoryStops.forEach(stop => stop()); roomStops.forEach(stop => stop()); witnesses.clear() }
  }

  async function joinRoom(roomId: string) {
    let reservedSlot: string | null = null
    let joined = false
    try {
      await options.ensureConnection()
      const current = await io.read<SocialDirectoryEntry>(`directory/${uid}`)
      if (current && current.roomId !== roomId) {
        const previous = await readRoom(current.roomId).catch(cause => {
          // An expired membership loses read permission. A network failure is
          // not proof of expiry and must never evict a still-present account.
          if (/permission.?denied/i.test(String(cause))) return null
          throw cause
        })
        if (previous?.memberUids.includes(uid)) throw new Error('Esci dalla stanza corrente prima di entrare in un’altra.')
        const cleaned = await leaveRoom(current.roomId)
        if (!cleaned.ok) return cleaned
      }
      const connectionId = options.connectionId()
      if (!connectionId) throw new Error('Connessione non ancora pronta.')
      const slots = await io.read<Record<string, SocialSlot>>(`rooms/${roomId}/slots`) ?? {}
      let slot = Object.keys(slots).find(key => slots[key]?.uid === uid) ?? null
      if (!slot) for (let index = 0; index < 16; index++) {
        const key = String(index)
        if (slots[key] && slots[key].reservedAt + 30_000 > io.serverNow()) continue
        try {
          // The server also checks the owner's live membership before replacing
          // an expired reservation: client clocks cannot evict a participant.
          const result = await io.transact<SocialSlot>(`rooms/${roomId}/slots/${key}`, value =>
            value == null || value.uid === uid || value.reservedAt + 30_000 <= io.serverNow()
              ? { uid, reservedAt: io.serverTimestamp() as unknown as number } : undefined)
          if (result.committed) { slot = key; reservedSlot = key; break }
        } catch { /* A still-present participant owns this slot. Try the next. */ }
      }
      if (slot == null) throw new Error('La stanza ha già 16 partecipanti.')
      const occupancy = { nickname: uid, connectedAt: io.serverTimestamp(), disconnectedAt: null }
      await io.registerDisconnectUpdates({ [`rooms/${roomId}/occupancy/${uid}/${connectionId}`]: null })
      await io.write('', {
        [`rooms/${roomId}/access/${uid}`]: 'member',
        [`rooms/${roomId}/occupancy/${uid}/${connectionId}`]: occupancy,
        [`directory/${uid}`]: { roomId, connectionId, slot },
      })
      joined = true
      const room = await readRoom(roomId)
      if (!room) throw new Error('La stanza non è più disponibile.')
      diagnostic('room_joined', roomId)
      return { ok: true as const, value: room }
    } catch (error) { return fail(error) }
    finally {
      if (reservedSlot != null && !joined) await io.transact<SocialSlot>(`rooms/${roomId}/slots/${reservedSlot}`, value => value?.uid === uid ? null : undefined).catch(() => {})
    }
  }

  function createRoom(input: { label: string }) {
    // All entry points share this lifecycle: a double click is one intent.
    if (!opening) opening = openRoom(input).finally(() => { opening = null })
    return opening
  }

  async function openRoom(input: { label: string }) {
    try {
      await options.ensureConnection()
      const existing = await io.read<SocialDirectoryEntry>(`directory/${uid}`)
      if (existing) {
        // An expired member can lose read permission before its own stale
        // directory is cleaned. Leaving only removes this account's records.
        let room = await readRoom(existing.roomId).catch(cause => {
          if (/permission.?denied/i.test(String(cause))) return null
          throw cause
        })
        // Opening immediately after login can precede the discovery listeners.
        // Resolve the previous party through friends before declaring it gone.
        if (!room) {
          const friends = await new Promise<string[]>((resolve, reject) => {
            let settled = false
            let stop = () => {}
            stop = options.watchFriends(value => { if (!settled) { settled = true; resolve(value); stop() } }, cause => { settled = true; reject(cause); stop() })
            if (settled) stop()
          })
          for (const sponsorUid of friends) {
            const entry = await io.read<SocialDirectoryEntry>(`directory/${sponsorUid}`)
            if (entry?.roomId !== existing.roomId) continue
            try {
              const witness = { ...entry, sponsorUid }
              await io.write(`admissions/${existing.roomId}`, { [uid]: witness })
              witnesses.set(existing.roomId, witness)
              room = await readRoom(existing.roomId)
              if (room) break
            } catch (cause) {
              if (!/permission.?denied/i.test(String(cause))) throw cause
            }
          }
        }
        if (room?.memberUids.includes(uid)) return { ok: true as const, value: room }
        // An explicit open after logout resumes the still-live previous party,
        // once discovery has obtained access through a present friend.
        if (room) return joinRoom(existing.roomId)
        const left = await leaveRoom(existing.roomId)
        if (!left.ok) return left
      }
      const connectionId = options.connectionId()
      if (!connectionId) throw new Error('Connessione non ancora pronta.')
      const roomId = crypto.randomUUID()
      const now = new Date(io.serverNow()).toISOString()
      const meta = { roomId, hostUid: uid, label: input.label.slice(0, 120), vehicleFingerprint: '', createdAt: now, updatedAt: now }
      await io.registerDisconnectUpdates({ [`rooms/${roomId}/occupancy/${uid}/${connectionId}`]: null })
      await io.write('', {
        [`rooms/${roomId}/meta`]: meta,
        [`rooms/${roomId}/access/${uid}`]: 'member',
        [`rooms/${roomId}/slots/0`]: { uid, reservedAt: io.serverTimestamp() },
        [`rooms/${roomId}/occupancy/${uid}/${connectionId}`]: { nickname: input.label.slice(0, 60), connectedAt: io.serverTimestamp(), disconnectedAt: null },
        [`directory/${uid}`]: { roomId, connectionId, slot: '0' },
      })
      diagnostic('room_created', roomId)
      return { ok: true as const, value: { ...roomFromRealtime(meta, { [uid]: 'member' })!, membershipModel: 'social' as const } }
    } catch (error) { return fail(error) }
  }

  async function leaveRoom(roomId: string) {
    try {
      const directory = await io.read<SocialDirectoryEntry>(`directory/${uid}`)
      const changes: Record<string, unknown> = { [`rooms/${roomId}/access/${uid}`]: null, [`rooms/${roomId}/occupancy/${uid}`]: null }
      if (directory?.roomId === roomId) {
        changes[`directory/${uid}`] = null
        if (directory.slot != null) changes[`rooms/${roomId}/slots/${directory.slot}`] = null
      }
      await io.write('', changes)
      diagnostic('room_left', roomId)
      // Empty occupancy is closed logically. No stale directory/witness can
      // authorize another join; physical retention preserves historical outcomes.
      return { ok: true as const, value: true as const }
    } catch (error) { return fail(error) }
  }

  return { readRoom, watchRoom, watchRooms, joinRoom, createRoom, leaveRoom }
}
