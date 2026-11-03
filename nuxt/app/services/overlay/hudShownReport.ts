import { watch, type Ref } from 'vue'
import { reportHudTrace } from '~/services/overlay/hudTrace'
import type { FastOverlayState } from '~/types/liveTelemetry'

/**
 * PIP-710 (finish line, point 1): what a HUD window actually shows, not only what the logger
 * produced. At every completed lap of the source it shows, each HUD says which lap that is and
 * for how long it has been showing retained (not fresh) data; the main process compares it with
 * the live game state at the same moment (desktop-app/runtime/hudShownCheck.js). A window that
 * fell behind, froze on retained data or shows another car's laps becomes a hud.check KO.
 *
 * Pure bookkeeping here: `createHudShownTracker` is fed states; the composable wires it to Vue.
 */
export interface HudShownFrame { now: number, laps: number | null, fresh: boolean, live: boolean, focused: boolean }
export interface HudShownReport { laps: number, retainedMs: number, focused: boolean }

export function createHudShownTracker(report: (summary: HudShownReport) => void) {
  let lastLaps: number | null = null
  let staleSince: number | null = null
  return {
    feed(frame: HudShownFrame) {
      if (frame.fresh) staleSince = null
      else if (staleSince === null) staleSince = frame.now
      if (frame.laps === null || !Number.isFinite(frame.laps)) return
      if (lastLaps !== null && frame.laps > lastLaps && frame.live) {
        report({ laps: frame.laps, retainedMs: staleSince === null ? 0 : Math.round(frame.now - staleSince),
          focused: frame.focused })
      }
      lastLaps = frame.laps
    },
  }
}

export function useHudShownReport(hud: string, fastState: Readonly<Ref<FastOverlayState>>) {
  const tracker = createHudShownTracker(summary => reportHudTrace('hud.shown', { hud, ...summary }))
  watch(() => [fastState.value.lapsCompleted, fastState.value.isFresh], () => {
    const state = fastState.value
    tracker.feed({ now: Date.now(), laps: state.lapsCompleted, fresh: state.isFresh === true,
      live: state.isLive === true, focused: state.dataSource === 'focused' })
  })
  return tracker
}
