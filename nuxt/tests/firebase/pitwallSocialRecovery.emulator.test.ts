// PIP-750: entry, exit and cleanup of social rooms after a closed app, a reclaimed
// seat, a second device or a lost connection. Real lifecycle and session against
// the generated Rules; times are relative to the emulator server clock.
import { readFileSync } from 'node:fs'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { get, ref, remove, runTransaction, set, update, goOffline, goOnline, type Database } from 'firebase/database'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPitwallRealtimeTransport } from '~/services/pitwall/pitwallRealtimeTransport'
import { createPitwallRealtimeRoomService } from '~/services/pitwall/pitwallRealtimeRoomService'
import { PITWALL_SOCIAL_ROOT as ROOT } from '~/services/pitwall/pitwallSocialRoom'

let env: RulesTestEnvironment
const stops: Array<() => void | Promise<void>> = []
// E is a friend of both A and B: the second sponsor for B when A goes away (F8).
const friends: Record<string, string[]> = { A: ['B', 'E'], B: ['A', 'C', 'E'], C: ['B'], D: [], E: ['A', 'B'] }
type Service = Awaited<ReturnType<typeof participant>>

beforeAll(async () => {
  const address = process.env.FIREBASE_DATABASE_EMULATOR_HOST
  if (!address) throw new Error('An emulator is required')
  env = await initializeTestEnvironment({ projectId: 'demo-pitwall-recovery', database: {
    host: '127.0.0.1', port: Number(address.split(':').at(-1)), rules: readFileSync(new URL('../../../database.rules.json', import.meta.url), 'utf8'),
  } })
})
beforeEach(async () => {
  await env.clearDatabase()
  await admin(async (db) => {
    for (const [uid, ids] of Object.entries(friends)) for (const other of ids) {
      await set(ref(db, `pitwallV3/grants/${uid}/${other}`), { status: 'granted', scope: 'always' })
    }
  })
})
afterEach(async () => {
  vi.restoreAllMocks()
  for (const stop of stops.splice(0).reverse()) await stop()
})
afterAll(async () => { await env?.cleanup() })

async function admin<T>(work: (db: Database) => Promise<T>): Promise<T> {
  let result!: T
  await env.withSecurityRulesDisabled(async (context) => { result = await work(context.database() as unknown as Database) })
  return result
}
const at = async (path: string) => admin(async db => (await get(ref(db, `${ROOT}/${path}`))).val())
async function participant(uid: string) {
  const database = env.authenticatedContext(uid, { email_verified: true }).database() as unknown as Database
  const io = createPitwallRealtimeTransport(database, ROOT)
  stops.push(() => { io.dispose(); goOffline(database) })
  await vi.waitFor(() => expect(io.online()).toBe(true))
  const service = createPitwallRealtimeRoomService({ uid, io, watchFriends: (callback) => { callback(friends[uid] ?? []); return () => {} } })
  stops.push(() => service.dispose())
  return service
}
async function publish(service: Service, roomId: string) {
  const result = await service.publishPresence(roomId, { nickname: service.uid, kind: 'engineer', driving: false, runtimeSessionId: service.uid })
  expect(result.ok, JSON.stringify(result)).toBe(true)
}
async function open(service: Service, label = 'Room') {
  const opened = await service.ensureRoomForVehicle({ fingerprint: '', label })
  if (!opened.ok) throw new Error(opened.reason)
  return opened.value.roomId
}
/** Discovery first, as the page does: a friend's room is joined through its preview. */
async function joinThroughDiscovery(service: Service, roomId: string) {
  let seen: string[] = []
  const stop = service.watchRooms((rooms) => { seen = rooms.map(room => room.roomId) })
  stops.push(stop)
  await vi.waitFor(() => expect(seen).toContain(roomId), { timeout: 10_000 })
  return service.joinRoom(roomId)
}
/**
 * The app was closed in the room long ago: the connection is gone, the directory
 * stays (for the resume), and the occupancy is past the 30 s grace.
 */
