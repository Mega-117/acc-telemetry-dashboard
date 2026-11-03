import { watch, type Ref } from 'vue'
import { reportHudTrace } from '~/services/overlay/hudTrace'
import type { FastOverlayState } from '~/types/liveTelemetry'

/**
 * PIP-711 (coverage package A): a HUD window says which numbers it drew from and which texts it
 * put on screen, read at the same moment. The main process reads the texts back with its own rules
 * and writes a hud.check KO for every field that does not match (desktop-app/runtime/hudValuesCheck.js).
 * Sent at every completed lap and at most once a minute in between, only while the data is fresh,
 * live and the driver's own car: retained data and another car are hud.shown's business.
 *
 * Pure bookkeeping here: `createHudValuesReporter` is fed frames; the composable wires it to Vue.
 */
export type HudValues = Record<string, number | boolean | null>
export type HudTexts = Record<string, string>
export interface HudValuesFrame {
  now: number
  laps: number | null
  fresh: boolean
  live: boolean
  focused: boolean
}
/** Read only when a report is due: the tyre page reads its texts from the DOM. A view on another
 *  car may answer null, "nothing comparable yet": the report stays due and the next frame retries
 *  (Codex 03/11: the roster a moment behind used up the minute with an empty pass). */
export type HudValuesRead = () => { inputs: HudValues, shown: HudTexts } | null

export const HUD_VALUES_PERIOD_MS = 60_000

/** After the camera moves to another car (or back), the view is checked a few seconds later, once
 *  both feeds have caught up (PIP-713). */
export const HUD_VALUES_VIEW_SETTLE_MS = 5_000

export function createHudValuesReporter(report: (inputs: HudValues, shown: HudTexts) => void,
  periodMs = HUD_VALUES_PERIOD_MS) {
  let lastLaps: number | null = null
  let lastSentAt: number | null = null
  let lastFocused: boolean | null = null
  return {
    /** The next frame reports at once: a page that just appeared (the damage page shows for
     *  12 s after a hit) is checked while it is on screen, not at the next line (Codex 03/11). */
    forceNext() { lastSentAt = null },
    /** `readFocused`: how this window reads its view on another car (PIP-713). Without it, a view on
     *  another car is not reported (its own-car rules would not apply). */
    feed(frame: HudValuesFrame, read: HudValuesRead, readFocused?: HudValuesRead) {
      if (lastFocused !== null && frame.focused !== lastFocused) {
        // Another car's laps are not ours: no "lap done" across the switch, and a check once settled.
        lastLaps = null
        lastSentAt = frame.now - periodMs + HUD_VALUES_VIEW_SETTLE_MS
      }
      lastFocused = frame.focused
      const lapDone = frame.laps !== null && lastLaps !== null && frame.laps > lastLaps
      if (frame.laps !== null) lastLaps = frame.laps
      // A view on another car is read even when its feed went stale: a view kept on old data while
      // the game runs is exactly what it must catch (Codex 03/11). Its reader decides.
      if (frame.focused ? !readFocused : !frame.fresh || !frame.live) return false
      const due = lastSentAt === null || frame.now - lastSentAt >= periodMs
      if (!lapDone && !due) return false
      const reading = frame.focused && readFocused ? readFocused() : read()
      if (!reading) {
        if (lapDone) lastSentAt = frame.now - periodMs   // keep the lap's check due for the next frame
        return false
      }
      const { inputs, shown } = reading
      // Sent even with nothing on screen (every row hidden): the main process counts it, so a valid
      // setting is not mistaken for a silent spy (Codex 03/11).
      lastSentAt = frame.now
      report(inputs, shown)
      return true
    },
  }
}

/** Finite numbers, booleans or null only: anything else is not sent rather than sent wrong. */
export function cleanValues(values: Record<string, unknown>): HudValues {
  const clean: HudValues = {}
  for (const [key, value] of Object.entries(values)) {
    if (value === null || typeof value === 'boolean') clean[key] = value
    else if (typeof value === 'number' && Number.isFinite(value)) clean[key] = value
    else if (value === undefined) clean[key] = null
  }
  return clean
}

export function useHudValuesReport(hud: 'info' | 'dashboard' | 'tyres' | 'standings' | 'trackmap', fastState: Readonly<Ref<FastOverlayState>>,
  read: () => { inputs: Record<string, unknown>, shown: HudTexts },
  readFocused?: () => { inputs: Record<string, unknown>, shown: HudTexts } | null,
  /** Another feed the view on another car is compared with: its updates also trigger a read, so a
   *  check waiting on it is not left for the next own frame (Codex 03/11: never sent at all). */
  alsoOn?: Readonly<Ref<unknown>>) {
  const reporter = createHudValuesReporter((inputs, shown) => reportHudTrace('hud.values', { hud, inputs, shown }))
  // Every new frame (the reporter decides when to send: at the line, or once a minute). After the
  // render (flush 'post'): the tyre page reads its texts from the DOM, and before the render they
  // still showed the previous frame - the first live run (03/11) logged a false KO on all wheels.
  watch(() => [fastState.value, alsoOn?.value], () => {
    const state = fastState.value
    reporter.feed({ now: Date.now(), laps: state.lapsCompleted, fresh: state.isFresh === true,
      live: state.isLive === true, focused: state.dataSource === 'focused' }, () => {
      const { inputs, shown } = read()
      return { inputs: cleanValues(inputs), shown }
    }, readFocused && (() => {
      const reading = readFocused()
      return reading && { inputs: cleanValues({ ...reading.inputs, specMode: true }), shown: reading.shown }
    }))
  }, { flush: 'post' })
  return reporter
}
