// @vitest-environment jsdom
// 01/11 (Track Titan's focus zone): the stretch to look at is highlighted at the same place on every chart.
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import { setLocale } from '~/i18n'
import AnalysisCharts from '~/components/session-detail/analysis/AnalysisCharts.vue'
import { normalizeLapTrace } from '~/services/telemetry/lapTraceChart'

setLocale('it')

function trace(lapTime: number) {
  const n = 50
  const speed = Array.from({ length: n }, (_, i) => 150 + 50 * Math.sin(i / 5))
  return normalizeLapTrace({ schema: 'acc.laptrace.v1', grid_step_m: 2,
    meta: { track: 'Hungaroring', car: 'ferrari_296_gt3', source: 'logger', lap_time_s: lapTime, complete: true, valid: true, recorded_at: '20261025_175240', extra: { lap_number: 5, session_token: '20261025_175240' } },
    channels: { time_s: Array.from({ length: n }, (_, i) => i * (lapTime / n)), speed_kmh: speed, brake_pct: speed.map(() => 0), throttle_pct: speed.map(() => 100),
      pos_x: speed.map((_, i) => Math.cos(i / 8) * 100), pos_z: speed.map((_, i) => Math.sin(i / 8) * 100) } })!
}
const rows = [
  { key: 'delta', title: 'Delta', channels: [], delta: true, height: 70 },
  { key: 'speed', title: 'Velocità', channels: [{ name: 'speed_kmh' }], height: 90 },
]

describe('AnalysisCharts focus band', () => {
  it('draws the band at the same x on every chart, clipped to the shown range', () => {
    const view = mount(AnalysisCharts, { props: { lap: trace(104), reference: trace(103), rows, cursor: null, focus: [0.4, 0.5] } })
    const bands = view.findAll('rect.chart-focus')
    expect(bands).toHaveLength(2)
    expect(bands.map(b => [b.attributes('x'), b.attributes('width')])).toEqual([['400', '100'], ['400', '100']])
    view.unmount()
  })

  it('no band without a focus or when it is outside the zoomed range', async () => {
    const view = mount(AnalysisCharts, { props: { lap: trace(104), reference: trace(103), rows, cursor: null } })
    expect(view.findAll('rect.chart-focus')).toHaveLength(0)
    await view.setProps({ focus: [0.4, 0.5], range: [0.6, 0.9] })
    expect(view.findAll('rect.chart-focus')).toHaveLength(0)
    await view.setProps({ range: [0.45, 0.9] })
    expect(view.findAll('rect.chart-focus')[0]!.attributes('x')).toBe('0')
    view.unmount()
  })
})
