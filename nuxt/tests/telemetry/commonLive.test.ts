import { describe, expect, it } from 'vitest'
import { readCommonLive, commonValue } from '~/services/telemetry/commonLive'
import { useGameContext } from '~/composables/useGameContext'
const frame = { schema: 'racercore.live', version: 1, game_id: 'synthetic', session_id: 'run1', observed_at_ms: 1000, ttl_ms: 1000, connected: true, capabilities: { fuel: false }, fields: { speed: { value: 120, availability: 'available', unit: 'km/h' }, fuel: { value: null, availability: 'unsupported', unit: 'L' } } }
describe('common live facts', () => {
  it('expires measurements and preserves unsupported distinctly from stale', () => {
    const live = readCommonLive(frame, 2001)!
    expect(live.connected).toBe(false)
    expect(live.fields.speed).toMatchObject({ value: null, availability: 'stale' })
    expect(live.fields.fuel.availability).toBe('unsupported')
    expect(readCommonLive(frame, 999)!.fresh).toBe(false)
  })
  it('cannot change the consulted game when connecting or disconnecting', () => {
    const context = useGameContext(); context.selectGame('evo')
    const live = readCommonLive(frame, 1001)!
    expect(live.gameId).toBe('synthetic')
    expect(commonValue(live, 'speed', 'km/h')).toBe(120)
    expect(commonValue(live, 'speed', 'm/s')).toBeNull()
    expect(commonValue(live, 'fuel', 'L')).toBeNull()
    expect(readCommonLive({ ...frame, connected: false }, 1001)!.fields.speed.value).toBeNull()
    expect(context.consultedGame.value).toBe('evo')
    context.selectGame('acc')
  })
  it('rejects unversioned, malformed, fabricated and nonfinite values', () => {
    for (const bad of [null, {}, { ...frame, version: 9 }, { ...frame, game_id: '../acc' }, { ...frame, ttl_ms: 0 }, { ...frame, session_id: '' }, { ...frame, fields: { speed: { value: 0, availability: 'unsupported', unit: 'km/h' } } }, { ...frame, fields: { speed: { value: NaN, availability: 'available', unit: 'km/h' } } }]) expect(readCommonLive(bad, 1001)).toBeNull()
  })
})
