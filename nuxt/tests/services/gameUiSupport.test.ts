import { describe, it, expect } from 'vitest'
import { gameUiSupport, hudSettingSupported } from '~/services/telemetry/gameCatalog'
describe('product support separate from live data', () => {
  it('preserves full ACC settings and restricts EVO and unknown games', () => {
    expect(Object.values(gameUiSupport('acc')).every(Boolean)).toBe(true)
    for (const game of ['evo', 'unknown', null]) expect(Object.values(gameUiSupport(game)).some(Boolean)).toBe(false)
    expect(hudSettingSupported('acc', 'info', 'showDamage')).toBe(true)
    expect(hudSettingSupported('evo', 'info', 'showDamage')).toBe(false)
    expect(hudSettingSupported('evo', 'info', 'showStint')).toBe(true)
    expect(hudSettingSupported('evo', 'standings', 'showLastLap')).toBe(true)
    expect(hudSettingSupported('evo', 'trackmap', 'showPitPrediction')).toBe(false)
    expect(hudSettingSupported('unknown', 'info', 'showStint')).toBe(false)
  })
})
