import { beforeEach, describe, expect, it, vi } from 'vitest'

// Beta seats (28/10): client side of the seat claim. The cap itself is enforced by Rules (emulator test).
const store = new Map<string, Record<string, unknown>>()
let failNextRead = false
vi.mock('~/config/firebase', () => ({ db: {} }))
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, path: string) => path,
  serverTimestamp: () => 'now',
}))
vi.mock('~/composables/useFirebaseTracker', () => ({
  trackedGetDoc: async (path: string) => {
    if (failNextRead) { failNextRead = false; throw Object.assign(new Error('offline'), { code: 'unavailable' }) }
    const data = store.get(path)
    return { exists: () => !!data, data: () => data }
  },
  trackedUpdateDoc: async (path: string, data: Record<string, unknown>) => { store.set(path, { ...store.get(path), ...data }) },
  trackedRunTransaction: async (_db: unknown, _caller: string, _ref: string, fn: (t: unknown) => Promise<unknown>) => {
    const writes: Array<[string, Record<string, unknown>]> = []
    const result = await fn({
      get: async (path: string) => ({ exists: () => store.has(path), data: () => store.get(path) }),
      update: (path: string, data: Record<string, unknown>) => writes.push([path, { ...store.get(path), ...data }]),
      set: (path: string, data: Record<string, unknown>) => writes.push([path, data]),
    })
    for (const [path, data] of writes) store.set(path, data)
    return result
  },
}))

const { ensureBetaSeat, setBetaSeatLimit, readBetaSeats } = await import('~/services/auth/betaSeatService')

describe('betaSeatService', () => {
  beforeEach(() => { store.clear(); store.set('config/betaSeats', { taken: 1, limit: 2 }); failNextRead = false })

  it('keeps an existing seat without touching the counter', async () => {
    store.set('betaSeats/a', { at: 'then' })
    expect(await ensureBetaSeat('a')).toBe('granted')
    expect(store.get('config/betaSeats')).toEqual({ taken: 1, limit: 2 })
  })

  it('takes the last free seat, then reports full', async () => {
    expect(await ensureBetaSeat('b')).toBe('granted')
    expect(store.get('config/betaSeats')).toEqual({ taken: 2, limit: 2 })
    expect(store.has('betaSeats/b')).toBe(true)
    expect(await ensureBetaSeat('c')).toBe('full')
    expect(store.has('betaSeats/c')).toBe(false)
  })

  it('no configuration counts as full; an unreachable Firestore is unknown, not full', async () => {
    store.delete('config/betaSeats')
    expect(await ensureBetaSeat('d')).toBe('full')
    failNextRead = true
    expect(await ensureBetaSeat('d')).toBe('unknown')
  })

  it('the admin changes only the limit, within bounds', async () => {
    await setBetaSeatLimit(60)
    expect(await readBetaSeats()).toEqual({ taken: 1, limit: 60 })
    await expect(setBetaSeatLimit(-1)).rejects.toThrow('invalid-beta-seat-limit')
    await expect(setBetaSeatLimit(1.5)).rejects.toThrow('invalid-beta-seat-limit')
  })
})
