import { readFileSync } from 'node:fs'
import { assertFails, assertSucceeds, initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { get, ref, set, update, serverTimestamp, goOffline, goOnline, type Database } from 'firebase/database'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createPitwallRealtimeTransport, type PitwallRealtimeTransport } from '~/services/pitwall/pitwallRealtimeTransport'
import { createPitwallRealtimeRoomService, type PitwallRealtimeRoomService } from '~/services/pitwall/pitwallRealtimeRoomService'
import { startPitwallRealtimeDriver } from '~/services/pitwall/pitwallRealtimeDriver'

const PROJECT = 'demo-pitwall-audit'
let env: RulesTestEnvironment
const disposers: Array<() => void | Promise<void>> = []
const transports: PitwallRealtimeTransport[] = []
function db(uid: string) { return env.authenticatedContext(uid).database() as unknown as Database }
beforeAll(async () => {
  if (!process.env.FIREBASE_DATABASE_EMULATOR_HOST) throw new Error('Run only through firebase emulators:exec --only database --project demo-pitwall-audit')
  env = await initializeTestEnvironment({ projectId: PROJECT, database: { host: '127.0.0.1', port: 9000,
    rules: readFileSync(new URL('../../../database.rules.json', import.meta.url), 'utf8') } })
})
beforeEach(async () => { await env.clearDatabase() })
afterEach(async () => {
  for (const stop of disposers.splice(0).reverse()) await stop()
  for (const io of transports.splice(0)) { io.dispose(); goOffline(io.database) }
})
afterAll(async () => { await env?.cleanup() })

async function participant(uid: string) {
  const io = createPitwallRealtimeTransport(db(uid))
  transports.push(io)
  await vi.waitFor(() => expect(io.online()).toBe(true))
  const service = createPitwallRealtimeRoomService({ uid, io })
  disposers.push(() => service.dispose())
  return service
}
async function openRoom() {
  const driver = await participant('driver')
  const engineer = await participant('engineer')
  const result = await driver.ensureRoomForVehicle({ fingerprint: '0123456789abcdef', label: 'QA car', seedAllowedUids: ['engineer'] })
  expect(result.ok, JSON.stringify(result)).toBe(true)
  if (!result.ok) throw new Error(result.reason)
  const roomId = result.value.roomId
  const joined = await engineer.joinRoom(roomId)
  expect(joined.ok, JSON.stringify(joined)).toBe(true)
  expect((await driver.publishPresence(roomId, { nickname: 'Driver', kind: 'driver', driving: true, runtimeSessionId: 'runtime', strategy: { fuelToAdd: 25, tyreSet: 2, fittedTyreSet: 2, pressures: { FL: 26, FR: 26, RL: 26, RR: 26 } } })).ok).toBe(true)
  expect((await engineer.publishPresence(roomId, { nickname: 'Engineer', kind: 'engineer', driving: false, runtimeSessionId: 'browser' })).ok).toBe(true)
  for (const service of [driver, engineer]) disposers.push(service.watchMembers(roomId, () => {}))
  await vi.waitFor(async () => expect((await get(ref(driver.io.database, `pitwallV3/rooms/${roomId}/mfd`))).exists()).toBe(true))
  return { driver, engineer, roomId }
}
const plan = { fuelLiters: 30, tyreSet: 2, pressures: { FL: 26, FR: 26, RL: 26, RR: 26 } }
async function send(engineer: PitwallRealtimeRoomService, roomId: string) {
  let result: Awaited<ReturnType<typeof engineer.sendOrder>> = { ok: false, reason: 'not ready' }
  await vi.waitFor(async () => { result = await engineer.sendOrder(roomId, { plan, revision: 1 }); expect(result.ok, JSON.stringify(result)).toBe(true) })
  if (!result.ok) throw new Error(result.reason)
  return result.value
}

