import { describe, expect, it } from 'vitest'
import { createOwnerOperationTracker } from '~/services/sync/ownerOperationTracker'

describe('ownerOperationTracker', () => {
  it('drena tutte le operazioni owner senza terminare sul primo completamento', async () => {
    let resolveFirst!: () => void
    let resolveSecond!: () => void
    const first = new Promise<void>((resolve) => { resolveFirst = resolve })
    const second = new Promise<void>((resolve) => { resolveSecond = resolve })
    const tracker = createOwnerOperationTracker()

    const trackedFirst = tracker.track(first)
    const trackedSecond = tracker.track(second)
    let drained = false
    const drain = tracker.drain().then(() => { drained = true })

    expect(tracker.size()).toBe(2)
    resolveFirst()
    await trackedFirst
    expect(drained).toBe(false)
    expect(tracker.size()).toBe(1)

    resolveSecond()
    await trackedSecond
    await drain
    expect(drained).toBe(true)
    expect(tracker.size()).toBe(0)
  })

  it('rimuove anche le operazioni fallite e lascia il drain fail-safe', async () => {
    const tracker = createOwnerOperationTracker()
    const tracked = tracker.track(Promise.reject(new Error('sync failed')))

    await expect(tracked).rejects.toThrow('sync failed')
    await expect(tracker.drain()).resolves.toBeUndefined()
    expect(tracker.size()).toBe(0)
  })

  it('attende anche una follow-up registrata mentre il drain e gia in corso', async () => {
    let resolveRoot!: () => void
    let resolveFollowUp!: () => void
    const tracker = createOwnerOperationTracker()
    const root = tracker.track(new Promise<void>((resolve) => { resolveRoot = resolve }))
    let drained = false
    const drain = tracker.drain().then(() => { drained = true })
    const followUp = tracker.track(new Promise<void>((resolve) => { resolveFollowUp = resolve }))

    resolveRoot()
    await root
    expect(drained).toBe(false)

    resolveFollowUp()
    await followUp
    await drain
    expect(drained).toBe(true)
  })
})
