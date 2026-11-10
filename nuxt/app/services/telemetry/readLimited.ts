// Bounded parallel reads, shared by the session laps and the compared session (one rule, no import cycle).

/** QA 10/11: archive laps read at most this many at a time (one by one, a 40-lap race took 6-10 s). */
export const ARCHIVE_READS_AT_ONCE = 4

/**
 * Reads `list` with at most `limit` reads in flight, results in list order. Stops starting new reads as
 * soon as the view changed (`null`). Shared by the session laps and the compared session (one rule).
 */
export async function readLimited<T, R>(list: readonly T[], limit: number, read: (item: T) => Promise<R>,
  isCurrent: () => boolean): Promise<R[] | null> {
  const out = new Array<R>(list.length)
  let next = 0, stopped = false
  const worker = async () => {
    while (next < list.length) {
      if (!isCurrent()) { stopped = true; return }
      const i = next++
      out[i] = await read(list[i]!)
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, list.length)) }, worker))
  return stopped || !isCurrent() ? null : out
}
