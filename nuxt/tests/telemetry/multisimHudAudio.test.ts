// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import TelemetryFeatureNotice from '~/components/overlay/TelemetryFeatureNotice.vue'
import type { CommonLive } from '~/services/telemetry/commonLive'
import { commonFastPresentation } from '~/services/telemetry/commonFastPresentation'
import type { FastOverlayState } from '~/composables/useFastStatePoller'
import { buildCommonTrackMapScene } from '~/services/sim/commonTrackMapScene'
import { audioContextKey, audioFeatureAvailable, bindAudioCue } from '~/services/spotter/audioSourceContext'
import { referenceMatchesContext } from '~/services/spotter/trackVoiceReferences'
import { resolveSpotterSessionMode } from '~/services/spotter/spotterSessionPolicy'
import { routeOverlayTelemetry } from '~/services/overlay/spectatorTelemetry'
import { commonSectorHud } from '~/services/telemetry/commonSectorHud'

const live = (): CommonLive => ({ gameId: 'synthetic', sessionId: '1', connected: true, fresh: true,
  lifecycle: 'live', sessionKind: 'race', identity: { track: 'Spa', car: 'EV', variant: 'short' },
  capabilities: { track_position: true, fuel: false }, fields: {
    normalized_position: { value: .4, availability: 'available', unit: 'ratio' },
    speed: { value: 110, availability: 'available', unit: 'km/h' },
  } })
const frame = (source = live()) => ({ ...commonFastPresentation(source), sectorHud: null } as FastOverlayState)

describe('multisim HUD and audio isolation', () => {
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
