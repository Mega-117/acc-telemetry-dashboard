import { describe, expect, it, vi } from 'vitest'
import {
  createSyncMutationJournal,
  recoverPartialSyncMutations,
  runLocalMutationBoundary
} from '~/services/sync/syncMutationJournal'

const delta = {
  trackId: 'monza',
  sessionId: 'session-a',
  dateStart: '2026-08-18T00:00:00.000Z',
  sessionType: 0,
  summary: {},
  car: 'car'
}

describe('syncMutationJournal', () => {
  it('records local and cloud mutations before a later failure', () => {
    const journal = createSyncMutationJournal()
    journal.recordLocalMutation()
    journal.recordUploadMutation({
      status: 'created',
      sessionId: 'session-a',
      dirtyTrack: 'monza',
      projectionDelta: delta
    })
    journal.recordUploadMutation({ status: 'error', sessionId: 'ignored' })
    journal.recordUploadMutation({
      status: 'error',
      committedStatus: 'updated',
      sessionId: 'session-b',
      dirtyTrack: 'spa'
    })

    expect(journal.snapshot()).toMatchObject({
      localStateChanged: true,
      cloudChangedCount: 2,
      dirtySessionIds: ['session-a', 'session-b'],
      dirtyTracks: ['monza', 'spa'],
      trackBestDeltas: [delta],
      userProjectionDeltas: [{ ...delta, status: 'created' }]
    })
  })

  it('marks a rejected local mutation boundary without dirtying a successful no-op', async () => {
    const journal = createSyncMutationJournal()

    await expect(runLocalMutationBoundary({
      journal,
      run: async () => ({ updated: 0 }),
      didMutate: result => result.updated > 0
    })).resolves.toEqual({ updated: 0 })
    expect(journal.snapshot().localStateChanged).toBe(false)

    await expect(runLocalMutationBoundary({
      journal,
      run: async () => { throw new Error('partial main commit') },
      didMutate: result => result.updated > 0
    })).rejects.toThrow('partial main commit')
    expect(journal.snapshot().localStateChanged).toBe(true)
  })

  it('invalidates after any partial mutation and reconciles cloud only for a current lease', async () => {
    const invalidate = vi.fn()
    const reconcileCloud = vi.fn(async () => {})
    const journal = createSyncMutationJournal()
    journal.recordUploadMutation({ status: 'updated', sessionId: 'session-a' })

    await expect(recoverPartialSyncMutations({
      snapshot: journal.snapshot(),
      isCurrent: () => true,
      invalidate,
      reconcileCloud
    })).resolves.toBe(true)
    expect(invalidate).toHaveBeenCalledTimes(1)
    expect(reconcileCloud).toHaveBeenCalledWith(expect.objectContaining({ cloudChangedCount: 1 }))

    reconcileCloud.mockClear()
    await recoverPartialSyncMutations({
      snapshot: journal.snapshot(),
      isCurrent: () => false,
      invalidate,
      reconcileCloud
    })
    expect(reconcileCloud).not.toHaveBeenCalled()
  })

  it('does nothing when no mutation happened', async () => {
    const invalidate = vi.fn()
    const reconcileCloud = vi.fn(async () => {})
    await expect(recoverPartialSyncMutations({
      snapshot: createSyncMutationJournal().snapshot(),
      isCurrent: () => true,
      invalidate,
      reconcileCloud
    })).resolves.toBe(false)
    expect(invalidate).not.toHaveBeenCalled()
    expect(reconcileCloud).not.toHaveBeenCalled()
  })
})
