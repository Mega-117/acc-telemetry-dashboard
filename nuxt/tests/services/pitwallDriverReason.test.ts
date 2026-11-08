import { describe, expect, it, vi } from 'vitest'
import { normalizePitwallDriverReason, describePitwallDriverReason, PITWALL_DRIVER_REASON_CODES } from '~/services/pitwall/pitwallDriverReason'
import { memberFromRealtime, type RealtimeConnection } from '~/services/pitwall/pitwallRealtimeProtocol'
import { driverReceiveState } from '~/services/pitwall/pitwallSocialRoom'
import { boundPitwallCrew } from '~/services/pitwall/pitwallLink'
import { describePitwallConceptMember } from '~/utils/pitwallConcept'
import { setLocale, translate } from '~/i18n'
import type { PitwallRealtimeTransport } from '~/services/pitwall/pitwallRealtimeTransport'
vi.mock('~/config/pitwallRealtime', () => ({ getPitwallRealtime: vi.fn() }))
import { createPitwallRealtimeRoomService } from '~/services/pitwall/pitwallRealtimeRoomService'

const connection = (overrides: Partial<RealtimeConnection> = {}): RealtimeConnection => ({ protocolVersion: 3, uid: 'p', connectionId: 'c',
  runtimeSessionId: 'r', roomId: 'room', nickname: 'NitroX', kind: 'engineer', driving: false, sourceValid: false, updatedAt: 1, ...overrides })

describe('PIP-747: the driver reason is a stable code, translated only at the edges', () => {
  it('normalizes absent, known and unknown codes; old clients simply omit it', () => {
    expect(normalizePitwallDriverReason(undefined)).toBeNull()
    expect(normalizePitwallDriverReason('')).toBeNull()
    expect(normalizePitwallDriverReason(7)).toBeNull()
    expect(normalizePitwallDriverReason('menu-open')).toBe('menu-open')
    expect(normalizePitwallDriverReason('a-code-from-a-newer-client')).toBe('unknown')
  })
  it('every code has a short label and a what-to-do text in Italian and English', () => {
    for (const code of PITWALL_DRIVER_REASON_CODES) {
      for (const kind of ['short', 'help'] as const) {
        const key = `pitwall.driverReason.${code}.${kind}` as Parameters<typeof translate>[1]
        expect(translate('it', key)).not.toBe(key)
        expect(translate('en', key).trim()).not.toBe('')
        if (code !== 'replay') expect(translate('en', key)).not.toBe(translate('it', key))
      }
    }
    setLocale('en'); expect(describePitwallDriverReason('profile-missing')).toMatch(/first or last name/)
    setLocale('it'); expect(describePitwallDriverReason('profile-missing')).toMatch(/nome o il cognome/)
  })
  it('a member keeps the reason only while not at the wheel', () => {
    expect(memberFromRealtime(connection({ reasonCode: 'profile-missing' }), null).driverReason).toBe('profile-missing')
    expect(memberFromRealtime(connection({ reasonCode: 'weird' }), null).driverReason).toBe('unknown')
    expect(memberFromRealtime(connection(), null).driverReason).toBeNull()
    expect(memberFromRealtime(connection({ kind: 'driver', driving: true, sourceValid: true, reasonCode: 'menu-open' }), null).driverReason).toBeNull()
  })
  it('the engineer reads why the driver cannot receive, never "offline" for a connected desktop', () => {
    setLocale('it')
    const demoted = { uid: 'p', nickname: 'NitroX', kind: 'engineer', driving: false, driverReason: 'profile-missing' as const }
    expect(driverReceiveState([demoted], [demoted], null, null)).toMatchObject({ state: 'not-ready', uid: 'p', reasonCode: 'profile-missing',
      label: expect.stringMatching(/^NitroX: Nome ACC assente/) })
    const menu = { uid: 'p', nickname: 'NitroX', kind: 'driver', driving: false, driverReason: 'menu-open' as const }
    expect(driverReceiveState([menu], [menu], null, null)).toMatchObject({ state: 'menu', reasonCode: 'menu-open' })
    // Selecting someone else never borrows this reason.
    expect(driverReceiveState([demoted], [demoted], 'other', null).reasonCode).toBeUndefined()
    // Disconnected: only offline, the old reason is not shown as current.
    expect(driverReceiveState([], [{ ...menu }], null, null)).toMatchObject({ state: 'offline' })
    expect(driverReceiveState([{ ...demoted, driverReason: null }], [demoted], null, null).state).toBe('none')
  })
  it('the crew wall says the reason of a present member, not "Al muretto"', () => {
    setLocale('it')
    expect(describePitwallConceptMember({ personId: 'p', role: 'member', driving: false, online: true, driverReason: 'menu-open' })).toBe('Menu ACC aperto')
    expect(describePitwallConceptMember({ personId: 'p', role: 'member', driving: false, online: false, driverReason: 'menu-open' })).toBe('offline')
  })
  it('long crew names are kept for display (the order chooses by EntryList index)', () => {
    const long = `${'A'.repeat(60)} ${'B'.repeat(60)}`
    expect(boundPitwallCrew([{ driverIndex: 0, name: long, current: true }])![0]!.name).toBe(long)
    expect(boundPitwallCrew([{ driverIndex: 0, name: 'x'.repeat(500) }])![0]!.name).toHaveLength(160)
  })
})

