// @vitest-environment jsdom
// PIP-760: the map of a lap without (all or some of) its coordinates. Gain and loss depend on the distance, so they
// are drawn on the reference's line, with a note saying which geometry is used; never a made-up line of the lap, never
// a chord across a hole; a corner zoom keeps the colours. A reference without coordinates keeps the dev.11 fallback;
// nothing to draw at all -> the message, no SVG.
import { describe, expect, it, vi } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { setLocale } from '~/i18n'
import AnalysisMap from '~/components/session-detail/analysis/AnalysisMap.vue'
import { normalizeLapTrace, type LapTraceView } from '~/services/telemetry/lapTraceChart'

vi.mock('~/composables/useTrackEdges', () => ({ useTrackEdges: () => null }))
setLocale('it')

const n = 120
type Hole = (i: number) => boolean
function trace({ time = (i: number) => i, coords = 'full' as 'full' | 'none' | 'equal', hole = null as Hole | null } = {}): LapTraceView {
  const x = (i: number) => Math.cos(i / n * 2 * Math.PI) * 300
  const z = (i: number) => Math.sin(i / n * 2 * Math.PI) * 200
  const channels: Record<string, (number | null)[]> = { time_s: Array.from({ length: n }, (_, i) => time(i)), speed_kmh: Array.from({ length: n }, () => 150),
    brake_pct: Array.from({ length: n }, () => 0), throttle_pct: Array.from({ length: n }, () => 100) }
  if (coords === 'full') {
    channels.pos_x = Array.from({ length: n }, (_, i) => (hole?.(i) ? null : x(i)))
    channels.pos_z = Array.from({ length: n }, (_, i) => (hole?.(i) ? null : z(i)))
  } else if (coords === 'equal') {
    channels.pos_x = Array.from({ length: n }, () => 5)
    channels.pos_z = Array.from({ length: n }, () => 5)
  }
  return normalizeLapTrace({ schema: 'acc.laptrace.v1', grid_step_m: 2,
    meta: { track: 'Silverstone', car: 'ferrari_296_gt3', source: 'logger', lap_time_s: 119, complete: true, valid: true, extra: { lap_number: 2 } }, channels })!
}
// Slower then faster than the reference: red, then green.
const lapTime = (i: number) => i + 2 * Math.sin(Math.PI * i / (n - 1))
const corners = [{ number: 1, start: 0.2, apex: 0.25, end: 0.3, minSpeedKmh: 90 }, { number: 2, start: 0.6, apex: 0.65, end: 0.7, minSpeedKmh: 80 }]

const pairs = (points: string) => points.split(' ').filter(Boolean)
function noNaN(view: VueWrapper) { expect(view.html()).not.toMatch(/NaN|Infinity/) }
function refPoints(view: VueWrapper) {
  // The reference's own line, as the laps mode draws it.
  const lapsView = mount(AnalysisMap, { props: { lap: trace({ time: lapTime }), reference: view.props('reference'), corners, cursor: null, colorMode: 'laps' } })
  const points = new Set(pairs(lapsView.get('.map-ref').attributes('points')!))
  lapsView.unmount()
  return points
}
const colours = (view: VueWrapper) => new Set(view.findAll('.map-lap').map(s => s.attributes('stroke')))

describe('AnalysisMap: your lap without coordinates (PIP-760)', () => {
  it('draws gain and loss on the reference line, says so, and never draws a line of its own', () => {
    const view = mount(AnalysisMap, { props: { lap: trace({ time: lapTime, coords: 'none' }), reference: trace(), corners, cursor: 0.3 } })
    expect(view.find('svg.map').exists()).toBe(true)
    expect([...colours(view)]).toEqual(expect.arrayContaining(['#ff5a6e', '#3ddc5a']))
    const onRef = refPoints(view)
    for (const s of view.findAll('.map-lap').slice(0, 50)) {
      expect(onRef.has(`${Number(s.attributes('x1')).toFixed(2)},${Number(s.attributes('y1')).toFixed(2)}`)).toBe(true)
    }
    expect(view.find('.map-lap-line').exists()).toBe(false)
    expect(view.get('[data-testid="map-geometry-note"]').text()).toMatch(/riferimento/)
    noNaN(view)
    view.unmount()
  })

  it('keeps the colours on a corner zoom, with the note, and still no line of its own', () => {
    const view = mount(AnalysisMap, { props: { lap: trace({ time: lapTime, coords: 'none' }), reference: trace(), corners, cursor: 0.25, selected: 1, zoom: true } })
    expect(view.findAll('.map-lap').length).toBeGreaterThan(100)
    expect(view.find('.map-ref').exists()).toBe(true)
    expect(view.find('.map-lap-line').exists()).toBe(false)
    expect(view.find('[data-testid="map-geometry-note"]').exists()).toBe(true)
    noNaN(view)
    view.unmount()
  })

  it('in the laps mode too: colours on the reference line instead of nothing', () => {
    const view = mount(AnalysisMap, { props: { lap: trace({ time: lapTime, coords: 'none' }), reference: trace(), corners, cursor: null, colorMode: 'laps' } })
    expect([...colours(view)]).toEqual(expect.arrayContaining(['#ff5a6e', '#3ddc5a']))
    expect(view.find('.map-lap-line').exists()).toBe(false)
    view.unmount()
  })
})

