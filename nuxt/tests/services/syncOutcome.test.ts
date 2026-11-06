import { describe, expect, it } from 'vitest'
import { syncOutcomeCounts } from '~/services/sync/syncOutcome'

describe('sync outcome spy (PIP-740)', () => {
  it('counts each status, a single failure is not stuck yet', () => {
    const streaks = new Map<string, number>()
    const counts = syncOutcomeCounts([
      { status: 'created', fileName: 'a' }, { status: 'updated', fileName: 'b' }, { status: 'unchanged', fileName: 'c' },
      { status: 'skipped', fileName: 'd' }, { status: 'error', fileName: 'e' },
    ], streaks, false)
    expect(counts).toEqual({ uploaded: 2, unchanged: 1, skipped: 1, errors: 1, stuck: 0, offline: 0 })
  })

  it('a session failing two cycles in a row while online is stuck; going up clears it', () => {
    const streaks = new Map<string, number>()
    syncOutcomeCounts([{ status: 'error', fileName: 'e' }], streaks, false)
    expect(syncOutcomeCounts([{ status: 'error', fileName: 'e' }], streaks, false).stuck).toBe(1)
    expect(syncOutcomeCounts([{ status: 'created', fileName: 'e' }], streaks, false).stuck).toBe(0)
    expect(syncOutcomeCounts([{ status: 'error', fileName: 'e' }], streaks, false).stuck).toBe(0)
  })

  it('Codex 06/11: an offline failure is never stuck and breaks a run of online failures', () => {
    const streaks = new Map<string, number>()
    syncOutcomeCounts([{ status: 'error', fileName: 'e' }], streaks, false)
    syncOutcomeCounts([{ status: 'error', fileName: 'e' }], streaks, false)
    expect(syncOutcomeCounts([{ status: 'error', fileName: 'e' }], streaks, true).stuck).toBe(0)
    const other = new Map<string, number>()
    syncOutcomeCounts([{ status: 'error', fileName: 'e' }], other, false)
    syncOutcomeCounts([{ status: 'error', fileName: 'e' }], other, true)
    expect(syncOutcomeCounts([{ status: 'error', fileName: 'e' }], other, false).stuck).toBe(0)
  })

  it('failures with the PC offline never make a session stuck', () => {
    const streaks = new Map<string, number>()
    for (let i = 0; i < 3; i++) expect(syncOutcomeCounts([{ status: 'error', fileName: 'e' }], streaks, true)).toMatchObject({ stuck: 0, offline: 1, errors: 1 })
  })
})
