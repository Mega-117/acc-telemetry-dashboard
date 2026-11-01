// @vitest-environment jsdom
// 01/11: corner numbers easier to hit, and the time lost or gained written beside each one (Track Titan).
import { describe, expect, it, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { setLocale } from '~/i18n'
import AnalysisMap from '~/components/session-detail/analysis/AnalysisMap.vue'
import { normalizeLapTrace } from '~/services/telemetry/lapTraceChart'

vi.mock('~/composables/useTrackEdges', () => ({ useTrackEdges: () => null }))
setLocale('it')

function trace() {
  const n = 120
  return normalizeLapTrace({ schema: 'acc.laptrace.v1', grid_step_m: 2,
    meta: { track: 'Hungaroring', car: 'ferrari_296_gt3', source: 'logger', lap_time_s: 100, complete: true, valid: true, recorded_at: '20261025_175240', extra: { lap_number: 5, session_token: '20261025_175240' } },
    channels: { time_s: Array.from({ length: n }, (_, i) => i), speed_kmh: Array.from({ length: n }, () => 150), brake_pct: Array.from({ length: n }, () => 0), throttle_pct: Array.from({ length: n }, () => 100),
      pos_x: Array.from({ length: n }, (_, i) => Math.cos(i / n * 2 * Math.PI) * 300), pos_z: Array.from({ length: n }, (_, i) => Math.sin(i / n * 2 * Math.PI) * 200) } })!
}
const corners = [
  { number: 1, start: 0.1, apex: 0.15, end: 0.2, minSpeedKmh: 90 },
  { number: 2, start: 0.4, apex: 0.45, end: 0.5, minSpeedKmh: 80 },
  { number: 3, start: 0.7, apex: 0.75, end: 0.8, minSpeedKmh: 70 },
]

describe('AnalysisMap corner numbers', () => {
  it('writes the time beside each corner (loss red, gain green, level hidden) and keeps a large click area', async () => {
    const view = mount(AnalysisMap, { props: { lap: trace(), reference: trace(), corners, cursor: null, cornerDeltas: { 1: 0.069, 2: -0.031, 3: 0.004 } } })
    const gaps = view.findAll('.map-corner__gap')
    expect(gaps.map(g => [g.text(), g.classes().includes('loss') ? 'loss' : 'gain'])).toEqual([['+0.07', 'loss'], ['−0.03', 'gain']])
    const hit = view.findAll('.map-corner__hit')
    expect(hit).toHaveLength(3)
    expect(Number(hit[0]!.attributes('r'))).toBeGreaterThan(Number(view.findAll('.map-corner circle:not(.map-corner__hit)')[0]!.attributes('r')))
    await view.findAll('.map-corner')[1]!.trigger('click')
    expect(view.emitted('select')).toEqual([[2]])
    view.unmount()
  })

  it('without times only the numbers', () => {
    const view = mount(AnalysisMap, { props: { lap: trace(), reference: null, corners, cursor: null } })
    expect(view.findAll('.map-corner__gap')).toHaveLength(0)
    expect(view.findAll('.map-corner')).toHaveLength(3)
    view.unmount()
  })
})