describe('AnalysisMap: a lap with recovered (partial) coordinates (PIP-760)', () => {
  it('draws its own line where it was recorded and borrows the reference only over the missing stretch', () => {
    const view = mount(AnalysisMap, { props: { lap: trace({ time: lapTime, hole: i => i < 12 }), reference: trace(), corners, cursor: null, colorMode: 'laps' } })
    const own = view.findAll('.map-lap-line')
    expect(own).toHaveLength(1)
    const borrowed = view.findAll('.map-lap')
    expect(borrowed.length).toBeGreaterThan(0)
    expect(borrowed.length).toBeLessThan(80)                                // only the first ~10% of the lap
    expect(view.get('[data-testid="map-geometry-note"]').text()).toMatch(/tratto/i)
    noNaN(view)
    view.unmount()
  })

  it('never joins the two sides of a hole with a chord', () => {
    const view = mount(AnalysisMap, { props: { lap: trace({ time: lapTime, hole: i => i >= 60 && i <= 61 }), reference: null, corners, cursor: null, colorMode: 'laps' } })
    // No reference: nothing to borrow. The lap has holes, so it cannot frame the map either: the message.
    expect(view.find('.map-none').exists()).toBe(true)
    view.unmount()
    const withRef = mount(AnalysisMap, { props: { lap: trace({ time: lapTime, hole: i => i >= 60 && i <= 61 }), reference: trace(), corners, cursor: null, colorMode: 'laps' } })
    const runs = withRef.findAll('.map-lap-line')
    expect(runs).toHaveLength(2)
    const [a, b] = runs.map(r => pairs(r.attributes('points')!))
    const end = a![a!.length - 1]!.split(',').map(Number), start = b![0]!.split(',').map(Number)
    expect(Math.hypot(end[0]! - start[0]!, end[1]! - start[1]!)).toBeGreaterThan(0)   // two separate lines
    noNaN(withRef)
    withRef.unmount()
  })
})

describe('AnalysisMap: the other geometries (PIP-760 matrix)', () => {
  it('a reference without coordinates keeps the fallback on your lap, with no note', () => {
    const view = mount(AnalysisMap, { props: { lap: trace({ time: lapTime }), reference: trace({ coords: 'none' }), corners, cursor: 0.3 } })
    expect(view.find('svg.map').exists()).toBe(true)
    expect(view.find('[data-testid="map-geometry-note"]').exists()).toBe(false)
    noNaN(view)
    view.unmount()
  })

  it.each([['none', 'none'], ['none', 'equal'], ['equal', 'none']] as const)('lap %s, reference %s: the message, no SVG', (lap, ref) => {
    const view = mount(AnalysisMap, { props: { lap: trace({ coords: lap }), reference: trace({ coords: ref }), corners, cursor: 0.3 } })
    expect(view.find('svg').exists()).toBe(false)
    expect(view.find('.map-none').exists()).toBe(true)
    view.unmount()
  })

  it('a full lap and a full reference are drawn as before (no note, no borrowed segment in the laps mode)', () => {
    const view = mount(AnalysisMap, { props: { lap: trace({ time: lapTime }), reference: trace(), corners, cursor: null, colorMode: 'laps' } })
    expect(view.findAll('.map-lap')).toHaveLength(0)
    expect(view.findAll('.map-lap-line')).toHaveLength(1)
    expect(view.find('[data-testid="map-geometry-note"]').exists()).toBe(false)
    view.unmount()
  })
})
