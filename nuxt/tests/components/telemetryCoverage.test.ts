// @vitest-environment jsdom
// PIP-751: the Telemetria page through the real panel. A trace that does not cover its lap (saved 1.67 s short at
// Silverstone) gives no delta, no "Dove perdi di più" and no measured sectors, and the page says so; the header and
// the official sector times stay. The sector box says the time is yours.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setLocale } from '~/i18n'
import { flushPromises, mount } from '@vue/test-utils'
import { ref } from 'vue'

vi.mock('~/composables/useFirebaseAuth', () => ({ useFirebaseAuth: () => ({ currentUser: ref({ getIdToken: async () => 'token' }) }) }))
vi.mock('~/composables/useTrackEdges', () => ({ useTrackEdges: () => ref(null) }))
vi.mock('~/repositories/publicProfileRepository', () => ({ loadPublicNickname: vi.fn(async () => 'Marco') }))

import SessionAnalysisPanel from '~/components/session-detail/analysis/SessionAnalysisPanel.vue'

const SESSION = '20261106_200042'
// A lap whose trace runs `spanS` seconds for an official `lapTime` (ACC); speed shaped so corners exist.
function rawLap(lapNumber: number, lapTime: number, spanS: number) {
  const n = 600
  const speed = Array.from({ length: n }, (_, i) => 170 + 60 * Math.sin(i / 12))
  return { schema: 'acc.laptrace.v1', grid_step_m: 2,
    meta: { track: 'silverstone', car: 'ferrari_296_gt3', source: 'logger', lap_time_s: lapTime, complete: true, valid: true, recorded_at: SESSION,
      extra: { lap_number: lapNumber, session_token: SESSION } },
    channels: { time_s: Array.from({ length: n }, (_, i) => i / (n - 1) * spanS), speed_kmh: speed, brake_pct: speed.map(() => 0), throttle_pct: speed.map(() => 100),
      pos_x: speed.map((_, i) => Math.cos(i / 95) * 300), pos_z: speed.map((_, i) => Math.sin(i / 95) * 300) } }
}
const laps = [
  { lap_number: 2, lap_time_ms: 118887, is_valid: true, sector_times_ms: [35200, 49930, 33757] },
  { lap_number: 3, lap_time_ms: 119400, is_valid: true, sector_times_ms: [35400, 50100, 33900] },
]

async function open(spanOfLap2: number) {
  const noteFeatureUse = vi.fn()
  ;(window as any).electronAPI = {
    listLapTraces: vi.fn(async (f: { sessionToken?: string }) => f?.sessionToken ? [
      { id: `s__f/lap_${SESSION}_L002_118887ms.json.gz` }, { id: `s__f/lap_${SESSION}_L003_119400ms.json.gz` }] : []),
    readLapTrace: vi.fn(async (id: string) => id.includes('L002') ? rawLap(2, 118.887, spanOfLap2) : rawLap(3, 119.4, 119.4)),
    noteFeatureUse,
  }
  // Other drivers' and coach laps are not what this checks: their requests fail at once (no 2.5 s wait).
  vi.stubGlobal('fetch', vi.fn(async () => { throw new Error('offline') }))
  const view = mount(SessionAnalysisPanel, { props: { sessionToken: SESSION, laps }, global: { stubs: { AnalysisMap: true, AnalysisCharts: true, AnalysisCar: true } } })
  await flushPromises()
  await new Promise(resolve => setTimeout(resolve, 0))
  await flushPromises()
  return { view, noteFeatureUse }
}

afterEach(() => { delete (window as any).electronAPI; vi.unstubAllGlobals() })
setLocale('it')

describe('Telemetria with a trace that does not cover its lap (PIP-751)', () => {
  it('NitroX G2 saved 1.67 s short: no delta, no losses, the page says so; official sectors and YOUR time stay', async () => {
    const { view, noteFeatureUse } = await open(118.887 - 1.671)
    const note = view.find('[data-testid="coverage-note"]')
    expect(note.exists()).toBe(true)
    expect(note.text()).toContain('La traccia del tuo giro non copre')
    expect(note.text()).toContain('1.67')
    // Only the channel charts: the delta row is not drawn from the short trace.
    expect(view.findAll('analysis-charts-stub')).toHaveLength(1)
    expect(view.text()).not.toContain('Dove perdi di più')
    // ACC's sector times: yours, said so, with the official gap to lap 3.
    const rows = view.findAll('.sector-row')
    expect(rows.map(r => r.find('.sector-time').text())).toEqual(['Tu 35.200', 'Tu 49.930', 'Tu 33.757'])
    expect(rows[0]!.attributes('title')).toContain('Riferimento 35.400')
    expect(rows.map(r => r.find('.corner-bar__value').text())).toEqual(['−0.200', '−0.170', '−0.143'])
    expect(noteFeatureUse).toHaveBeenCalledWith({ event: 'laps.gap_check', comparable: 0, spanGapMs: 1671, mismatch: 1671 })
    view.unmount()
  })

  it('a lap that covers its time: delta and losses drawn, no note', async () => {
    const { view, noteFeatureUse } = await open(118.887)
    expect(view.find('[data-testid="coverage-note"]').exists()).toBe(false)
    expect(view.findAll('analysis-charts-stub')).toHaveLength(2)
    expect(noteFeatureUse).toHaveBeenCalledWith({ event: 'laps.gap_check', comparable: 1, spanGapMs: 0, mismatch: 0 })
    view.unmount()
  })
})
