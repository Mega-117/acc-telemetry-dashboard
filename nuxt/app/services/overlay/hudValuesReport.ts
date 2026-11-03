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
/** Read only when a report is due: the tyre page reads its texts from the DOM. */
export type HudValuesRead = () => { inputs: HudValues, shown: HudTexts }

export const HUD_VALUES_PERIOD_MS = 60_000

export function createHudValuesReporter(report: (inputs: HudValues, shown: HudTexts) => void,
  periodMs = HUD_VALUES_PERIOD_MS) {
  let lastLaps: number | null = null
  let lastSentAt: number | null = null
  return {
    feed(frame: HudValuesFrame, read: HudValuesRead) {
      const lapDone = frame.laps !== null && lastLaps !== null && frame.laps > lastLaps
      if (frame.laps !== null) lastLaps = frame.laps
      if (!frame.fresh || !frame.live || frame.focused) return false
      const due = lastSentAt === null || frame.now - lastSentAt >= periodMs
      if (!lapDone && !due) return false
      const { inputs, shown } = read()
      if (Object.keys(shown).length === 0) return false   // nothing of this window on screen right now
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

export function useHudValuesReport(hud: 'info' | 'dashboard' | 'tyres', fastState: Readonly<Ref<FastOverlayState>>,
  read: () => { inputs: Record<string, unknown>, shown: HudTexts }) {
  const reporter = createHudValuesReporter((inputs, shown) => reportHudTrace('hud.values', { hud, inputs, shown }))
  // Every new frame (the reporter decides when to send: at the line, or once a minute). After the
  // render (flush 'post'): the tyre page reads its texts from the DOM, and before the render they
  // still showed the previous frame - the first live run (03/11) logged a false KO on all wheels.
  watch(() => fastState.value, () => {
    const state = fastState.value
    reporter.feed({ now: Date.now(), laps: state.lapsCompleted, fresh: state.isFresh === true,
      live: state.isLive === true, focused: state.dataSource === 'focused' }, () => {
      const { inputs, shown } = read()
      return { inputs: cleanValues(inputs), shown }
    })
  }, { flush: 'post' })
  return reporter
}
