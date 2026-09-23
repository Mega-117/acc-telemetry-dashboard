import { afterEach, expect, it, vi } from 'vitest'
const fake = vi.hoisted(() => ({ listen: vi.fn(), stop: vi.fn() }))
vi.mock('firebase/firestore', () => ({ getFirestore: () => ({}), collection: (...parts: unknown[]) => parts,
  query: (...parts: unknown[]) => parts, orderBy: vi.fn(), limit: vi.fn(), doc: vi.fn(), serverTimestamp: vi.fn() }))
vi.mock('~/composables/useFirebaseTracker', () => ({ trackedOnSnapshot: fake.listen,
  trackedAddDoc: vi.fn(), trackedGetDocs: vi.fn(), trackedUpdateDoc: vi.fn(), trackedWriteBatch: vi.fn() }))
import { useActivityFeed } from '~/composables/useActivityFeed'
afterEach(() => { useActivityFeed().stopListening(); vi.clearAllMocks() })
it('reuses the same account subscription and ignores queued callbacks from a previous account', () => {
  const callbacks: Array<(value: unknown) => void> = []
  fake.listen.mockImplementation((_q, _caller, callback) => { callbacks.push(callback); return fake.stop })
  const feed = useActivityFeed()
  feed.listenToActivities('first'); feed.listenToActivities('first')
  expect(fake.listen).toHaveBeenCalledTimes(1)
  const snapshot = { forEach: (visit: (doc: unknown) => void) => visit({ id: 'a', data: () => ({ title: 'Hello' }) }) }
  callbacks[0]!(snapshot)
  expect(feed.activities.value).toHaveLength(1)
  feed.listenToActivities('second')
  expect(fake.stop).toHaveBeenCalledTimes(1)
  expect(feed.activities.value).toEqual([])
  callbacks[0]!(snapshot)
  expect(feed.activities.value).toEqual([])
  callbacks[1]!(snapshot)
  expect(feed.activities.value[0]?.userId).toBe('second')
  feed.stopListening(); callbacks[1]!(snapshot)
  expect(feed.activities.value).toEqual([])
})
it('allows an explicit retry after a denied subscription', () => {
  const warn = vi.spyOn(console, 'error').mockImplementation(() => {})
  let deny!: (error: Error) => void
  fake.listen.mockImplementation((_q, _caller, _callback, error) => { deny = error; return fake.stop })
  const feed = useActivityFeed()
  feed.listenToActivities('first'); deny(new Error('unavailable'))
  feed.listenToActivities('first')
  expect(fake.listen).toHaveBeenCalledTimes(2)
  warn.mockRestore()
})
