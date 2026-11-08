import type { PitwallRealtimeTransport } from './pitwallRealtimeTransport'
import { emitPitwallDiagnostic } from './pitwallDiagnostics'
import { createPitwallSocialDiscovery } from './pitwallSocialDiscovery'
import type { PitwallRoom } from './pitwallRoomContract'
import { roomFromRealtime, type RealtimeRoomMeta, type RoomRole } from './pitwallRealtimeProtocol'
import { nextSocialExpiry, socialMemberUids, socialMemberNicknames, socialReconnectingUids, type SocialOccupancy } from './pitwallSocialRoom'
import { PITWALL_FAILOVER_CONFIRM_MS } from './pitwallRealtimeSession'
import { PitwallRoomError, isDenied, isNetwork, roomErrorKey, roomFailure, type JoinResult, type RoomFailure } from './pitwallRoomErrors'

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
  /** PIP-750 F4: the session takes ownership (disconnect grace, clean stop) of a committed membership. */
  adoptMembership?: (roomId: string, connectionId: string, nickname: string) => Promise<void>
}) {
  const { uid, io } = options
  const witnesses = new Map<string, SocialDirectoryEntry & { sponsorUid: string }>()
  const leaving = new Set<string>()
  const discoveryChanges = new Set<(roomId: string, pending: boolean) => void>()
  let opening: Promise<JoinResult> | null = null
  let queue: Promise<unknown> = Promise.resolve()
  let disposed = false
  const failure = (operation: 'join' | 'open' | 'leave' | 'cleanup', roomId: string | undefined, error: unknown) =>
    roomFailure(operation, { roomId, uid, connectionId: options.connectionId() }, error)
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

  const watchRooms = createPitwallSocialDiscovery({
    uid, io, witnesses, leaving, discoveryChanges, watchRoom, diagnostic, watchFriends: options.watchFriends,
  })

  /**
   * PIP-750: one account's entries and exits on this device run one at a time and
   * stop at dispose. Devices of the same account are fenced by the Rules instead
   * (a seat the directory names cannot be released; access follows the directory).
   */
  function serialize<T>(work: () => Promise<T>): Promise<T> {
    const run = queue.then(() => {
      if (disposed) throw new PitwallRoomError('session-ended')
      return work()
    })
    queue = run.catch(() => {})
    return run
  }
  const assertOpen = () => { if (disposed) throw new PitwallRoomError('session-ended') }
  /**
   * F4 after a commit. A failed grace registration (connection lost) leaves the
   * pre-commit removal in place: the membership ends at disconnect instead of
   * after 30 s, which is safe; the entry itself stays committed.
   */
  async function adopt(roomId: string, connectionId: string, nickname: string) {
    try { await options.adoptMembership?.(roomId, connectionId, nickname) }
    catch (cause) { emitPitwallDiagnostic('room_adopt_failed', { roomId, uid, connectionId, reason: String(cause) }) }
  }
  // RTDB runs a transaction first on the local cache, often empty: an empty
  // proposal makes the server answer with the real seat, then ownership decides.
  const releaseOwn = (value: SocialSlot | null) => value == null || value.uid === uid ? null : undefined

  /** F9: the membership is committed; the first view of the room may arrive a moment later. */
  async function readCommitted(roomId: string): Promise<PitwallRoom | null> {
    for (const delay of [0, 250, 1000]) {
      if (delay) await new Promise(resolve => setTimeout(resolve, delay))
      if (disposed) return null
      const room = await readRoom(roomId).catch((cause) => {
        if (isDenied(cause) || isNetwork(cause)) return null
        throw cause
      })
      if (room?.memberUids.includes(uid)) return room
    }
    return null
  }

  /** Live connections of this account, other than this device, that announce a room. */
  async function otherDeviceIn(roomId: string) {
    const connections = await io.read<Record<string, { roomId?: string | null } | null>>(`connections/${uid}`) ?? {}
    const own = options.connectionId()
    return Object.entries(connections).some(([id, value]) => id !== own && value?.roomId === roomId)
  }

  /**
   * The directory names a room other than the target. A room this account still
   * belongs to blocks the entry; a denied read is not proof of expiry when another
   * device of the account announces that room (F2). Only then the stale records go.
   * With `resume`, a previous party still reachable through a friend is returned.
   */
  async function releaseStale(previous: SocialDirectoryEntry, resume: boolean): Promise<PitwallRoom | null> {
    let room = await readRoom(previous.roomId).catch((cause) => {
      if (isDenied(cause)) return null
      throw cause
    })
    // Opening immediately after login can precede the discovery listeners.
    // Resolve the previous party through friends before declaring it gone.
    if (!room && resume) room = await admitThroughFriends(previous.roomId)
    if (room && resume) return room
    if (room?.memberUids.includes(uid)) {
      throw new PitwallRoomError(await otherDeviceIn(previous.roomId) ? 'another-device' : 'in-another-room')
    }
    if (await otherDeviceIn(previous.roomId)) throw new PitwallRoomError('another-device')
    const left = await leaveNow(previous.roomId, 'cleanup')
    if (!left.ok) throw new PitwallRoomError(left.code)
    return null
  }

  async function admitThroughFriends(roomId: string): Promise<PitwallRoom | null> {
    const friends = await new Promise<string[]>((resolve, reject) => {
      let settled = false
      let stop = () => {}
      stop = options.watchFriends((value) => { if (!settled) { settled = true; resolve(value); stop() } }, (cause) => { settled = true; reject(cause); stop() })
      if (settled) stop()
    })
    for (const sponsorUid of friends) {
      const entry = await io.read<SocialDirectoryEntry>(`directory/${sponsorUid}`).catch((cause) => {
        if (isDenied(cause)) return null
        throw cause
      })
      if (entry?.roomId !== roomId) continue
      try {
        const witness = { ...entry, sponsorUid }
        await io.write(`admissions/${roomId}`, { [uid]: witness })
        witnesses.set(roomId, witness)
        const room = await readRoom(roomId)
        if (room) return room
      }
      catch (cause) {
        if (!isDenied(cause)) throw cause
      }
    }
    return null
  }

  async function joinNow(roomId: string): Promise<JoinResult> {
    let reservedSlot: string | null = null
    let joined = false
    try {
      await options.ensureConnection()
      assertOpen()
      const current = await io.read<SocialDirectoryEntry>(`directory/${uid}`)
      if (current && current.roomId !== roomId) await releaseStale(current, false)
      const connectionId = options.connectionId()
      if (!connectionId) throw new PitwallRoomError('not-ready')
      const preview = async <T>(path: string) => io.read<T>(path).catch((cause) => {
        if (isDenied(cause)) throw new PitwallRoomError('not-allowed', cause)
        throw cause
      })
      const slots = await preview<Record<string, SocialSlot>>(`rooms/${roomId}/slots`) ?? {}
      const occupancyNow = await preview<SocialOccupancy>(`rooms/${roomId}/occupancy`) ?? {}
      const presentUids = new Set(socialMemberUids(occupancyNow, io.serverNow()))
      const own = Object.keys(slots).filter(key => slots[key]?.uid === uid)
      let slot: string | null = null
      let attempts = 0
      let denials = 0
      const claim = async (key: string, accept: (value: SocialSlot | null) => boolean, counted = true) => {
        if (counted) attempts++
        try {
          // The server also checks the owner's live membership before replacing
          // an expired reservation: client clocks cannot evict a participant.
          const result = await io.transact<SocialSlot>(`rooms/${roomId}/slots/${key}`, value =>
            accept(value) ? { uid, reservedAt: io.serverTimestamp() as unknown as number } : undefined)
          return result.committed
        }
        catch (cause) {
          // A concurrent join can win after the snapshot. Do not hide network
          // failures behind a misleading room-capacity error.
          if (!isDenied(cause)) throw cause
          if (counted) denials++
          return false
        }
      }
      // F6: one reservation per account. The seat the directory names, or else an
      // own leftover, is renewed in place; a fresh one is taken only if both are gone.
      const preferred = current?.roomId === roomId && current.slot != null && own.includes(current.slot) ? current.slot : own[0]
      if (preferred != null && await claim(preferred, value => value == null || value.uid === uid)) slot = preferred
      const take = (value: SocialSlot | null) => value == null || value.uid === uid || value.reservedAt + 30_000 <= io.serverNow()
      // Seats free, own or left by an absent account, in order. A seat held by an account
      // that looks present can still be an expired duplicate its directory does not
      // name: only the Rules can tell, so those come last and their refusals do not
      // mean "not allowed" (Codex review 08/11).
      const keys = Object.keys(Array.from({ length: 16 }))
      const expired = (key: string) => slots[key]!.reservedAt + 30_000 <= io.serverNow()
      const first = keys.filter(key => !slots[key] || slots[key].uid === uid || (!presentUids.has(slots[key].uid) && expired(key)))
      const last = keys.filter(key => slots[key] && slots[key].uid !== uid && presentUids.has(slots[key].uid) && expired(key))
      for (const key of first) {
        if (slot != null) break
        if (await claim(key, take)) { slot = key; reservedSlot = key }
      }
      const refused = attempts > 0 && denials === attempts
      for (const key of refused ? [] : last) {
        if (slot != null) break
        if (await claim(key, take, false)) { slot = key; reservedSlot = key }
      }
      if (slot == null) throw new PitwallRoomError(refused ? 'not-allowed' : 'full')
      assertOpen()
      const nickname = uid
      const occupancy = { nickname, connectedAt: io.serverTimestamp(), disconnectedAt: null }
      // Before the commit only a removal is allowed by the Rules; the grace record
      // replaces it as soon as the membership exists (adoptMembership, F4).
      await io.registerDisconnectUpdates({ [`rooms/${roomId}/occupancy/${uid}/${connectionId}`]: null })
      try {
        await io.write('', {
          [`rooms/${roomId}/access/${uid}`]: 'member',
          [`rooms/${roomId}/occupancy/${uid}/${connectionId}`]: occupancy,
          [`directory/${uid}`]: { roomId, connectionId, slot },
        })
      }
      catch (cause) {
        if (!isDenied(cause)) throw cause
        // The sponsoring friend left between the preview and the commit, or the
        // account entered elsewhere from another device: a refusal, not a fault.
        throw new PitwallRoomError('not-allowed', cause)
      }
      joined = true
      await adopt(roomId, connectionId, nickname)
      // F6: leftovers of an interrupted entry. The Rules refuse to release the seat
      // the directory names, so a stale view here cannot remove the live one.
      for (const key of own) {
        if (key === slot) continue
        await io.transact<SocialSlot>(`rooms/${roomId}/slots/${key}`, releaseOwn).catch(() => {})
      }
      const room = await readCommitted(roomId)
      diagnostic('room_joined', roomId)
      if (!room) return { ok: false, committed: true, code: 'view-pending', reason: roomErrorKey('view-pending') }
      return { ok: true, value: room }
    }
    catch (error) {
      const result = failure('join', roomId, error)
      // After the commit the account is a member: never report a rejection.
      return joined ? { ...result, committed: true as const } : result
    }
    finally {
      // Only a seat reserved by this attempt; the Rules keep it if the directory names it by now.
      if (reservedSlot != null && !joined) {
        await io.transact<SocialSlot>(`rooms/${roomId}/slots/${reservedSlot}`, releaseOwn).catch(() => {})
      }
    }
  }

  function createRoom(input: { label: string }) {
    // All entry points share this lifecycle: a double click is one intent.
    if (!opening) {
      opening = serialize(() => openNow(input))
        .catch(error => failure('open', undefined, error))
        .finally(() => { opening = null })
    }
    return opening
  }

  async function openNow(input: { label: string }): Promise<JoinResult> {
    try {
      await options.ensureConnection()
      assertOpen()
      const existing = await io.read<SocialDirectoryEntry>(`directory/${uid}`)
      if (existing) {
        // An explicit open after logout resumes the still-live previous party,
        // once discovery has obtained access through a present friend.
        const room = await releaseStale(existing, true)
        if (room?.memberUids.includes(uid)) return { ok: true, value: room }
        if (room) return joinNow(existing.roomId)
      }
      const connectionId = options.connectionId()
      if (!connectionId) throw new PitwallRoomError('not-ready')
      assertOpen()
      const roomId = crypto.randomUUID()
      const now = new Date(io.serverNow()).toISOString()
      const nickname = input.label.slice(0, 60)
      const meta = { roomId, hostUid: uid, label: input.label.slice(0, 120), vehicleFingerprint: '', createdAt: now, updatedAt: now }
      await io.registerDisconnectUpdates({ [`rooms/${roomId}/occupancy/${uid}/${connectionId}`]: null })
      await io.write('', {
        [`rooms/${roomId}/meta`]: meta,
        [`rooms/${roomId}/access/${uid}`]: 'member',
        [`rooms/${roomId}/slots/0`]: { uid, reservedAt: io.serverTimestamp() },
        [`rooms/${roomId}/occupancy/${uid}/${connectionId}`]: { nickname, connectedAt: io.serverTimestamp(), disconnectedAt: null },
        [`directory/${uid}`]: { roomId, connectionId, slot: '0' },
      })
      await adopt(roomId, connectionId, nickname)
      diagnostic('room_created', roomId)
      return { ok: true, value: { ...roomFromRealtime(meta, { [uid]: 'member' })!, membershipModel: 'social' as const } }
    }
    catch (error) { return failure('open', undefined, error) }
  }

  /**
   * Leaves a room, or removes stale records of one. Only what is still this
   * account's goes: the seat only after reading it is ours, and if it changed
   * hands meanwhile the own records still go (F1). Never fails because
   * something is already gone.
   */
  async function leaveNow(roomId: string, reason: 'leave' | 'cleanup' = 'leave'): Promise<{ ok: true, value: true } | RoomFailure> {
    leaving.add(roomId)
    for (const changed of discoveryChanges) changed(roomId, true)
    try {
      const directory = await io.read<SocialDirectoryEntry>(`directory/${uid}`)
      const changes: Record<string, unknown> = { [`rooms/${roomId}/access/${uid}`]: null, [`rooms/${roomId}/occupancy/${uid}`]: null }
      let seat: string | null = null
      if (directory?.roomId === roomId) {
        changes[`directory/${uid}`] = null
        if (directory.slot != null) {
          // A denied read (membership already expired) is not ownership: the seat
          // then expires by itself, because the directory no longer names it.
          const owner = await io.read<SocialSlot>(`rooms/${roomId}/slots/${directory.slot}`).catch((cause) => {
            if (isDenied(cause)) return null
            throw cause
          })
          if (owner?.uid === uid) {
            seat = directory.slot
            changes[`rooms/${roomId}/slots/${seat}`] = null
          }
        }
      }
      try { await io.write('', changes) }
      catch (cause) {
        if (seat == null || !isDenied(cause)) throw cause
        // The seat was reclaimed between the read and the write.
        delete changes[`rooms/${roomId}/slots/${seat}`]
        await io.write('', changes)
        diagnostic('room_cleanup_recovered', roomId)
      }
      diagnostic(reason === 'leave' ? 'room_left' : 'room_cleaned', roomId)
      // Empty occupancy is closed logically. No stale directory/witness can
      // authorize another join; physical retention preserves historical outcomes.
      return { ok: true as const, value: true as const }
    }
    catch (error) { return failure(reason, roomId, error) }
    finally {
      leaving.delete(roomId)
      for (const changed of discoveryChanges) changed(roomId, false)
    }
  }

  /**
   * F3: a room listener denied while the directory pointed to another device of
   * this account. True when the account is still a member once the failover has
   * repaired the pointer; false after an exit or a real expiry.
   */
  async function confirmMembership(roomId: string): Promise<boolean> {
    for (const delay of [0, PITWALL_FAILOVER_CONFIRM_MS + 500, 3000]) {
      if (delay) await new Promise(resolve => setTimeout(resolve, delay))
      if (disposed || leaving.has(roomId)) return false
      const directory = await io.read<SocialDirectoryEntry>(`directory/${uid}`).catch(() => null)
      if (directory?.roomId !== roomId) return false
      const room = await readRoom(roomId).catch(() => null)
      if (room?.memberUids.includes(uid)) return true
      // Only a pointer naming another device of this account can still be repaired.
      if (directory.connectionId === options.connectionId()) return false
    }
    return false
  }

  /** Refuses new entries and exits; resolves once the one in progress has finished. */
  function dispose() {
    disposed = true
    return queue
  }

  return {
    readRoom, watchRoom, watchRooms, createRoom, confirmMembership, dispose,
    joinRoom: (roomId: string) => serialize(() => joinNow(roomId)).catch(error => failure('join', roomId, error)),
    leaveRoom: (roomId: string) => serialize(() => leaveNow(roomId)).catch(error => failure('leave', roomId, error)),
  }
}