async function closeLongAgo(service: Service, roomId: string) {
  const connectionId = service.session.connectionId()
  goOffline(service.io.database)
  await vi.waitFor(() => expect(service.io.online()).toBe(false))
  const past = service.io.serverNow() - 31_000
  await admin(db => update(ref(db, `${ROOT}/rooms/${roomId}/occupancy/${service.uid}`), {
    [connectionId]: { nickname: service.uid, connectedAt: past - 60_000, disconnectedAt: past },
  }))
  await vi.waitFor(async () => expect(await at(`connections/${service.uid}/${connectionId}`)).toBeNull())
}
function diagnostics() {
  const rows: Array<Record<string, unknown>> = []
  vi.spyOn(console, 'info').mockImplementation((line: unknown) => {
    const text = String(line)
    if (text.startsWith('[PITWALL_DIAGNOSTIC] ')) rows.push(JSON.parse(text.slice('[PITWALL_DIAGNOSTIC] '.length)))
  })
  return rows
}

describe('PIP-750 stale membership never locks the account out', () => {
  it('S5: with the old seat gone, the former member leaves, opens and joins', async () => {
    const old = await participant('A')
    const roomId = await open(old, 'Old')
    await closeLongAgo(old, roomId)
    await admin(db => remove(ref(db, `${ROOT}/rooms/${roomId}/slots/0`)))
    const A = await participant('A')
    expect((await A.leaveRoom(roomId)).ok).toBe(true)
    expect(await at('directory/A')).toBeNull()
    const fresh = await open(A, 'Fresh')
    expect(fresh).not.toBe(roomId)
    expect((await at('directory/A')).roomId).toBe(fresh)
  })

  it('S6: with the old seat reclaimed by another user, the former member gets back in and the seat stays theirs', async () => {
    const old = await participant('A')
    const roomId = await open(old, 'Old')
    await closeLongAgo(old, roomId)
    await admin(db => set(ref(db, `${ROOT}/rooms/${roomId}/slots/0`), { uid: 'C', reservedAt: Date.now() }))
    const B = await participant('B')
    const party = await open(B, 'B party')
    await publish(B, party)
    const A = await participant('A')
    // Join goes through the stale cleanup; the 07/11 bug denied the whole update here.
    const joined = await joinThroughDiscovery(A, party)
    expect(joined.ok, JSON.stringify(joined)).toBe(true)
    expect(await at(`rooms/${roomId}/slots/0`)).toMatchObject({ uid: 'C' })
    expect(await at(`rooms/${roomId}/access/A`)).toBeNull()
    expect((await at('directory/A')).roomId).toBe(party)
  })

  it('S6b: a stale cached seat makes the full cleanup fail once; the own records still go', async () => {
    const rows = diagnostics()
    const old = await participant('A')
    const roomId = await open(old, 'Old')
    await closeLongAgo(old, roomId)
    await admin(db => set(ref(db, `${ROOT}/rooms/${roomId}/slots/0`), { uid: 'C', reservedAt: Date.now() }))
    const A = await participant('A')
    // The device still holds the seat as it was before the reclaim (listener cache).
    const read = A.io.read.bind(A.io)
    vi.spyOn(A.io, 'read').mockImplementation((async (path: string) =>
      path === `rooms/${roomId}/slots/0` ? { uid: 'A', reservedAt: 1 } : read(path)) as typeof A.io.read)
    expect((await A.leaveRoom(roomId)).ok).toBe(true)
    expect(await at('directory/A')).toBeNull()
    expect(await at(`rooms/${roomId}/access/A`)).toBeNull()
    expect(await at(`rooms/${roomId}/slots/0`)).toMatchObject({ uid: 'C' })
    expect(rows.map(row => row.event)).toContain('room_cleanup_recovered')
    expect(rows.some(row => String(row.event).endsWith('_failed'))).toBe(false)
  })

  it('S8: another live device of the account keeps the old room; this device is told, nothing is evicted', async () => {
    const first = await participant('A')
    const roomId = await open(first, 'Mine')
    await publish(first, roomId)
    const B = await participant('B')
    const party = await open(B, 'B party')
    await publish(B, party)
    const second = await participant('A')
    const refused = await joinThroughDiscovery(second, party)
    expect(refused).toMatchObject({ ok: false, code: 'another-device', reason: 'pitwall.roomErrors.anotherDevice' })
    expect(await at(`rooms/${roomId}/access/A`)).toBe('member')
    expect((await at('directory/A')).roomId).toBe(roomId)
    expect(first.session.isReady(roomId)).toBe(true)
  })

  it('S8b: a denied read while another device announces the room is not expiry (pending failover)', async () => {
    const first = await participant('A')
    const roomId = await open(first, 'Mine')
    await publish(first, roomId)
    const second = await participant('A')
    // The directory names a departed device: the Rules refuse the account until the
    // repair, which the first device performs after PITWALL_FAILOVER_CONFIRM_MS.
    await admin(db => update(ref(db, `${ROOT}`), {
      [`rooms/${roomId}/occupancy/A/departed`]: { nickname: 'A', connectedAt: Date.now() - 90_000, disconnectedAt: Date.now() - 60_000 },
      'directory/A/connectionId': 'departed',
    }))
    const opened = await second.ensureRoomForVehicle({ fingerprint: '', label: 'Second' })
    expect(opened).toMatchObject({ ok: false, code: 'another-device' })
    expect(await at(`rooms/${roomId}/access/A`)).toBe('member')
  })

  it('S9: cleanup is idempotent and never touches a newer room', async () => {
    const A = await participant('A')
    const roomId = await open(A, 'First')
    expect((await A.leaveRoom(roomId)).ok).toBe(true)
    expect((await A.leaveRoom(roomId)).ok).toBe(true)
    const next = await open(A, 'Second')
    expect((await A.leaveRoom(roomId)).ok).toBe(true)
    expect(await at(`rooms/${next}/access/A`)).toBe('member')
    expect((await at('directory/A')).roomId).toBe(next)
  })

  it('S10: a leave without network fails as network, keeps the pointer, and succeeds once online', async () => {
    const rows = diagnostics()
    const A = await participant('A')
    const roomId = await open(A, 'Offline')
    goOffline(A.io.database)
    await vi.waitFor(() => expect(A.io.online()).toBe(false))
    const failed = await A.leaveRoom(roomId)
    expect(failed).toMatchObject({ ok: false, code: 'network', reason: 'pitwall.roomErrors.network' })
    expect(rows.find(row => row.event === 'room_leave_failed')).toMatchObject({ code: 'network', roomId })
    expect((await at('directory/A')).roomId).toBe(roomId)
    goOnline(A.io.database)
    await vi.waitFor(() => expect(A.io.online()).toBe(true))
    expect((await A.leaveRoom(roomId)).ok).toBe(true)
    expect(await at('directory/A')).toBeNull()
  })
})

