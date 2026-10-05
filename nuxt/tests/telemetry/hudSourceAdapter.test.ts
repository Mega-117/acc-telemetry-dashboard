import { describe, expect, it } from 'vitest'
import { hudSourcePolicy, hudTrackMapScene, usesLegacyHudInput } from '~/services/sim/hudSourceAdapter'
import { commonFastPresentation } from '~/services/telemetry/commonFastPresentation'
import { readCommonLive } from '~/services/telemetry/commonLive'
import type { CommonLive } from '~/services/telemetry/commonLive'
import type { FastOverlayState } from '~/types/liveTelemetry'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { normalizeFastState } from '~/services/telemetry/fastStateIngress'

const live = (gameId = 'unseen_sim'): CommonLive => ({ gameId, connected: true, fresh: true, sessionId: 'a', lifecycle: 'live',
  capabilities: { track_position: true, map_sample_interpolation: true, map_start_marker: true }, fields: {
    normalized_position: { value: .3, unit: 'ratio', availability: 'available' },
    initial_track_grip: { value: 1, unit: 'track-grip', availability: 'available' },
    optimal_shift_rpm: { value: 7800, unit: 'rpm', availability: 'available' },
    sector_count: { value: 4, unit: 'count', availability: 'available' },
  } })
const state = (source?: CommonLive) => ({ ...commonFastPresentation(source ?? live()), commonLive: source, context: { car: 'lamborghini_huracan_gt3_evo2' } } as FastOverlayState)
describe('source boundary policy', () => {
  it('all normalized envelopes use one ingress and never leak a prior legacy state', () => {
    for (const game of ['acc', 'evo', 'unseen_sim']) {
      const packet = { schema: 'racercore.live', version: 1, game_id: game, session_id: 's',
        observed_at_ms: Date.now(), ttl_ms: 1000, connected: true, lifecycle: 'live', fields: live().fields, capabilities: live().capabilities }
      expect(normalizeFastState(packet).info?.initialGrip).toBe('Fast')
      expect(normalizeFastState({ ...packet, version: 999, ts: Date.now() / 1000, speed_kmh: 99 }).speedKmh).toBeNull()
      expect(normalizeFastState({ live: { ...packet, connected: false }, speed_kmh: 99 }).speedKmh).toBeNull()
    }
    expect(normalizeFastState({ schema: 'foreign', ts: Date.now() / 1000, speed_kmh: 99 }).speedKmh).toBeNull()
  })
  it('keeps ACC compatibility isolated and preserves its measured profile', () => {
    expect(usesLegacyHudInput(null)).toBe(true)
    expect(hudSourcePolicy(state(live('acc')))).toMatchObject({ compoundTyreBands: true, shiftRpm: 8000 })
    expect(hudTrackMapScene({ ...state(), isLive: true, normalizedCarPosition: .2 }, null, 1000)).toBeDefined()
  })
  it('supports an unseen simulator by declared facts, with no borrowed ACC rules', () => {
    const source = live(), model = state(source)
    expect(hudSourcePolicy(model)).toMatchObject({ compoundTyreBands: false, shiftRpm: 7800, weatherForecast: false, sectorCount: 4, interpolateMap: true })
    expect(model.info?.initialGrip).toBe('Fast')
    expect(hudTrackMapScene(model, null, 1000).cars[0]?.lapPosition).toBe(.3)
    source.capabilities.weather_forecast = true
    expect(hudSourcePolicy(model).weatherForecast).toBe(true)
    source.fields = {}
    expect(hudSourcePolicy(model)).toMatchObject({ shiftRpm: null, sectorCount: 0 })
    expect(hudTrackMapScene(model, null, 1000).cars).toHaveLength(0)
  })
  it('expired facts cannot drive live values even when the game was live', () => {
    const source = readCommonLive({ schema: 'racercore.live', version: 1, game_id: 'unseen_sim', session_id: 's',
      observed_at_ms: 1000, ttl_ms: 1000, connected: true, lifecycle: 'live', fields: live().fields, capabilities: live().capabilities }, 2500)!
    expect(commonFastPresentation(source).isLive).toBe(false)
    expect(hudSourcePolicy(state(source)).shiftRpm).toBeNull()
    expect(hudTrackMapScene(state(source), null, 2500).cars).toHaveLength(0)
  })
  it('HUD renderers do not branch on simulator names', () => {
    for (const file of ['TyreRaceHud.vue', 'TyreSlipHud.vue', 'RaceWeatherHud.vue', 'TelemetryFeatureNotice.vue', 'SectorReferenceSetup.vue']) {
      const text = readFileSync(resolve('app/components/overlay', file), 'utf8')
      expect(text).not.toMatch(/gameId\s*[!=]==?\s*['"](?:acc|evo)['"]/)
    }
    for (const name of ['dashboard', 'sectors', 'trackmap', 'info', 'standings', 'tyres']) {
      const text = readFileSync(resolve('app/pages', name + '-overlay.vue'), 'utf8')
      expect(text).not.toMatch(/(?:gameId|sim(?:\.value)?)\s*[!=]==?\s*['"](?:acc|evo)['"]/)
    }
  })
})
