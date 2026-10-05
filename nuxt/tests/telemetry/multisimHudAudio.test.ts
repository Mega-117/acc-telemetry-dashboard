// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TelemetryFeatureNotice from '~/components/overlay/TelemetryFeatureNotice.vue'
import RaceWeatherHud from '~/components/overlay/RaceWeatherHud.vue'
import TrackMapHud from '~/components/overlay/TrackMapHud.vue'
import type { CommonLive } from '~/services/telemetry/commonLive'
import { commonFastPresentation } from '~/services/telemetry/commonFastPresentation'
import type { FastOverlayState } from '~/composables/useFastStatePoller'
import { buildCommonTrackMapScene } from '~/services/sim/commonTrackMapScene'
import { audioContextKey, audioFeatureAvailable, bindAudioCue } from '~/services/spotter/audioSourceContext'
import { referenceMatchesContext } from '~/services/spotter/trackVoiceReferences'
import { resolveSpotterSessionMode } from '~/services/spotter/spotterSessionPolicy'
import { routeOverlayTelemetry } from '~/services/overlay/spectatorTelemetry'
import { commonSectorHud } from '~/services/telemetry/commonSectorHud'
import { featureAvailability, TELEMETRY_FEATURES } from '~/services/telemetry/featureAvailability'
import { buildInfoPresentation } from '~/utils/infoPresentation'

const live = (): CommonLive => ({ gameId: 'synthetic', sessionId: '1', connected: true, fresh: true,
  lifecycle: 'live', sessionKind: 'race', identity: { track: 'Spa', car: 'EV', variant: 'short' },
  capabilities: { track_position: true, fuel: false }, fields: {
    normalized_position: { value: .4, availability: 'available', unit: 'ratio' },
    speed: { value: 110, availability: 'available', unit: 'km/h' },
  } })
const frame = (source = live()) => ({ ...commonFastPresentation(source), sectorHud: null } as FastOverlayState)