describe('PIP-750 seats and reconnection follow the server clock', () => {
  it('S12: reopening within 30 s renews the same seat in place, never a second one', async () => {
    const A = await participant('A')
    const roomId = await open(A, 'Short')
    await publish(A, roomId)
    const before = (await at(`rooms/${roomId}/slots/0`)).reservedAt
    goOffline(A.io.database)
    await vi.waitFor(() => expect(A.io.online()).toBe(false))
    goOnline(A.io.database)
    await vi.waitFor(() => expect(A.session.isReady(roomId)).toBe(true))
    await new Promise(resolve => setTimeout(resolve, 20))
    expect((await A.joinRoom(roomId)).ok).toBe(true)
    const slots = await at(`rooms/${roomId}/slots`)
    expect(Object.values(slots).filter((slot: any) => slot.uid === 'A')).toHaveLength(1)
    expect(slots['0'].reservedAt).toBeGreaterThan(before)
    expect((await at('directory/A')).slot).toBe('0')
  })

  it('S13: reopening after 30 s opens a new room; the old seat is free for others', async () => {
    const old = await participant('A')
    const roomId = await open(old, 'Long')
    await closeLongAgo(old, roomId)
    await admin(db => update(ref(db, `${ROOT}/rooms/${roomId}/slots/0`), { reservedAt: Date.now() - 31_000 }))
    const A = await participant('A')
    const fresh = await open(A, 'Again')
    expect(fresh).not.toBe(roomId)
    expect(await at(`rooms/${roomId}/access/A`)).toBeNull()
    expect(await at(`rooms/${roomId}/occupancy/A`)).toBeNull()
    // The old seat could not be read (expired membership), so it was not touched; with the
    // directory moved on it is expired for anyone admitted later (S14 checks that boundary).
    expect(await at(`rooms/${roomId}/slots/0`)).toMatchObject({ uid: 'A' })
    expect((await at('directory/A')).roomId).toBe(fresh)
  })

  it('S14: the 30 s reservation boundary is judged by the server clock', async () => {
    const B = await participant('B')
    const roomId = await open(B, 'Boundary')
    await publish(B, roomId)
    const now = B.io.serverNow()
    // A's seat in this room, its directory elsewhere: only the reservation time protects it.
    await admin(db => update(ref(db, ROOT), {
      [`rooms/${roomId}/slots/5`]: { uid: 'A', reservedAt: now - 25_000 },
      [`rooms/${roomId}/slots/6`]: { uid: 'A', reservedAt: now - 31_000 },
      'directory/A': { roomId: 'elsewhere', connectionId: 'a', slot: '0' },
    }))
    const claim = (slot: string) => runTransaction(ref(B.io.database, `${ROOT}/rooms/${roomId}/slots/${slot}`),
      () => ({ uid: 'B', reservedAt: { '.sv': 'timestamp' } }), { applyLocally: false })
    await assertFails(claim('5'))
    await assertSucceeds(claim('6'))
  })

  it('S16: an entry is owned at once: a dropped connection leaves the grace record, a clean stop removes it', async () => {
    const A = await participant('A')
    const B = await participant('B')
    const roomId = await open(A, 'Grace')
    await publish(A, roomId)
    expect((await joinThroughDiscovery(B, roomId)).ok).toBe(true)
    const connectionId = B.session.connectionId()
    // No presence published yet: the membership itself carries the grace (F4).
    goOffline(B.io.database)
    await vi.waitFor(async () => expect((await at(`rooms/${roomId}/occupancy/B/${connectionId}`))?.disconnectedAt).toEqual(expect.any(Number)))
    goOnline(B.io.database)
    await vi.waitFor(() => expect(B.io.online()).toBe(true))
    const C = await participant('B')
    expect((await joinThroughDiscovery(C, roomId)).ok).toBe(true)
    const own = C.session.connectionId()
    await C.dispose()
    await vi.waitFor(async () => expect(await at(`rooms/${roomId}/occupancy/B/${own}`)).toBeNull())
  })
})

