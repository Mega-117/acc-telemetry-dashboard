import { describe, expect, it, vi } from 'vitest'
import { createFriendRequestQueue, type FriendRequestSnapshot } from '~/services/pitwall/friendRequestQueue'

function setup() {
  let serial = 0
  let state!: FriendRequestSnapshot
  const respond = vi.fn(async (_id: string, _accept: boolean) => true)
  const queue = createFriendRequestQueue({ token: () => String(++serial), publish: value => { state = value }, respond })
  const sync = (ids: string[], uid: string | null = 'me') => queue.sync(uid, ids.map(personId => ({ personId, nickname: `@${personId}` })))
  const decide = (accept = true) => queue.decide({ session: state.session!, id: state.requests[0]!.id, accept })
  return { queue, respond, sync, decide, state: () => state }
}
describe('Control K friendship queue', () => {
  it('does not republish unchanged snapshots on background presence ticks', () => {
    const publish = vi.fn()
    const queue = createFriendRequestQueue({ publish, respond: vi.fn(), token: () => 'token' })
    queue.sync('me', [{ personId: 'A', nickname: 'A' }])
    queue.sync('me', [{ personId: 'A', nickname: 'A' }])
    expect(publish).toHaveBeenCalledTimes(1)
  })
  it('preserves first-seen order, deduplicates and updates names without changing request IDs', () => {
    const s = setup(); s.sync(['A', 'B', 'A']); const first = s.state().requests[0]!.id
    s.queue.sync('me', [{ personId: 'B', nickname: 'Bee' }, { personId: 'A', nickname: 'Ay' }, { personId: 'C', nickname: 'See' }])
    expect(s.state().requests.map(row => row.personId)).toEqual(['A', 'B', 'C'])
    expect(s.state().requests[0]).toMatchObject({ id: first, nickname: 'Ay' })
    s.sync(['B', 'C']); expect(s.state().requests[0]!.personId).toBe('B')
  })
  it('accepts/rejects one at a time, suppresses stale echoes until server removal, then allows a new request', async () => {
    const s = setup(); s.sync(['A', 'B']); await s.decide()
    expect(s.respond).toHaveBeenCalledWith('A', true)
    s.sync(['A', 'B']); expect(s.state().requests.map(row => row.personId)).toEqual(['B'])
    await s.decide(false); expect(s.respond).toHaveBeenLastCalledWith('B', false)
    s.sync([]); expect(s.state().requests).toEqual([])
    s.sync(['A']); expect(s.state().requests).toHaveLength(1)
  })
  it('rejects stale tokens and double submissions, retaining the active card during live updates', async () => {
    const s = setup(); s.sync(['A', 'B'])
    let finish!: (value: boolean) => void
    s.respond.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    const pending = s.decide(); await s.decide(false)
    s.sync(['B']); expect(s.state().requests[0]!.personId).toBe('A')
    expect(s.respond).toHaveBeenCalledTimes(1)
    finish(true); await pending
    await s.queue.decide({ session: 'old', id: 'old', accept: true })
    expect(s.state().requests[0]!.personId).toBe('B'); expect(s.respond).toHaveBeenCalledTimes(1)
  })
  it('retains a partially failed request even if its first grant disappeared, and allows retry', async () => {
    const s = setup(); s.sync(['A', 'B'])
    s.respond.mockImplementationOnce(async () => { s.sync(['B']); return false })
    await s.decide(false)
    s.sync(['B']); expect(s.state().error).toContain('non confermata')
    expect(s.state().requests[0]!.personId).toBe('A')
    await s.decide(false); expect(s.state().requests[0]!.personId).toBe('B')
    expect(s.state().error).toBeNull()
  })
  it('does not lose requests on thrown errors or apply late completion to another account', async () => {
    const s = setup(); s.sync(['A']); s.respond.mockRejectedValueOnce(new Error('offline')); await s.decide()
    expect(s.state().requests).toHaveLength(1); expect(s.state().busy).toBe(false)
    let finish!: (value: boolean) => void
    s.respond.mockImplementationOnce(() => new Promise(resolve => { finish = resolve }))
    const pending = s.decide(); s.sync(['C'], 'other'); const other = s.state()
    finish(true); await pending; expect(s.state()).toEqual(other)
    s.sync([], null); expect(s.state()).toMatchObject({ session: null, requests: [], busy: false, error: null })
  })
})
