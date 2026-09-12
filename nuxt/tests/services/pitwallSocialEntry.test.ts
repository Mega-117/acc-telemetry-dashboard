import { describe, expect, it, vi } from 'vitest'
import { createPitwallSocialLifecycle } from '~/services/pitwall/pitwallSocialLifecycle'
import type { PitwallRealtimeTransport } from '~/services/pitwall/pitwallRealtimeTransport'

function setup(disconnectedAt: number | null = null, failure?: string) {
  const records: Record<string, unknown> = {
    'rooms/r/slots': { '0': { uid: 'owner', reservedAt: 1 } },
    'rooms/r/occupancy': { owner: { c: { connectedAt: 1, disconnectedAt, nickname: 'owner' } } },
    'rooms/r/access': { owner: 'owner', guest: 'member' },
    'rooms/r/meta': { roomId: 'r', ownerUid: 'owner', label: 'test', createdAt: 1 },
  }
  const transact = vi.fn(async (_path: string, change: (v: unknown) => unknown) => {
    if (failure) throw new Error(failure)
    return { committed: change(null) != null }
  })
  const io = { read: async (p: string) => records[p] ?? null, transact,
    serverNow: () => 100000, serverTimestamp: () => 100000,
    registerDisconnectUpdates: async () => {}, write: async () => {} } as unknown as PitwallRealtimeTransport
  return { transact, service: createPitwallSocialLifecycle({ uid: 'guest', io,
    connectionId: () => 'guest-c', ensureConnection: async () => {}, watchFriends: () => () => {} }) }
}
describe('social room slot admission', () => {
  it('does not replace an old reservation of a connected member', async () => {
    const s=setup(); await s.service.joinRoom('r')
    expect(s.transact.mock.calls[0]?.[0]).toBe('rooms/r/slots/1')
  })
  it('keeps reconnecting members inside the grace period', async () => {
    const s=setup(90000); await s.service.joinRoom('r')
    expect(s.transact.mock.calls[0]?.[0]).toBe('rooms/r/slots/1')
  })
  it('reclaims an expired and absent member reservation', async () => {
    const s=setup(1); await s.service.joinRoom('r')
    expect(s.transact.mock.calls[0]?.[0]).toBe('rooms/r/slots/0')
  })
  it('preserves network failure instead of claiming the room is full', async () => {
    const s=setup(null,'network unavailable'); const result=await s.service.joinRoom('r')
    expect(result).toEqual({ok:false,reason:'network unavailable'})
    expect(s.transact).toHaveBeenCalledTimes(1)
  })
})