describe('PIP-750 one account, one room, one seat', () => {
  it('S15: the pointer cannot leave a room while the account keeps access; the atomic leave stays legal', async () => {
    const A = await participant('A')
    const roomId = await open(A, 'Pointer')
    const db = A.io.database
    await assertFails(remove(ref(db, `${ROOT}/directory/A`)))
    await assertFails(update(ref(db, `${ROOT}/directory/A`), { roomId: 'other' }))
    await assertSucceeds(update(ref(db, ROOT), {
      [`rooms/${roomId}/access/A`]: null, [`rooms/${roomId}/occupancy/A`]: null, [`rooms/${roomId}/slots/0`]: null, 'directory/A': null,
    }))
    // Removing a pointer that is already gone is not an error.
    await assertSucceeds(remove(ref(db, `${ROOT}/directory/A`)))
    expect(await open(A, 'Next')).toBeTruthy()
  })

  it('S15b: one atomic update cannot create memberships in two rooms', async () => {
    const A = await participant('A')
    await A.ensureRoomForVehicle({ fingerprint: '', label: 'connect' }).then(result => result.ok && A.leaveRoom(result.value.roomId))
    const connectionId = A.session.connectionId()
    const now = new Date(A.io.serverNow()).toISOString()
    const room = (id: string) => ({
      [`rooms/${id}/meta`]: { roomId: id, hostUid: 'A', label: id, vehicleFingerprint: '', createdAt: now, updatedAt: now },
      [`rooms/${id}/access/A`]: 'member',
      [`rooms/${id}/slots/0`]: { uid: 'A', reservedAt: { '.sv': 'timestamp' } },
      [`rooms/${id}/occupancy/A/${connectionId}`]: { nickname: 'A', connectedAt: { '.sv': 'timestamp' }, disconnectedAt: null },
    })
    const ids = [crypto.randomUUID(), crypto.randomUUID()]
    await assertFails(update(ref(A.io.database, ROOT), { ...room(ids[0]!), ...room(ids[1]!), 'directory/A': { roomId: ids[1], connectionId, slot: '0' } }))
    await assertSucceeds(update(ref(A.io.database, ROOT), { ...room(ids[1]!), 'directory/A': { roomId: ids[1], connectionId, slot: '0' } }))
  })

  it('S15c: access left in a room the directory does not name never authorizes reading it', async () => {
    const A = await participant('A')
    const left = await open(A, 'Leftover access')
    expect(await open(A, 'Again')).toBe(left) // a second open resumes the room: one room per account
    // The 07/11 manual unlock removed only the directory: access stayed behind.
    const connectionId = A.session.connectionId()
    await admin(db => update(ref(db, ROOT), { 'directory/A': null }))
    const current = await open(A, 'Current')
    expect((await at('directory/A')).roomId).toBe(current)
    expect(await at(`rooms/${left}/access/A`)).toBe('member')
    await admin(db => set(ref(db, `${ROOT}/rooms/${left}/occupancy/A/${connectionId}`), { nickname: 'A', connectedAt: Date.now(), disconnectedAt: null }))
    await assertFails(get(ref(A.io.database, `${ROOT}/rooms/${left}/meta`)))
    await assertSucceeds(get(ref(A.io.database, `${ROOT}/rooms/${current}/meta`)))
  })

  it('S17: entries and exits of one device run in order and stop at dispose', async () => {
    const A = await participant('A')
    const B = await participant('B')
    const roomId = await open(A, 'Serial')
    await publish(A, roomId)
    let seen: string[] = []
    stops.push(B.watchRooms((rooms) => { seen = rooms.map(room => room.roomId) }))
    await vi.waitFor(() => expect(seen).toContain(roomId))
    const [joined, left] = await Promise.all([B.joinRoom(roomId), B.leaveRoom(roomId)])
    expect(joined.ok).toBe(true)
    expect(left.ok).toBe(true)
    expect(await at(`rooms/${roomId}/access/B`)).toBeNull()
    expect(await at('directory/B')).toBeNull()
    await B.dispose()
    expect(await B.joinRoom(roomId)).toMatchObject({ ok: false, code: 'session-ended', reason: 'pitwall.roomErrors.sessionEnded' })
    expect(await at(`rooms/${roomId}/access/B`)).toBeNull()
  })

  it('S18: two simultaneous entries of one device take one seat', async () => {
    const A = await participant('A')
    const B = await participant('B')
    const roomId = await open(A, 'Double')
    await publish(A, roomId)
    let seen: string[] = []
    stops.push(B.watchRooms((rooms) => { seen = rooms.map(room => room.roomId) }))
    await vi.waitFor(() => expect(seen).toContain(roomId))
    const results = await Promise.all([B.joinRoom(roomId), B.joinRoom(roomId)])
    expect(results.every(result => result.ok)).toBe(true)
    const slots = await at(`rooms/${roomId}/slots`)
    expect(Object.values(slots).filter((slot: any) => slot.uid === 'B')).toHaveLength(1)
  })

  it('S19: an interrupted entry leaves no second seat: renewal keeps one and frees the other', async () => {
    const A = await participant('A')
    const roomId = await open(A, 'Leftover')
    await publish(A, roomId)
    await admin(db => set(ref(db, `${ROOT}/rooms/${roomId}/slots/3`), { uid: 'A', reservedAt: Date.now() - 31_000 }))
    // While A stays live, the unnamed seat is reclaimable by another admitted user (Codex #5).
    const B = await participant('B')
    let seen: string[] = []
    stops.push(B.watchRooms((rooms) => { seen = rooms.map(room => room.roomId) }))
    await vi.waitFor(() => expect(seen).toContain(roomId))
    await assertSucceeds(runTransaction(ref(B.io.database, `${ROOT}/rooms/${roomId}/slots/3`),
      () => ({ uid: 'B', reservedAt: { '.sv': 'timestamp' } }), { applyLocally: false }))
    await admin(db => set(ref(db, `${ROOT}/rooms/${roomId}/slots/4`), { uid: 'A', reservedAt: Date.now() }))
    expect((await A.joinRoom(roomId)).ok).toBe(true)
    const slots = await at(`rooms/${roomId}/slots`)
    expect(Object.entries(slots).filter(([, slot]: any) => slot.uid === 'A').map(([key]) => key)).toEqual(['0'])
    // The seat the directory names can never be released by a stale rollback of this account.
    await assertFails(runTransaction(ref(A.io.database, `${ROOT}/rooms/${roomId}/slots/0`), () => null, { applyLocally: false }))
  })

  it('S20: a second device of the account entering the same room shares the one seat', async () => {
    const first = await participant('A')
    const roomId = await open(first, 'Shared')
    await publish(first, roomId)
    const second = await participant('A')
    expect((await second.joinRoom(roomId)).ok).toBe(true)
    await publish(second, roomId)
    const slots = await at(`rooms/${roomId}/slots`)
    expect(Object.values(slots).filter((slot: any) => slot.uid === 'A')).toHaveLength(1)
    expect(await at(`rooms/${roomId}/access/A`)).toBe('member')
  })
})