describe('Pitwall RTDB rules and integrated services', () => {
  it('joins a newly discovered invitation while the room listeners are already active', async () => {
    const driver = await participant('driver')
    const engineer = await participant('engineer')
    const attempts: Array<Promise<unknown>> = []
    let selected = ''
    disposers.push(engineer.watchRooms(rooms => {
      if (!selected && rooms.length === 1) {
        selected = rooms[0]!.roomId
        attempts.push(engineer.joinRoom(selected))
      }
    }))
    await driver.ensureRoomForVehicle({ fingerprint: '0123456789abcdef', label: 'New room', seedAllowedUids: ['engineer'] })
    await vi.waitFor(() => expect(attempts.length).toBe(1))
    const joined = await attempts[0] as any
    expect(joined.ok, JSON.stringify(joined)).toBe(true)
    expect(joined.value.memberUids).toContain('engineer')
    expect((await engineer.joinRoom(selected)).ok).toBe(true)
  })
  it('recovers the durable result after IPC response loss without applying twice', async () => {
    const { driver, engineer, roomId } = await openRoom()
    let saved: Array<any> = []
    const confirm = vi.fn(async () => { saved = []; return { ok: true } })
    const submit = vi.fn(async (input: any) => {
      saved = [{ roomId, orderId: input.order.orderId, driverUid: 'driver', status: 'applied', reason: null, fields: {} }]
      throw new Error('IPC response lost after durable save')
    })
    const actor = startPitwallRealtimeDriver({ service: driver, uid: 'driver', nickname: 'Driver', runtimeSessionId: 'runtime',
      bindMain: async () => true, electronApi: {
        pitwallGetLinkStatus: async () => ({ trustedSender: true, driverUid: 'driver', applying: false, accReady: true }),
        pitwallSubmitRemoteOrder: submit, pitwallPendingOutcomes: async () => saved, pitwallConfirmOutcomes: confirm,
      }, readVehicle: async () => ({ fingerprint: '0123456789abcdef', label: 'QA car', driving: true, strategy: { fuelToAdd: 25, tyreSet: 2 } }),
    })
    disposers.push(() => actor.stop()); await actor.openPitwall()
    await vi.waitFor(() => expect(actor.status().state).toBe('open'), { timeout: 2500 })
    const orderId = await send(engineer, roomId)
    await vi.waitFor(async () => { const result = await engineer.readOrder(roomId, orderId); expect(result.ok && result.value?.status).toBe('applied') })
    expect(confirm).toHaveBeenCalledWith([orderId]); expect(submit).toHaveBeenCalledTimes(1)
    await actor.sync(); expect(submit).toHaveBeenCalledTimes(1)
  })
  it('requires a new order when the driver changes and rejects a skewed lease', async () => {
    const { driver, engineer, roomId } = await openRoom()
    const orderId = await send(engineer, roomId)
    const replacement = await participant('replacement')
    await driver.invite(roomId, replacement.uid); await replacement.joinRoom(roomId)
    await driver.publishPresence(roomId, { nickname: 'Driver', kind: 'driver', driving: false, runtimeSessionId: 'runtime', strategy: { fuelToAdd: 25 } })
    await replacement.publishPresence(roomId, { nickname: 'Replacement', kind: 'driver', driving: true, runtimeSessionId: 'second-runtime', strategy: { fuelToAdd: 25 } })
    disposers.push(replacement.watchMembers(roomId, () => {}))
    expect((await replacement.claimOrder(roomId, orderId)).ok).toBe(false)
    await driver.rejectOrder(roomId, orderId, 'Cambio pilota: invio manuale richiesto.')
    const next = await send(engineer, roomId)
    const current = await engineer.readOrder(roomId, next)
    expect(current.ok && (current.value as any).targetUid).toBe('replacement')
    await assertFails(set(ref(replacement.io.database, `pitwallV3/rooms/${roomId}/control/claim`), {
      protocolVersion: 3, orderId: next, uid: 'replacement', connectionId: replacement.session.connectionId(),
      claimedAtMs: Date.now() + 60000, leaseUntilMs: Date.now() + 150000,
    }))
    expect((await replacement.claimOrder(roomId, next)).ok).toBe(true)
    expect((await replacement.publishOutcome(roomId, next, { status: 'applied' })).ok).toBe(true)
  })
  it('allows several engineers but only one simultaneous order claim', async () => {
    const { driver, engineer, roomId } = await openRoom()
    const second = await participant('engineer-two')
    expect((await driver.invite(roomId, second.uid)).ok).toBe(true)
    expect((await second.joinRoom(roomId)).ok).toBe(true)
    await second.publishPresence(roomId, { nickname: 'Second', kind: 'engineer', driving: false, runtimeSessionId: 'browser-two' })
    disposers.push(second.watchMembers(roomId, () => {}))
    const firstOrder = await send(engineer, roomId)
    const secondOrder = await send(second, roomId)
    const claims = await Promise.all([driver.claimOrder(roomId, firstOrder), driver.claimOrder(roomId, secondOrder)])
    expect(claims.filter(claim => claim.ok)).toHaveLength(1)
    const winner = claims[0]!.ok ? firstOrder : secondOrder
    expect((await driver.publishOutcome(roomId, winner, { status: 'applied' })).ok).toBe(true)
  })
  it('recovers an old result without releasing a newer claim or applying again', async () => {
    const { driver, engineer, roomId } = await openRoom()
    const first = await send(engineer, roomId)
    expect((await driver.claimOrder(roomId, first)).ok).toBe(true)
    await env.withSecurityRulesDisabled(async context => {
      await update(ref(context.database() as unknown as Database, `pitwallV3/rooms/${roomId}/control/claim`), { leaseUntilMs: Date.now() - 1 })
    })
    const next = await send(engineer, roomId)
    expect((await driver.claimOrder(roomId, next)).ok).toBe(true)
    expect((await driver.publishOutcome(roomId, first, { status: 'partial', fields: {} })).ok).toBe(true)
    expect((await get(ref(driver.io.database, `pitwallV3/rooms/${roomId}/control/claim/orderId`))).val()).toBe(next)
    expect((await driver.claimOrder(roomId, first)).ok).toBe(false)
    expect((await driver.publishOutcome(roomId, first, { status: 'partial' })).ok).toBe(true)
    await driver.publishOutcome(roomId, next, { status: 'failed' })
  })
  it('retains an occupied old room and removes only an empty expired room', async () => {
    const { driver, engineer, roomId } = await openRoom()
    const old = new Date(Date.now() - 72 * 3600000).toISOString()
    await env.withSecurityRulesDisabled(async context => {
      await update(ref(context.database() as unknown as Database, `pitwallV3/rooms/${roomId}/meta`), { createdAt: old })
    })
    const room = await driver.readRoom(roomId)
    expect(room).not.toBeNull()
    await driver.closeDormantRooms([{ ...room!, createdAt: old }], null, new Set())
    expect((await get(ref(driver.io.database, `pitwallV3/rooms/${roomId}/meta`))).exists()).toBe(true)
    await driver.clearPresence(roomId)
    await engineer.clearPresence(roomId)
    await driver.closeDormantRooms([{ ...room!, createdAt: old }], null, new Set())
    await env.withSecurityRulesDisabled(async context => {
      expect((await get(ref(context.database() as unknown as Database, `pitwallV3/rooms/${roomId}`))).exists()).toBe(false)
    })
  })
  it('restores an engineer view after reconnect even when the driver MFD did not change', async () => {
    const { engineer, roomId } = await openRoom()
    let members: unknown[] = []
    disposers.push(engineer.watchMembers(roomId, value => { members = value }))
    await vi.waitFor(() => expect(members).toHaveLength(2))
    goOffline(engineer.io.database)
    await vi.waitFor(() => expect(members).toHaveLength(0))
    goOnline(engineer.io.database)
    await vi.waitFor(() => expect(engineer.session.roomId()).toBe(roomId))
    await vi.waitFor(() => expect(members).toHaveLength(2))
    expect(members.some((member: any) => member.kind === 'driver' && member.strategy?.fuelToAdd === 25)).toBe(true)
  })
  it('fails a quota-exhausted send without creating or automatically retrying an order', async () => {
    const { engineer, roomId } = await openRoom()
    const write = vi.spyOn(engineer.io, 'write').mockRejectedValueOnce(new Error('database/quota-exceeded'))
    const result = await engineer.sendOrder(roomId, { plan, revision: 1 })
    expect(result.ok).toBe(false)
    expect(write).toHaveBeenCalledTimes(1)
    write.mockRestore()
    expect((await get(ref(engineer.io.database, `pitwallV3/rooms/${roomId}/pending`))).exists()).toBe(false)
  })
  it('creates a room, joins an invitation, shares the live snapshot and denies strangers', async () => {
    const { driver, roomId } = await openRoom()
    await assertFails(get(ref(db('stranger'), `pitwallV3/rooms/${roomId}/mfd`)))
    await assertFails(set(ref(db('stranger'), `pitwallV3/rooms/${roomId}/access/stranger`), 'manager'))
    const current = (await get(ref(driver.io.database, `pitwallV3/rooms/${roomId}/mfd`))).val()
    expect(current.strategy.fuelToAdd).toBe(25)
    expect(current.strategy.fittedTyreSet).toBe(2)
  })
  it('claims once, persists an outcome and releases only its own claim atomically', async () => {
    const { driver, engineer, roomId } = await openRoom()
    const orderId = await send(engineer, roomId)
    expect(await driver.claimOrder(roomId, orderId)).toEqual({ ok: true })
    expect((await driver.claimOrder(roomId, orderId)).ok).toBe(false)
    expect(driver.acknowledgedOrder(roomId, orderId)?.orderId).toBe(orderId)
    const outcome = await driver.publishOutcome(roomId, orderId, { status: 'applied', fields: { fuelToAdd: { status: 'applied' } } })
    expect(outcome, JSON.stringify(outcome)).toEqual({ ok: true, value: true })
    expect((await get(ref(driver.io.database, `pitwallV3/rooms/${roomId}/control/claim`))).exists()).toBe(false)
    expect((await engineer.readOrder(roomId, orderId)).ok).toBe(true)
  })
  it('denies forged outcomes, plan changes and unconditional unlock', async () => {
    const { driver, engineer, roomId } = await openRoom()
    const orderId = await send(engineer, roomId)
    expect((await driver.claimOrder(roomId, orderId)).ok).toBe(true)
    await assertFails(update(ref(engineer.io.database, `pitwallV3/rooms/${roomId}/orders/${orderId}`), { status: 'applied' }))
    await assertFails(update(ref(driver.io.database, `pitwallV3/rooms/${roomId}/orders/${orderId}`), { plan: { fuelToAdd: 90 } }))
    await assertFails(set(ref(driver.io.database, `pitwallV3/rooms/${roomId}/control/claim`), null))
    await driver.publishOutcome(roomId, orderId, { status: 'failed' })
  })
  it('revokes membership and presence together; the former member loses MFD access', async () => {
    const { driver, engineer, roomId } = await openRoom()
    expect((await driver.revoke(roomId, 'engineer')).ok).toBe(true)
    await assertFails(get(ref(engineer.io.database, `pitwallV3/rooms/${roomId}/mfd`)))
    await assertFails(engineer.io.write(`rooms/${roomId}/access`, { engineer: 'member' }))
  })
  it('requires owner identity and current protocol for connection records', async () => {
    const driverDb = db('driver')
    const connection = { protocolVersion: 3, uid: 'driver', connectionId: 'one', runtimeSessionId: 'qa', nickname: 'QA', kind: 'driver', driving: false, sourceValid: false, updatedAt: serverTimestamp() }
    await assertSucceeds(set(ref(driverDb, 'pitwallV3/connections/driver/one'), connection))
    await assertFails(set(ref(db('engineer'), 'pitwallV3/connections/driver/one'), connection))
    await assertFails(set(ref(driverDb, 'pitwallV3/connections/driver/two'), { ...connection, connectionId: 'two', protocolVersion: 2 }))
  })
  it('lets an engineer request and withdraw; only the driver can grant access', async () => {
    const grant = { schemaVersion: 1, driverUid: 'driver', engineerUid: 'engineer', status: 'pending', createdBy: 'engineer', createdAt: '2026-09-06', updatedAt: '2026-09-06' }
    const engineer = db('engineer'); const driver = db('driver')
    await assertSucceeds(update(ref(engineer, 'pitwallV3'), { 'grants/driver/engineer': grant, 'outgoing/engineer/driver': true }))
    await assertFails(update(ref(engineer, 'pitwallV3/grants/driver/engineer'), { status: 'granted', scope: 'always' }))
    await assertSucceeds(update(ref(driver, 'pitwallV3/grants/driver/engineer'), { status: 'granted', scope: 'always' }))
    await assertSucceeds(update(ref(engineer, 'pitwallV3/grants/driver/engineer'), { status: 'revoked' }))
    await assertSucceeds(set(ref(engineer, 'pitwallV3/grants/driver/engineer'), grant))
  })
  it('retires the disconnected executor and never claims its order after reconnect', async () => {
    const { driver, engineer, roomId } = await openRoom()
    const orderId = await send(engineer, roomId)
    const previous = driver.session.connectionId()
    goOffline(driver.io.database)
    await vi.waitFor(() => expect(driver.io.online()).toBe(false))
    await env.withSecurityRulesDisabled(async context => {
      await vi.waitFor(async () => expect((await get(ref(context.database() as unknown as Database, `pitwallV3/connections/driver/${previous}`))).exists()).toBe(false))
    })
    goOnline(driver.io.database)
    await vi.waitFor(() => expect(driver.session.roomId()).toBe(roomId))
    expect(driver.session.connectionId()).not.toBe(previous)
    const result = await driver.claimOrder(roomId, orderId)
    expect(result.ok).toBe(false)
    expect(driver.acknowledgedOrder(roomId, orderId)).toBeNull()
  })
  it('publishes no repeated MFD or presence and coalesces a multi-field change', async () => {
    const { driver, roomId } = await openRoom()
    const state = { nickname: 'Driver', kind: 'driver' as const, driving: true, runtimeSessionId: 'runtime', strategy: { fuelToAdd: 25, tyreSet: 2, fittedTyreSet: 2, pressures: { FL: 26, FR: 26, RL: 26, RR: 26 } } }
    await new Promise(resolve => setTimeout(resolve, 150))
    const before = driver.io.metrics.snapshot().writes
    for (let i = 0; i < 50; i++) await driver.publishPresence(roomId, state)
    await new Promise(resolve => setTimeout(resolve, 150))
    expect(driver.io.metrics.snapshot().writes).toBe(before)
    await driver.publishPresence(roomId, { ...state, strategy: { ...state.strategy, fuelToAdd: 30 } })
    await driver.publishPresence(roomId, { ...state, strategy: { ...state.strategy, fuelToAdd: 30, tyreSet: 3, fittedTyreSet: 4 } })
    await vi.waitFor(() => expect(driver.io.metrics.snapshot().writes).toBe(before + 1))
    const changed = (await get(ref(driver.io.database, `pitwallV3/rooms/${roomId}/mfd`))).val()
    expect(changed.strategy.fittedTyreSet).toBe(4)
  })
  it('requires a new manual order after ACC was unavailable', async () => {
    const { driver, engineer, roomId } = await openRoom()
    let accReady = false
    const submit = vi.fn(async () => ({ accepted: true, status: 'applied', fields: {} }))
    const actor = startPitwallRealtimeDriver({ service: driver, uid: 'driver', nickname: 'Driver', runtimeSessionId: 'runtime',
      bindMain: vi.fn(async () => true), electronApi: { pitwallGetLinkStatus: async () => ({ trustedSender: true, driverUid: 'driver', applying: false, accReady, accReason: 'ACC non pronto' }), pitwallSubmitRemoteOrder: submit },
      readVehicle: async () => ({ fingerprint: '0123456789abcdef', label: 'QA car', driving: true, strategy: { fuelToAdd: 25, tyreSet: 2 } }),
    })
    disposers.push(() => actor.stop())
    await actor.openPitwall()
    await vi.waitFor(() => expect(actor.status().state).toBe('open'), { timeout: 2500 })
    const blocked = await send(engineer, roomId)
    await vi.waitFor(async () => {
      const result = await engineer.readOrder(roomId, blocked)
      expect(result.ok && result.value?.status).toBe('rejected')
    })
    accReady = true
    await actor.sync()
    expect(submit).not.toHaveBeenCalled()
    const manual = await send(engineer, roomId)
    await vi.waitFor(async () => {
      const result = await engineer.readOrder(roomId, manual)
      expect(result.ok && result.value?.status).toBe('applied')
    })
    expect(submit).toHaveBeenCalledTimes(1)
    expect(submit.mock.calls[0]?.[0]).toMatchObject({ order: { protocolVersion: 3, orderId: manual } })
  })
})
