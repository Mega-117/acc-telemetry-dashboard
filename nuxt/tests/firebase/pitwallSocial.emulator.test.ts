import { readFileSync } from 'node:fs'
import { assertFails, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { get, ref, set, update, goOffline, goOnline, type Database } from 'firebase/database'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPitwallRealtimeTransport } from '~/services/pitwall/pitwallRealtimeTransport'
import { createPitwallRealtimeRoomService } from '~/services/pitwall/pitwallRealtimeRoomService'
import { PITWALL_SOCIAL_ROOT as ROOT } from '~/services/pitwall/pitwallSocialRoom'
import { createPitwallRealtimeEngineerService } from '~/services/pitwall/pitwallRealtimeEngineerService'
import type { Firestore } from 'firebase/firestore'

let env: RulesTestEnvironment
const stops: Array<() => void | Promise<void>> = []
const friends: Record<string, string[]> = { A: ['B'], B: ['A', 'C'], C: ['B'], D: [] }
beforeAll(async () => {
  const address = process.env.FIREBASE_DATABASE_EMULATOR_HOST
  if (!address) throw new Error('An emulator is required')
  env = await initializeTestEnvironment({ projectId: 'demo-pitwall-social', database: {
    host: '127.0.0.1', port: Number(address.split(':').at(-1)), rules: readFileSync(new URL('../../../database.rules.json', import.meta.url), 'utf8'),
  } })
})
beforeEach(async () => {
  await env.clearDatabase()
  await env.withSecurityRulesDisabled(async context => {
    for (const [uid, ids] of Object.entries(friends)) for (const other of ids) {
      await set(ref(context.database() as unknown as Database, `pitwallV3/grants/${uid}/${other}`), { status: 'granted', scope: 'always' })
    }
  })
})
afterEach(async () => { for (const stop of stops.splice(0).reverse()) await stop() })
afterAll(async () => { await env?.cleanup() })
async function participant(uid: string) {
  const database = env.authenticatedContext(uid).database() as unknown as Database
  const io = createPitwallRealtimeTransport(database, ROOT)
  stops.push(() => { io.dispose(); goOffline(database) })
  await vi.waitFor(() => expect(io.online()).toBe(true))
  const service = createPitwallRealtimeRoomService({ uid, io, watchFriends: callback => { callback(friends[uid] ?? []); return () => {} } })
  stops.push(() => service.dispose())
  return service
}
async function publish(service: Awaited<ReturnType<typeof participant>>, roomId: string, driving = false) {
  const result = await service.publishPresence(roomId, { nickname: service.uid, kind: driving ? 'driver' : 'engineer', driving, runtimeSessionId: service.uid,
    ...(driving ? { strategy: { fuelToAdd: 10, tyreSet: 2, pressures: { FL: 26, FR: 26, RL: 26, RR: 26 } } } : {}),
  })
  expect(result.ok, JSON.stringify(result)).toBe(true)
}
describe('social rooms with real Firebase rules', () => {
  it('coalesces simultaneous open requests into one party', async () => {
    const A = await participant('A')
    const results = await Promise.all([
      A.ensureRoomForVehicle({ fingerprint: '', label: 'First' }),
      A.ensureRoomForVehicle({ fingerprint: '', label: 'Second' }),
    ])
    expect(results.map(result => result.ok)).toEqual([true, true])
    const ids = results.flatMap(result => result.ok ? [result.value.roomId] : [])
    expect(new Set(ids).size).toBe(1)
    await env.withSecurityRulesDisabled(async context => {
      const all = (await get(ref(context.database() as unknown as Database, `${ROOT}/rooms`))).val()
      expect(Object.keys(all)).toEqual([ids[0]])
    })
  })

  it('keeps non-friends together after their mutual friend leaves and prevents unauthorized reentry', async () => {
    const A = await participant('A'), B = await participant('B'), C = await participant('C')
    const created = await A.ensureRoomForVehicle({ fingerprint: '', label: 'Stable party' })
    if (!created.ok) throw new Error(created.reason)
    const id = created.value.roomId
    await publish(A, id)
    let bRooms: any[] = [], cRooms: any[] = []
    stops.push(B.watchRooms(value => { bRooms = value }))
    await vi.waitFor(() => expect(bRooms).toHaveLength(1))
    expect((await B.joinRoom(id)).ok).toBe(true)
    await publish(B, id)
    stops.push(C.watchRooms(value => { cRooms = value }))
    await vi.waitFor(() => expect(cRooms).toHaveLength(1))
    expect((await C.joinRoom(id)).ok).toBe(true)
    await publish(C, id)
    let members: string[] = []
    stops.push(C.watchMembers(id, value => { members = value.map(member => member.uid).sort() }))
    await vi.waitFor(() => expect(members).toEqual(['A', 'B', 'C']))
    await env.withSecurityRulesDisabled(async context => {
      await set(ref(context.database() as unknown as Database, 'pitwallV3/grants/B/C'), null)
      await set(ref(context.database() as unknown as Database, 'pitwallV3/grants/C/B'), null)
    })
    expect((await B.leaveRoom(id)).ok).toBe(true)
    await vi.waitFor(() => expect(members).toEqual(['A', 'C']))
    // Membership and occupancy arrive on separate SDK subscriptions; await this projection too.
    await vi.waitFor(async () => expect(await C.readRoom(id)).toMatchObject({ label: 'Stable party', memberUids: ['A', 'C'] }))
    expect((await C.leaveRoom(id)).ok).toBe(true)
    expect((await C.joinRoom(id)).ok).toBe(false)
    await vi.waitFor(async () => expect(await A.readRoom(id)).toMatchObject({ memberUids: ['A'] }))
  })

  it('rediscovers the room through B after A logs out with a stale own directory', async () => {
    const A = await participant('A'), B = await participant('B')
    const created = await A.ensureRoomForVehicle({ fingerprint: '', label: 'Pitwall di A' })
    if (!created.ok) throw new Error(created.reason)
    const id = created.value.roomId
    await publish(A, id)
    let bRooms: any[] = []
    stops.push(B.watchRooms(value => { bRooms = value }))
    await vi.waitFor(() => expect(bRooms.map(room => room.roomId)).toEqual([id]))
    expect((await B.joinRoom(id)).ok).toBe(true)
    await publish(B, id)
    await A.session.stop()
    A.io.dispose()
    const returned = await participant('A')
    let aRooms: any[] = []
    stops.push(returned.watchRooms(value => { aRooms = value }))
    await vi.waitFor(() => expect(aRooms.map(room => room.roomId)).toEqual([id]))
    expect(aRooms[0].memberUids).toEqual(['B'])
    expect(await returned.ensureRoomForVehicle({ fingerprint: '', label: 'Do not duplicate' })).toMatchObject({ ok: true, value: { roomId: id } })
    await publish(returned, id)
    expect((await returned.ensureRoomForVehicle({ fingerprint: '', label: 'Do not duplicate' }))).toMatchObject({ ok: true, value: { roomId: id } })
    await vi.waitFor(() => expect(bRooms).toHaveLength(1))
    expect((await returned.leaveRoom(id)).ok).toBe(true)
    await vi.waitFor(() => expect(aRooms[0]?.memberUids).toEqual(['B']))
    expect((await returned.joinRoom(id)).ok).toBe(true)
  })

  it('opening immediately after login resumes the previous party before discovery starts', async () => {
    const A = await participant('A'), B = await participant('B')
    const created = await A.ensureRoomForVehicle({ fingerprint: '', label: 'Original' })
    if (!created.ok) throw new Error(created.reason)
    const id = created.value.roomId
    await publish(A, id)
    let discovered: any[] = []
    stops.push(B.watchRooms(value => { discovered = value }))
    await vi.waitFor(() => expect(discovered).toHaveLength(1))
    expect((await B.joinRoom(id)).ok).toBe(true)
    await publish(B, id)
    await A.session.stop()
    A.io.dispose()
    const returned = await participant('A')
    expect(await returned.ensureRoomForVehicle({ fingerprint: '', label: 'New label' })).toMatchObject({ ok: true, value: { roomId: id, label: 'Original' } })
    await publish(returned, id)
    await vi.waitFor(() => expect(discovered).toHaveLength(1))
  })

  it('accepts reciprocal friendship once, handles duplicate and crossed requests, and revokes future access', async () => {
    const make = async (uid: string) => {
      const database = env.authenticatedContext(uid).database() as unknown as Database
      const io = createPitwallRealtimeTransport(database)
      await vi.waitFor(() => expect(io.online()).toBe(true))
      const service = createPitwallRealtimeEngineerService({ engineerUid: uid, io, db: {} as Firestore })
      stops.push(() => { service.dispose(); io.dispose(); goOffline(database) })
      return service
    }
    const X = await make('X'), Y = await make('Y')
    let xFriends: string[] = [], yFriends: string[] = []
    stops.push(X.watchTrustedUids(value => { xFriends = value }))
    stops.push(Y.watchTrustedUids(value => { yFriends = value }))
    expect((await X.preAuthorise('Y', 'always')).ok).toBe(true)
    expect((await X.requestLink('Y', 'always')).ok).toBe(true)
    expect((await X.requestLink('Y', 'always')).ok).toBe(true)
    expect(xFriends).toEqual([])
    expect((await Y.preAuthorise('X', 'always')).ok).toBe(true)
    await vi.waitFor(() => { expect(xFriends).toEqual(['Y']); expect(yFriends).toEqual(['X']) })
    const repeated = await Promise.all([X.requestLink('Y', 'always'), Y.requestLink('X', 'always')])
    expect(repeated).toEqual([{ ok: true, alreadyGranted: true }, { ok: true, alreadyGranted: true }])
    expect((await Y.decideRequest('X', 'revoked')).ok).toBe(true)
    await vi.waitFor(() => { expect(xFriends).toEqual([]); expect(yFriends).toEqual([]) })
    // Both users can ask at the same time after revocation; neither overwrites
    // an already accepted reciprocal grant with a new pending request.
    await Promise.all([X.preAuthorise('Y', 'always'), Y.preAuthorise('X', 'always')])
    await Promise.all([X.requestLink('Y', 'always'), Y.requestLink('X', 'always')])
    await vi.waitFor(() => { expect(xFriends).toEqual(['Y']); expect(yFriends).toEqual(['X']) })
  })
  it('renews a short disconnection but cannot revive an expired membership', async () => {
    const A = await participant('A')
    const observer = await participant('B')
    const created = await A.ensureRoomForVehicle({ fingerprint: '', label: 'Stable' })
    expect(created.ok).toBe(true)
    if (!created.ok) return
    const roomId = created.value.roomId
    await publish(A, roomId, true)
    let observed: any[] = []
    stops.push(observer.watchRooms(value => { observed = value }))
    await vi.waitFor(() => expect(observed.map(room => room.roomId)).toContain(roomId))
    const oldId = A.session.connectionId()
    goOffline(A.io.database)
    await vi.waitFor(() => expect(A.io.online()).toBe(false))
    await vi.waitFor(() => expect(observed[0]?.reconnectingUids).toEqual(['A']))
    goOnline(A.io.database)
    await vi.waitFor(() => expect(A.session.isReady(roomId)).toBe(true))
    expect(A.session.connectionId()).not.toBe(oldId)
    await vi.waitFor(() => expect(observed[0]?.reconnectingUids).toEqual([]))
    expect((await get(ref(A.io.database, `${ROOT}/directory/A`))).val().connectionId).toBe(A.session.connectionId())
    goOffline(A.io.database)
    await vi.waitFor(() => expect(A.io.online()).toBe(false))
    await env.withSecurityRulesDisabled(async context => {
      await set(ref(context.database() as unknown as Database, `${ROOT}/rooms/${roomId}/occupancy/A`), {
        expired: { nickname: 'A', connectedAt: Date.now() - 60_000, disconnectedAt: Date.now() - 31_000 },
      })
    })
    goOnline(A.io.database)
    await vi.waitFor(() => expect(A.io.online()).toBe(true))
    await assertFails(get(ref(A.io.database, `${ROOT}/rooms/${roomId}/meta`)))
    expect((await A.joinRoom(roomId)).ok).toBe(false)
    const B = await participant('B')
    const next = await B.ensureRoomForVehicle({ fingerprint: '', label: 'Next room' })
    expect(next.ok).toBe(true)
    if (!next.ok) return
    await publish(B, next.value.roomId)
    let available: string[] = []
    stops.push(A.watchRooms(rooms => { available = rooms.map(value => value.roomId) }))
    await vi.waitFor(() => expect(available).toContain(next.value.roomId))
    expect((await A.joinRoom(next.value.roomId)).ok).toBe(true)
    await env.withSecurityRulesDisabled(async context => {
      expect((await get(ref(context.database() as unknown as Database, `${ROOT}/rooms/${roomId}/access/A`))).exists()).toBe(false)
      expect((await get(ref(context.database() as unknown as Database, `${ROOT}/rooms/${roomId}/occupancy/A`))).exists()).toBe(false)
    })
  })

  it('enforces 16 places and reclaims an expired reservation without evicting a present member', async () => {
    const A = await participant('A'), B = await participant('B'), C = await participant('C')
    const created = await A.ensureRoomForVehicle({ fingerprint: '', label: 'Capacity' })
    expect(created.ok).toBe(true)
    if (!created.ok) return
    const roomId = created.value.roomId
    let rooms: any[] = []
    stops.push(B.watchRooms(value => { rooms = value }))
    await vi.waitFor(() => expect(rooms).toHaveLength(1))
    expect((await B.joinRoom(roomId)).ok).toBe(true)
    await publish(B, roomId)
    rooms = []
    stops.push(C.watchRooms(value => { rooms = value }))
    await vi.waitFor(() => expect(rooms[0]?.memberUids).toContain('B'))
    await env.withSecurityRulesDisabled(async context => {
      const changes: Record<string, unknown> = {}
      for (let index = 2; index < 16; index++) {
        const uid = `member${index}`
        changes[`rooms/${roomId}/slots/${index}`] = { uid, reservedAt: Date.now() - 60_000 }
        changes[`rooms/${roomId}/access/${uid}`] = 'member'
        changes[`rooms/${roomId}/occupancy/${uid}/conn`] = { nickname: uid, connectedAt: Date.now() }
        changes[`directory/${uid}`] = { roomId, connectionId: 'conn', slot: String(index) }
      }
      await update(ref(context.database() as unknown as Database, ROOT), changes)
    })
    expect((await C.joinRoom(roomId)).ok).toBe(false)
    await assertFails(set(ref(C.io.database, `${ROOT}/rooms/${roomId}/slots/16`), { uid: 'C', reservedAt: Date.now() }))
    await env.withSecurityRulesDisabled(async context => {
      await set(ref(context.database() as unknown as Database, `${ROOT}/rooms/${roomId}/occupancy/member15/conn/disconnectedAt`), Date.now() - 31_000)
    })
    expect((await C.joinRoom(roomId)).ok).toBe(true)
    await vi.waitFor(async () => {
      const room = await C.readRoom(roomId)
      expect(room?.memberUids).toHaveLength(16)
      expect(room?.memberUids).not.toContain('member15')
    })
  }, 20_000)

  it('routes separate MFD snapshots and serializes only orders for the same target', async () => {
    const A = await participant('A'), B = await participant('B'), C = await participant('C')
    const created = await A.ensureRoomForVehicle({ fingerprint: '', label: 'Team' })
    expect(created.ok, JSON.stringify(created)).toBe(true)
    if (!created.ok) return
    const roomId = created.value.roomId
    await publish(A, roomId, true)
    let bRooms: any[] = [], cRooms: any[] = []
    stops.push(B.watchRooms(value => { bRooms = value }))
    await vi.waitFor(() => expect(bRooms).toHaveLength(1))
    expect((await B.joinRoom(roomId)).ok).toBe(true); await publish(B, roomId)
    stops.push(C.watchRooms(value => { cRooms = value }))
    await vi.waitFor(() => expect(cRooms).toHaveLength(1))
    expect((await C.joinRoom(roomId)).ok).toBe(true); await publish(C, roomId, true)
    let observed: any[] = []
    stops.push(B.watchMembers(roomId, members => { observed = members }))
    for (const service of [A, C]) stops.push(service.watchMembers(roomId, () => {}))
    await vi.waitFor(() => expect(observed.filter(member => member.driving && member.strategy).map(member => member.uid).sort()).toEqual(['A', 'C']))
    const a = await B.sendOrder(roomId, { plan: { fuelLiters: 20 }, revision: 1, targetUid: 'A' })
    const c = await B.sendOrder(roomId, { plan: { fuelLiters: 30 }, revision: 2, targetUid: 'C' })
    expect(a.ok, JSON.stringify(a)).toBe(true); expect(c.ok, JSON.stringify(c)).toBe(true)
    if (!a.ok || !c.ok) return
    expect((await A.publishPresence(roomId, { nickname: 'A', kind: 'driver', driving: false, runtimeSessionId: 'A' })).ok).toBe(true)
    expect((await A.claimOrder(roomId, a.value)).ok).toBe(false)
    await publish(A, roomId, true)
    expect((await A.claimOrder(roomId, a.value)).ok).toBe(true)
    expect((await C.claimOrder(roomId, c.value)).ok).toBe(true)
    expect((await C.claimOrder(roomId, a.value)).ok).toBe(false)
    expect((await B.sendOrder(roomId, { plan: { fuelLiters: 21 }, revision: 3, targetUid: 'A' })).ok).toBe(false)
    expect((await A.leaveRoom(roomId)).ok).toBe(true)
    const result = await A.publishOutcome(roomId, a.value, { status: 'applied' })
    expect(result.ok, JSON.stringify(result)).toBe(true)
    expect((await C.publishOutcome(roomId, c.value, { status: 'applied' })).ok).toBe(true)
    await vi.waitFor(async () => expect((await B.sendOrder(roomId, { plan: { fuelLiters: 22 }, revision: 4, targetUid: 'A' })).ok).toBe(false))
  })

  it('opens without ACC, discovers through a member friend, and survives creator exit', async () => {
    const A = await participant('A'), B = await participant('B'), C = await participant('C'), D = await participant('D')
    const created = await A.ensureRoomForVehicle({ fingerprint: '', label: 'Pitwall di A' })
    expect(created.ok, JSON.stringify(created)).toBe(true)
    if (!created.ok) return
    const roomId = created.value.roomId
    await publish(A, roomId)
    let bRooms: any[] = [], cRooms: any[] = []
    stops.push(B.watchRooms(value => { bRooms = value }))
    await vi.waitFor(() => expect(bRooms.map(room => room.roomId)).toContain(roomId))
    expect((await B.joinRoom(roomId)).ok).toBe(true)
    await publish(B, roomId)
    stops.push(C.watchRooms(value => { cRooms = value }))
    await vi.waitFor(() => expect(cRooms.map(room => room.roomId)).toContain(roomId))
    expect((await C.joinRoom(roomId)).ok).toBe(true)
    await publish(C, roomId)
    await assertFails(get(ref(D.io.database, `${ROOT}/rooms/${roomId}/meta`)))
    expect((await D.joinRoom(roomId)).ok).toBe(false)
    expect((await A.leaveRoom(roomId)).ok).toBe(true)
    await vi.waitFor(async () => expect(await B.readRoom(roomId)).toMatchObject({ label: 'Pitwall di A', hostUid: 'A', memberUids: ['B', 'C'] }))
    expect((await C.leaveRoom(roomId)).ok).toBe(true)
    expect((await B.leaveRoom(roomId)).ok).toBe(true)
    expect((await B.joinRoom(roomId)).ok).toBe(false)
  })

  it('denies forged sponsor and a second room without leaving the first', async () => {
    const A = await participant('A'), D = await participant('D')
    const created = await A.ensureRoomForVehicle({ fingerprint: '', label: 'A' })
    expect(created.ok, JSON.stringify(created)).toBe(true)
    if (!created.ok) return
    const roomId = created.value.roomId
    await publish(A, roomId)
    await assertFails(set(ref(D.io.database, `${ROOT}/admissions/${roomId}/D`), { roomId, sponsorUid: 'A', connectionId: A.session.connectionId() }))
    await assertFails(update(ref(A.io.database, `${ROOT}/directory/A`), { slot: '15' }))
    await assertFails(update(ref(A.io.database, `${ROOT}/directory/A`), { connectionId: 'forged-connection' }))
    await assertFails(update(ref(A.io.database, ROOT), {
      'rooms/second/meta': { ...created.value, roomId: 'second', hostUid: 'A' },
      'rooms/second/access/A': 'member',
      'directory/A': { roomId: 'second', connectionId: A.session.connectionId() },
    }))
  })
})