describe('PIP-747: the published presence carries the reason, scoped to the driver room', () => {
  function service() {
    const writes: Record<string, unknown>[] = []
    const io = { online: () => true, onConnection: (callback: (online: boolean) => void) => { callback(true); return vi.fn() },
      registerDisconnectUpdates: vi.fn(async () => vi.fn()), serverTimestamp: () => ({ '.sv': 'timestamp' }),
      write: vi.fn(async (_path: string, value: Record<string, unknown>) => { writes.push(value) }) }
    const rooms = createPitwallRealtimeRoomService({ uid: 'p', io: io as unknown as PitwallRealtimeTransport })
    const last = () => { const value = [...writes].reverse().find(entry => Object.keys(entry).some(key => key.startsWith('connections/')))
      return value ? Object.entries(value).find(([key]) => key.startsWith('connections/'))![1] as Record<string, unknown> : null }
    return { rooms, last }
  }
  const driver = { nickname: 'NitroX', kind: 'driver' as const, runtimeSessionId: 'desktop', strategy: { fuelToAdd: 1 } }
  it('a demoted driver keeps its reason in its room, loses it when driving, leaving or deactivated', async () => {
    const { rooms, last } = service()
    await rooms.publishPresence('room', { ...driver, driving: false, reasonCode: 'menu-open' })
    expect(last()).toMatchObject({ kind: 'engineer', roomId: 'room', reasonCode: 'menu-open' })
    await rooms.publishPresence('room', { ...driver, driving: true, reasonCode: 'menu-open' })
    expect(last()).toMatchObject({ kind: 'driver', driving: true })
    expect(last()).not.toHaveProperty('reasonCode')
    await rooms.publishPresence('room', { ...driver, driving: false, reasonCode: null })
    expect(last()).not.toHaveProperty('reasonCode')
    await rooms.publishPresence('room', { ...driver, driving: false, reasonCode: 'profile-missing' })
    await rooms.clearPresence('room')
    expect(last()).not.toHaveProperty('reasonCode')
    await rooms.publishPresence('room', { ...driver, driving: false, reasonCode: 'profile-missing' })
    await rooms.deactivateDriver()
    expect(last()).not.toHaveProperty('reasonCode')
    await rooms.dispose()
  })
  it('an engineer page in another room never shows the reason of the driver room', async () => {
    const { rooms, last } = service()
    await rooms.publishPresence('room-a', { ...driver, driving: false, reasonCode: 'menu-open' })
    await rooms.publishPresence('room-b', { nickname: 'NitroX', kind: 'engineer', driving: false, runtimeSessionId: 'page' })
    expect(last()).toMatchObject({ roomId: 'room-b', kind: 'engineer' })
    expect(last()).not.toHaveProperty('reasonCode')
    await rooms.dispose()
  })
})
