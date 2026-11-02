/**
 * PIP-704: a shown value that drops out for a moment while driving (the Info delta falling to
 * +0.000 or "—" between two real values). The driver sees a flicker; nothing else records it.
 * Only what is on screen counts (the retained model), only while moving on track and away from
 * the line, where a reset is expected. Episodes are summed and sent at most every 5 minutes as
 * one `hud.value_episode` line: {hud, field, episodes, maxMs, periodMs}.
 * Pure logic: the page feeds frames, nothing here touches the DOM or IPC.
 */
export const VALUE_EPISODE_MAX_MS = 2_000
export const VALUE_EPISODE_REPORT_MS = 5 * 60_000

export interface ValueEpisodeFrame {
  now: number
  /** The value on screen is a placeholder (+0.000, —, --). */
  blank: boolean
  /** Driving on track, away from the line and the pit lane: a blank here is not expected. */
  watch: boolean
}

export interface ValueEpisodeSummary { episodes: number, maxMs: number, periodMs: number }

export function createValueEpisodeCounter(report: (summary: ValueEpisodeSummary) => void, startedAt: number) {
  let blankSince: number | null = null
  let sawValue = false
  let episodes = 0, maxMs = 0, periodFrom = startedAt

  function flush(now: number, force = false) {
    if (!episodes || (!force && now - periodFrom < VALUE_EPISODE_REPORT_MS)) return
    report({ episodes, maxMs: Math.round(maxMs), periodMs: Math.round(now - periodFrom) })
    episodes = 0; maxMs = 0; periodFrom = now
  }

  return {
    feed(frame: ValueEpisodeFrame) {
      if (!frame.watch) { blankSince = null; sawValue = false; flush(frame.now); return }
      if (frame.blank) {
        if (sawValue && blankSince === null) blankSince = frame.now
      } else {
        if (blankSince !== null) {
          const duration = frame.now - blankSince
          if (duration <= VALUE_EPISODE_MAX_MS) { episodes++; maxMs = Math.max(maxMs, duration) }
        }
        blankSince = null
        sawValue = true
      }
      flush(frame.now)
    },
    /** Page hidden or closed: send what is pending. */
    final(now: number) { flush(now, true) },
  }
}
