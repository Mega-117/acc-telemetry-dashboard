import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { normalizePitPrediction } from '~/composables/useFastStatePoller'
import { HUD_OVERLAY_INTERACTIONS } from '~/composables/useHudOverlay'

const read = (file: string) => readFileSync(resolve(process.cwd(), file), 'utf8')

describe('Track Map overlay window contract', () => {
  const page = read('app/pages/trackmap-overlay.vue')

  it('exposes a draggable Electron app region for HUD placement mode', () => {
    expect(page).toMatch(/\.overlay-root\{[^}]*-webkit-app-region:\s*drag[^}]*\}/s)
    expect(page).toMatch(/\.overlay-canvas\{[^}]*-webkit-app-region:\s*drag[^}]*\}/s)
    expect(HUD_OVERLAY_INTERACTIONS.trackmap).toEqual({ surfaceSelector: '.overlay-canvas', controlSelector: '' })
  })

  it('follows the shared HUD lifecycle and reveals only after settings and the first map', () => {
    const order = [
      'overlay.start(route.query.scale)',
      'overlay.startInteractionSurface()',
      'await overlay.loadSettings()',
      'await loadTrackMap(track.value)',
      'await overlay.notifyContentReady()',
    ].map(step => page.indexOf(step))
    expect(order.every(index => index >= 0)).toBe(true)
    expect(order).toEqual([...order].sort((a, b) => a - b))
  })

  it('only wires sources: roster, local fast state and bundled coordinates over IPC', () => {
    expect(page).toContain("useHudOverlay('trackmap', getApi)")
    expect(page).toContain('useStandingsState(getApi)')
    expect(page).toContain('useFastStatePoller(getApi)')
    expect(page).toContain('hudOverlayGetTrackMap')
    expect(page).toContain('pitPrediction: fast.pitPrediction')
    // The rejoin point is the logger's job: no lap time or pit time maths in the renderer.
    expect(page).not.toMatch(/pitTime|lapTime|avgLap/i)
    expect(read('app/components/overlay/TrackMapHud.vue')).not.toMatch(/spline/i)
  })

  it('switches to the circle from the HUD setting, whatever the track', () => {
    expect(page).toMatch(/circleView === true\s*\?\s*TRACK_MAP_CIRCLE_KEY\s*:\s*telemetry\.fastState\.value\.context\?\.track/)
    expect(page).toContain('isCircle ? TRACK_MAP_CIRCLE_FILL : 1')
  })

  it('never commits track coordinates to the public frontend repository', () => {
    expect(page).not.toMatch(/import .*track_maps|\.json'/)
  })
})

describe('normalizePitPrediction', () => {
  const raw = {
    available: true, reason: null, spline: 0.42, confidence: 'high', pit_time_s: 61.5, pit_time_base_s: 68,
    pit_time_source: 'acc-drive-sg30', in_pit_lane: true,
    damage: { visible: true, spline: 0.31, confidence: 'low', pit_time_s: 88 },
  }

  it('maps the logger contract', () => {
    expect(normalizePitPrediction(raw)).toEqual({
      available: true, reason: null, spline: 0.42, confidence: 'high', pitTimeS: 61.5, pitTimeBaseS: 68,
      pitTimeSource: 'acc-drive-sg30', inPitLane: true,
      damage: { visible: true, spline: 0.31, confidence: 'low' },
    })
  })

  it('is unavailable unless the logger says so and the point is usable', () => {
    expect(normalizePitPrediction(null)).toBeNull()
    expect(normalizePitPrediction('x')).toBeNull()
    expect(normalizePitPrediction({ ...raw, available: false, reason: 'insufficient-history' }))
      .toMatchObject({ available: false, reason: 'insufficient-history' })
    expect(normalizePitPrediction({ ...raw, spline: 1.4 })).toMatchObject({ available: false, spline: null })
    expect(normalizePitPrediction({ ...raw, spline: null })!.available).toBe(false)
    expect(normalizePitPrediction({ ...raw, confidence: 'certain' })!.confidence).toBeNull()
    expect(normalizePitPrediction({ ...raw, damage: { visible: true, spline: -1 } })!.damage)
      .toEqual({ visible: false, spline: null, confidence: null })
    expect(normalizePitPrediction({ ...raw, damage: undefined })!.damage.visible).toBe(false)
  })
})