describe('multisim HUD and audio isolation', () => {
  it('distinguishes missing forecasts, map geometry and the lap origin', async () => {
    const source = live(); source.gameId = 'evo'
    const weather = mount(RaceWeatherHud, { props: { fastState: frame(source) } })
    expect(weather.text()).toContain('Previsioni meteo non disponibili')
    expect(weather.findAll('[data-rain-intensity]')).toHaveLength(0)
    weather.unmount()
    const notice = mount(TelemetryFeatureNotice, { props: { live: source, feature: 'trackMap', unsupportedText: 'Sagoma pista non disponibile: vista circolare' } })
    expect(notice.text()).toContain('Sagoma pista')
    await notice.setProps({ live: { ...source, fresh: false } })
    expect(notice.text()).toContain('In attesa')
    notice.unmount()
    const map = mount(TrackMapHud, { props: { view: { outlinePath: '', caption: null, dots: [], markers: [] }, outline: [{ x: 10, y: 20 }, { x: 30, y: 40 }], showStart: true } })
    expect(map.get('.track-map__start').attributes('transform')).toBe('translate(10 20)')
    await map.setProps({ showStart: false })
    expect(map.find('.track-map__start').exists()).toBe(false)
    map.unmount()
  })
  it('presents EVO tyre and timing facts without ACC tyre rules or invented sectors', () => {
    const source = live()
    source.gameId = 'evo'
    source.fields.initial_track_grip = { value: 0, availability: 'available', unit: 'track-grip' }
    source.fields['tyre.FL.temperature_target_ratio'] = { value: .5, availability: 'available', unit: 'ratio' }
    source.capabilities = { tyre_pressure: true, lap_timing: true, lap_validity: true }
    for (const id of ['FL', 'FR', 'RL', 'RR']) {
      source.fields[`tyre.${id}.pressure`] = { value: 24.5, availability: 'available', unit: 'psi' }
      source.fields[`tyre.${id}.core_temperature`] = { value: 60, availability: 'available', unit: 'C' }
    }
    for (const [key, value] of Object.entries({ best_lap_time: 114876, optimal_lap_time: 113200, lap_delta: -396 })) {
      source.fields[key] = { value, availability: 'available', unit: 'ms' }
    }
    const state = frame(source)
    expect(state.tyres).toHaveLength(4)
    expect(state.tyres[0]).toMatchObject({ pressurePsi: 24.5, coreTempC: 60, wheelSlipScaled: null })
    expect(featureAvailability(source, TELEMETRY_FEATURES.tyrePressure).available).toBe(true)
    const info = buildInfoPresentation(state)
    expect(info.rows.find(row => row.id === 'grip')).toMatchObject({ label: 'Grip:', value: 'Green' })
    expect(state.tyres[0]?.temperatureTargetRatio).toBe(.5)
    expect(state.info?.grip).toBeNull()
    expect(info.rows.find(row => row.id === 'best')?.value).toBe('1:54.876')
    expect(state.info?.delta).toMatchObject({ ms: -396, available: true, side: 'negative' })
    expect(state.info?.stintTimeLeftMs).toBeNull()
    expect(state.sectorHud).toBeNull()
    source.fields.lap_delta = { value: null, availability: 'stale', unit: 'ms' }
    expect(frame(source).info?.delta.available).toBe(false)
  })
  it('uses declared sector cardinality with independent references and incomplete splits', () => {
    const source = live()
    source.capabilities.sector_timing = true
    for (const count of [0, 2, 3, 4, 33]) {
      source.fields.sector_count = { value: count, availability: 'available', unit: 'count' }
      source.fields['sector.1.time'] = { value: 30000, availability: 'available', unit: 'ms' }
      source.fields['sector.1.reference'] = { value: 31000, availability: 'available', unit: 'ms' }
      source.fields.current_sector = { value: 2, availability: 'available', unit: 'index' }
      const hud = commonSectorHud(source)
      if (count === 0 || count === 33) expect(hud).toBeNull()
      else {
        expect(hud?.sectors).toHaveLength(count)
        expect(hud?.sectors[0]).toMatchObject({ state: 'complete', deltaMs: -1000, color: 'green' })
        expect(hud?.sectors[1]).toMatchObject({ state: 'running', currentMs: null, deltaMs: null })
      }
    }
    expect(commonSectorHud({ ...source, fresh: false })).toBeNull()
    expect(commonSectorHud(live())).toBeNull()
    source.fields.sector_count = { value: 3, availability: 'available', unit: 'count' }
    source.fields.sector_last_lap = { value: 1, availability: 'available', unit: 'boolean' }
    source.fields.sector_lap_valid = { value: 0, availability: 'available', unit: 'boolean' }
    source.fields.lap_valid = { value: 1, availability: 'available', unit: 'boolean' }
    expect(commonSectorHud(source)).toMatchObject({ mode: 'last_lap', lapValid: false })
  })
  it('renders a local map without ACC roster and rejects stale or unavailable position', () => {
    const source = live()
    expect(buildCommonTrackMapScene(source)).toMatchObject({ isRace: true, cars: [{ lapPosition: .4, speedKmh: 110, isLocal: true }] })
    for (const changed of [null, { ...source, connected: false }, { ...source, fresh: false },
      { ...source, capabilities: {} }, { ...source, fields: {} },
      { ...source, fields: { normalized_position: { value: 2, availability: 'available' as const, unit: 'ratio' } } }]) {
      expect(buildCommonTrackMapScene(changed).cars).toEqual([])
    }
    const local = frame()
    expect(routeOverlayTelemetry(local, null, true).fastState).toBe(local)
    expect(routeOverlayTelemetry(local, { status: 'available', snapshot: { session: { focused_car_index: 99 } } } as any, true).source).toBe('local')
  })
  it('explains only the unavailable feature and updates as its data arrives', async () => {
    const source = live()
    const wrapper = mount(TelemetryFeatureNotice, { props: { live: source, feature: 'fuel' } })
    expect(wrapper.get('[role=status]').text()).toContain('Non supportato')
    await wrapper.setProps({ feature: 'speed' })
    expect(wrapper.find('[role=status]').exists()).toBe(false)
    await wrapper.setProps({ live: { ...source, fresh: false } })
    expect(wrapper.text()).toContain('aggiornati')
    await wrapper.setProps({ live: { ...source, gameId: 'acc' } })
    expect(wrapper.find('[role=status]').exists()).toBe(false)
  })
  it('binds queued and fallback audio to game, session, variant and freshness', () => {
    let current = frame()
    const cue = bindAudioCue({ id: 'x', path: 'x.wav', source: 'track-reference' }, () => current)
    expect(cue.canPlay!()).toBe(true)
    const original = current
    for (const replacement of [frame({ ...live(), gameId: 'acc' }), frame({ ...live(), sessionId: '2' }),
      frame({ ...live(), identity: { ...live().identity!, variant: 'long' } }), { ...original, isFresh: false }, { ...original, isLive: false }]) {
      current = replacement
      expect(cue.canPlay!()).toBe(false)
    }
    current = original
    expect(bindAudioCue({ id: 'x', path: 'x', source: 'coach', canPlay: () => false }, () => current).canPlay!()).toBe(false)
    expect(audioContextKey({ ...current, commonLive: null, context: null })).toBeNull()
    expect(audioContextKey({ ...current, commonLive: null })).toContain('acc')
    expect(audioFeatureAvailable(current, 'trackReferences')).toBe(true)
    expect(audioFeatureAvailable(current, 'fuel')).toBe(false)
    expect(audioFeatureAvailable({ ...current, commonLive: null }, 'fuel')).toBe(true)
  })
  it('scopes old references to ACC and new references to exact game and variant', () => {
    const reference = { id: 't1', track: 'Spa', normalized_car_position: .2 }
    expect(referenceMatchesContext(reference, 'acc', 'spa', null)).toBe(true)
    expect(referenceMatchesContext(reference, 'evo', 'spa', null)).toBe(false)
    expect(referenceMatchesContext({ ...reference, game_id: 'evo', track_variant: 'short' }, 'evo', 'SPA', 'short')).toBe(true)
    expect(referenceMatchesContext({ ...reference, game_id: 'evo', track_variant: 'short' }, 'evo', 'SPA', null)).toBe(false)
    for (const name of ['race', 'qualify', 'practice', 'hotlap', 'time_attack', 'hot_stint', 'cruise']) expect(resolveSpotterSessionMode(name)).not.toBeNull()
    expect(resolveSpotterSessionMode('unknown')).toBeNull()
    expect(resolveSpotterSessionMode(1)).toBe('qualify')
  })
  it('unknown lap count and last-lap validity remain unknown', () => {
    expect(frame().lapsCompleted).toBeNull()
    expect(frame().info?.lastLapValid).toBeNull()
  })
})
