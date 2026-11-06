// Spy for "saved on the PC but never reached Firebase" (dev.14 plan, point 2): one diary line per sync
// cycle with counts only. A session that fails one cycle can still go up at the next; one that fails
// two cycles in a row while the PC is online is stuck: that is the KO read from R2 (`use.sync.sessions`).

export type SyncOutcomeResult = { status: 'created' | 'updated' | 'unchanged' | 'skipped' | 'error', fileName?: string }

export type SyncOutcomeCounts = {
  uploaded: number
  unchanged: number
  skipped: number
  errors: number
  /** Sessions that failed this cycle and the one before, with the PC online. */
  stuck: number
  offline: number
}

export const STUCK_AFTER_CYCLES = 2

export function syncOutcomeCounts(results: SyncOutcomeResult[], streaks: Map<string, number>, offline: boolean): SyncOutcomeCounts {
  const counts: SyncOutcomeCounts = { uploaded: 0, unchanged: 0, skipped: 0, errors: 0, stuck: 0, offline: offline ? 1 : 0 }
  for (const result of results) {
    const name = result.fileName || ''
    if (result.status === 'error') {
      counts.errors++
      if (!name) continue
      // Offline the failure is expected: it does not count towards stuck.
      const streak = offline ? (streaks.get(name) || 0) : (streaks.get(name) || 0) + 1
      streaks.set(name, streak)
      if (streak >= STUCK_AFTER_CYCLES) counts.stuck++
      continue
    }
    if (name) streaks.delete(name)
    if (result.status === 'created' || result.status === 'updated') counts.uploaded++
    else if (result.status === 'unchanged') counts.unchanged++
    else counts.skipped++
  }
  return counts
}