describe('PIP-750 discovery, late views and failover', () => {
  it('S21: when the sponsoring friend goes away, discovery recovers through another present friend', async () => {
    const A = await participant('A')
    const E = await participant('E')
    const roomId = await open(A, 'Sponsors')
    await publish(A, roomId)
    expect((await joinThroughDiscovery(E, roomId)).ok).toBe(true)
    await publish(E, roomId)
    const B = await participant('B')
    let seen: string[] = []
    stops.push(B.watchRooms((rooms) => { seen = rooms.map(room => room.roomId) }))
    await vi.waitFor(() => expect(seen).toContain(roomId))
    // A closes the app long ago: its directory stays, its connection and grace are gone.
    await closeLongAgo(A, roomId)
    await new Promise(resolve => setTimeout(resolve, 1_500))
    await vi.waitFor(() => expect(seen).toContain(roomId), { timeout: 10_000 })
    expect((await B.joinRoom(roomId)).ok).toBe(true)
  })

  it('S22: an entry committed while its view is refused is reported as committed, not rejected', async () => {
    const A = await participant('A')
    const roomId = await open(A, 'Late view')
    await publish(A, roomId)
    const B = await participant('B')
    let seen: string[] = []
    stops.push(B.watchRooms((rooms) => { seen = rooms.map(room => room.roomId) }))
    await vi.waitFor(() => expect(seen).toContain(roomId))
    const read = B.io.read.bind(B.io)
    let committed = false
    const write = B.io.write.bind(B.io)
    vi.spyOn(B.io, 'write').mockImplementation((async (path: string, changes: Record<string, unknown>) => {
      await write(path, changes)
      if (`directory/B` in changes && changes['directory/B']) committed = true
    }) as typeof B.io.write)
    vi.spyOn(B.io, 'read').mockImplementation((async (path: string) => {
      if (committed && path === `rooms/${roomId}/meta`) throw Object.assign(new Error('PERMISSION_DENIED'), { code: 'PERMISSION_DENIED' })
      return read(path)
    }) as typeof B.io.read)
    const result = await B.joinRoom(roomId)
    expect(result).toMatchObject({ ok: false, committed: true, code: 'view-pending' })
    expect(await at(`rooms/${roomId}/access/B`)).toBe('member')
  })

  it('S23: a clean stop of the device the directory names hands the pointer over; no listener is refused, no seat stolen', async () => {
    const first = await participant('A')
    const roomId = await open(first, 'Handover')
    await publish(first, roomId)
    await admin(db => update(ref(db, `${ROOT}/rooms/${roomId}/slots/0`), { reservedAt: Date.now() - 60_000 }))
    const second = await participant('A')
    expect((await second.joinRoom(roomId)).ok).toBe(true)
    await publish(second, roomId)
    await vi.waitFor(async () => expect((await at('directory/A')).connectionId).toBe(second.session.connectionId()))
    const views: Array<unknown> = []
    const errors: Error[] = []
    stops.push(first.watchRoom(roomId, room => views.push(room), error => errors.push(error)))
    await vi.waitFor(() => expect(views.at(-1)).toBeTruthy())
    await second.dispose()
    // Same write: the pointer names the first device the moment the second disappears.
    expect((await at('directory/A')).connectionId).toBe(first.session.connectionId())
    const B = await participant('B')
    let seen: string[] = []
    stops.push(B.watchRooms((rooms) => { seen = rooms.map(room => room.roomId) }))
    await vi.waitFor(() => expect(seen).toContain(roomId))
    await assertFails(runTransaction(ref(B.io.database, `${ROOT}/rooms/${roomId}/slots/0`),
      () => ({ uid: 'B', reservedAt: { '.sv': 'timestamp' } }), { applyLocally: false }))
    await new Promise(resolve => setTimeout(resolve, 500))
    expect(errors).toEqual([])
    expect(views.includes(null)).toBe(false)
    expect(await first.confirmMembership(roomId)).toBe(true)
  })

  it('S23b: if the heir device vanishes during the handover, the stopping device still removes its own records', async () => {
    const first = await participant('A')
    const roomId = await open(first, 'Heir gone')
    await publish(first, roomId)
    const second = await participant('A')
    expect((await second.joinRoom(roomId)).ok).toBe(true)
    await publish(second, roomId)
    const own = second.session.connectionId()
    await vi.waitFor(async () => expect((await at('directory/A')).connectionId).toBe(own))
    // The heir seen by the stopping device has already left (its occupancy is gone on the server).
    const read = second.io.read.bind(second.io)
    vi.spyOn(second.io, 'read').mockImplementation((async (path: string) => path === `rooms/${roomId}/occupancy/A`
      ? { [own]: { connectedAt: 1 }, vanished: { connectedAt: 1, disconnectedAt: null } } : read(path)) as typeof second.io.read)
    await second.dispose()
    expect(await at(`rooms/${roomId}/occupancy/A/${own}`)).toBeNull()
    expect(await at(`connections/A/${own}`)).toBeNull()
  })

  // Live test 08/11: a guest reloading the browser page was shown "reconnecting" for 30 s, then dropped out.
  async function guestInRoom() {
    const A = await participant('A')
    const roomId = await open(A, 'Reload')
    await publish(A, roomId)
    const B = await participant('B')
    expect((await joinThroughDiscovery(B, roomId)).ok).toBe(true)
    await publish(B, roomId)
    const slot = (await at('directory/B')).slot
    return { A, B, roomId, slot }
  }
  async function reload(service: Service) {
    const old = service.session.connectionId()
    goOffline(service.io.database)
    await vi.waitFor(async () => expect((await at(`connections/${service.uid}/${old}`))).toBeNull())
    return participant(service.uid)
  }

  it('S25: a page reload within the grace resumes the same membership and seat on the new connection', async () => {
    const { A, B, roomId, slot } = await guestInRoom()
    const fresh = await reload(B)
    const resumed = await fresh.resumeRoom()
    expect(resumed).toMatchObject({ ok: true, value: { roomId } })
    const directory = await at('directory/B')
    expect(directory).toMatchObject({ roomId, slot, connectionId: fresh.session.connectionId() })
    const presence = await at(`rooms/${roomId}/occupancy/B/${fresh.session.connectionId()}`)
    expect(presence?.connectedAt).toEqual(expect.any(Number))
    expect(presence?.disconnectedAt).toBeUndefined()
    expect(Object.values(await at(`rooms/${roomId}/slots`)).filter((value: any) => value.uid === 'B')).toHaveLength(1)
    await vi.waitFor(async () => expect((await A.readRoom(roomId))?.reconnectingUids).toEqual([]))
  })

  it('S25b: after an explicit exit a reload resumes nothing', async () => {
    const { B, roomId } = await guestInRoom()
    expect((await B.leaveRoom(roomId)).ok).toBe(true)
    const fresh = await reload(B)
    expect(await fresh.resumeRoom()).toBeNull()
    expect(await at(`rooms/${roomId}/access/B`)).toBeNull()
  })

  it('S25d: an exit made by another device while the resume is deciding is never undone', async () => {
    const { B, roomId } = await guestInRoom()
    const fresh = await reload(B)
    const read = fresh.io.read.bind(fresh.io)
    vi.spyOn(fresh.io, 'read').mockImplementation((async (path: string) => {
      if (path === `rooms/${roomId}/occupancy`) {
        const value = await read(path)
        // Between the eligibility check and the entry, the account leaves from another PC.
        await admin(db => update(ref(db, ROOT), { [`rooms/${roomId}/access/B`]: null, [`rooms/${roomId}/occupancy/B`]: null, 'directory/B': null }))
        return value
      }
      return read(path)
    }) as typeof fresh.io.read)
    expect(await fresh.resumeRoom()).toMatchObject({ ok: false, code: 'not-allowed' })
    expect(await at(`rooms/${roomId}/access/B`)).toBeNull()
    expect(await at('directory/B')).toBeNull()
  })

  it('S25c: a membership held by another live device of the account is not taken over', async () => {
    const { roomId, B } = await guestInRoom()
    const other = await participant('B')
    expect(await other.resumeRoom()).toBeNull()
    expect((await at('directory/B')).connectionId).toBe(B.session.connectionId())
    expect(roomId).toBeTruthy()
  })

  it('S24: every failed entry, open or exit leaves one diagnostic with its code', async () => {
    const rows = diagnostics()
    const A = await participant('A')
    const D = await participant('D')
    const roomId = await open(A, 'Diag')
    await publish(A, roomId)
    const refused = await D.joinRoom(roomId)
    expect(refused).toMatchObject({ ok: false, code: 'not-allowed', reason: 'pitwall.roomErrors.notAllowed' })
    expect(rows.find(row => row.event === 'room_join_failed')).toMatchObject({ code: 'not-allowed', roomId, uid: 'D' })
    const B = await participant('B')
    const party = await open(B, 'Party')
    await publish(B, party)
    const blocked = await joinThroughDiscovery(A, party)
    expect(blocked).toMatchObject({ ok: false, code: 'in-another-room' })
    expect(rows.filter(row => row.event === 'room_join_failed').map(row => row.code)).toEqual(['not-allowed', 'in-another-room'])
  })
})
