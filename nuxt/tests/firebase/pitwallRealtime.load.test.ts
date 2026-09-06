import { readFileSync, writeFileSync } from 'node:fs'
import { initializeTestEnvironment, type RulesTestEnvironment } from '@firebase/rules-unit-testing'
import { goOffline, type Database } from 'firebase/database'
import { afterAll, expect, it, vi } from 'vitest'
import { createPitwallRealtimeTransport } from '~/services/pitwall/pitwallRealtimeTransport'
import { createPitwallRealtimeRoomService } from '~/services/pitwall/pitwallRealtimeRoomService'

let env: RulesTestEnvironment | null = null
const clients: ReturnType<typeof createPitwallRealtimeRoomService>[] = []
const stops: Array<() => void> = []
async function groups<T>(items: T[], limit: number, operation: (item: T) => Promise<void>) {
  for (let offset = 0; offset < items.length; offset += limit) await Promise.all(items.slice(offset, offset + limit).map(operation))
}
afterAll(async () => {
  for (const stop of stops) stop()
  await groups(clients, 25, async client => { await client.dispose(); client.io.dispose(); goOffline(client.io.database) })
  await env?.cleanup()
}, 60000)

it('500 distinct authenticated SDK clients stay connected through 250 rooms, MFD changes and manual orders', async () => {
  if (!process.env.FIREBASE_DATABASE_EMULATOR_HOST) throw new Error('Emulator only')
  env = await initializeTestEnvironment({ projectId: 'demo-pitwall-load', database: { host: '127.0.0.1', port: 9000,
    rules: readFileSync(new URL('../../../database.rules.json', import.meta.url), 'utf8') } })
  await env.clearDatabase()
  const started = Date.now()
  await groups(Array.from({ length: 500 }, (_, id) => id), 25, async id => {
    const uid = `load-${id}`
    const database = env!.authenticatedContext(uid).database() as unknown as Database
    const io = createPitwallRealtimeTransport(database)
    const service = createPitwallRealtimeRoomService({ uid, io })
    clients[id] = service
    await vi.waitFor(() => expect(io.online()).toBe(true), { timeout: 15000 })
  })
  expect(new Set(clients.map(client => client.io.database)).size).toBe(500)
  expect(clients.filter(client => client.io.online())).toHaveLength(500)
  const rooms: Array<{ driver: typeof clients[number], engineer: typeof clients[number], roomId: string }> = []
  await groups(Array.from({ length: 250 }, (_, id) => id), 20, async id => {
    const driver = clients[id * 2]!
    const engineer = clients[id * 2 + 1]!
    const opened = await driver.ensureRoomForVehicle({ fingerprint: id.toString(16).padStart(16, '0'), label: 'Emulated race', seedAllowedUids: [engineer.uid] })
    if (!opened.ok) throw new Error(opened.reason)
    const roomId = opened.value.roomId
    const joined = await engineer.joinRoom(roomId)
    if (!joined.ok) throw new Error(joined.reason)
    const driverPresence = await driver.publishPresence(roomId, { nickname: 'Driver', kind: 'driver', driving: true, runtimeSessionId: driver.uid,
      strategy: { fuelToAdd: 20, tyreSet: 1, pressures: { FL: 26, FR: 26, RL: 26, RR: 26 } } })
    const engineerPresence = await engineer.publishPresence(roomId, { nickname: 'Engineer', kind: 'engineer', driving: false, runtimeSessionId: engineer.uid })
    expect(driverPresence.ok && engineerPresence.ok).toBe(true)
    for (const client of [driver, engineer]) stops.push(client.watchMembers(roomId, () => {}))
    rooms[id] = { driver, engineer, roomId }
  })
  // These are actual SDK connections to the local rules emulator, not 500 mocked callbacks.
  expect(clients.filter(client => client.io.online())).toHaveLength(500)
  await new Promise(resolve => setTimeout(resolve, 150))
  const readyMetrics = clients.map(client => client.io.metrics.snapshot())
  await groups(rooms, 20, async ({ driver, engineer, roomId }) => {
    for (let change = 0; change < 20; change++) {
      await driver.publishPresence(roomId, { nickname: 'Driver', kind: 'driver', driving: true, runtimeSessionId: driver.uid,
        strategy: { fuelToAdd: 21 + change, tyreSet: 1, pressures: { FL: 26, FR: 26, RL: 26, RR: 26 } } })
      await new Promise(resolve => setTimeout(resolve, 110))
    }
    for (let order = 0; order < 10; order++) {
      const sent = await engineer.sendOrder(roomId, { plan: { fuelLiters: 30 + order }, revision: order + 1 })
      if (!sent.ok) throw new Error(sent.reason)
      const claimed = await driver.claimOrder(roomId, sent.value)
      if (!claimed.ok) throw new Error(claimed.detail)
      expect(driver.acknowledgedOrder(roomId, sent.value)?.orderId).toBe(sent.value)
      // Transport/protocol load only. No ACC bridge exists in this test.
      const outcome = await driver.publishOutcome(roomId, sent.value, { status: 'applied', fields: { fuelLiters: { outcome: 'verified', observed: 30 + order, via: 'memory' } } })
      if (!outcome.ok) throw new Error(outcome.reason)
    }
  })
  expect(clients.filter(client => client.io.online())).toHaveLength(500)
  writeFileSync(new URL('./pitwall-load-result.json', import.meta.url), JSON.stringify({ kind: 'emulator-actual-sdk', users: 500, rooms: 250,
    mfdChangesPerRoom: 20, ordersPerRoom: 10, elapsedMs: Date.now() - started, readyMetrics,
    finalMetrics: clients.map(client => client.io.metrics.snapshot()), note: 'Logical JSON payload metrics; excludes TLS/WebSocket overhead and does not measure Firebase billing.' }, null, 2))
}, 240000)
