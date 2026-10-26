// @vitest-environment jsdom
// PIP-623: "Giro di un altro pilota" e "Condividi giro" nella Telemetria.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { gzipSync } from 'node:zlib'
import { ref } from 'vue'

vi.mock('~/repositories/publicProfileRepository', () => ({ loadPublicNickname: vi.fn(async () => 'Marco') }))
vi.mock('~/composables/useFirebaseAuth', () => ({ useFirebaseAuth: () => ({ currentUser: ref({ getIdToken: async () => 'token' }) }) }))

import SharedLapPanel from '~/components/session-detail/analysis/SharedLapPanel.vue'
import SessionAnalysisPanel from '~/components/session-detail/analysis/SessionAnalysisPanel.vue'
import { normalizeLapTrace } from '~/services/telemetry/lapTraceChart'

const SHARE = 'a'.repeat(32), KEY = 'b'.repeat(32)
function rawLap({ track = 'Hungaroring', car = 'ferrari_296_gt3', lapTime = 104.31, session = '20261025_175240', lapNumber = 5 } = {}) {
  const n = 50
  const speed = Array.from({ length: n }, (_, i) => 150 + 50 * Math.sin(i / 5))
  return { schema: 'acc.laptrace.v1', grid_step_m: 2,
    meta: { track, car, source: 'logger', lap_time_s: lapTime, complete: true, valid: true, recorded_at: session, extra: { lap_number: lapNumber, session_token: session } },
    channels: { time_s: Array.from({ length: n }, (_, i) => i * (lapTime / n)), speed_kmh: speed, brake_pct: speed.map(() => 0), throttle_pct: speed.map(() => 100),
      pos_x: speed.map((_, i) => Math.cos(i / 8) * 100), pos_z: speed.map((_, i) => Math.sin(i / 8) * 100) } }
}
const gzResponse = (value: unknown, headers: Record<string, string> = {}) => new Response(new Uint8Array(gzipSync(Buffer.from(JSON.stringify(value)))) as unknown as BodyInit, { status: 200, headers })

afterEach(() => { delete (window as any).electronAPI; vi.unstubAllGlobals() })

describe('SharedLapPanel', () => {
  const current = normalizeLapTrace(rawLap())!
  const mountPanel = (fetchImpl: () => Promise<Response>) => mount(SharedLapPanel, { props: { current, deps: { getToken: async () => 'token', fetchImpl: fetchImpl as unknown as typeof fetch, origin: 'https://w.example' } } })

  it('loads a pasted link as reference, labelled with the owner nickname; another car is a warning', async () => {
    const view = mountPanel(async () => gzResponse(rawLap({ car: 'bmw_m4_gt3', lapTime: 103.9 }), { 'X-Lap-Owner-Uid': 'uid-2', 'X-Lap-Number': '7', 'X-Lap-Time-Ms': '103900' }))
    await view.get('input').setValue(`https://x/giro#${SHARE}.${KEY}`)
    await view.get('button.shared-load').trigger('click')
    await vi.waitFor(() => expect(view.emitted('loaded')).toBeTruthy())
    const loaded = view.emitted('loaded')![0]![0] as { id: string, label: string, carMismatch: boolean }
    expect(loaded.id).toBe(`shared:${SHARE}`)
    expect(loaded.label).toBe('Marco · Giro 7 · 1:43.900')
    expect(loaded.carMismatch).toBe(true)
  })

  it('refuses a partial or invalid lap', async () => {
    const partial = { ...rawLap(), meta: { ...rawLap().meta, complete: false } }
    const view = mountPanel(async () => gzResponse(partial))
    await view.get('input').setValue(`${SHARE}.${KEY}`)
    await view.get('button.shared-load').trigger('click')
    await vi.waitFor(() => expect(view.text()).toContain('non è completo o valido'))
    expect(view.emitted('loaded')).toBeUndefined()
  })

  it('a change of session while loading discards the old answer', async () => {
    let release: (r: Response) => void = () => {}
    const view = mountPanel(() => new Promise<Response>((resolve) => { release = resolve }))
    await view.get('input').setValue(`${SHARE}.${KEY}`)
    await view.get('button.shared-load').trigger('click')
    await view.setProps({ current: normalizeLapTrace(rawLap({ track: 'Monza' }))! })
    release(gzResponse(rawLap()))
    await flushPromises()
    await new Promise((resolve) => setTimeout(resolve, 20))
    expect(view.emitted('loaded')).toBeUndefined()
  })

  it('refuses a lap of another track and a malformed link', async () => {
    const view = mountPanel(async () => gzResponse(rawLap({ track: 'Monza' })))
    await view.get('input').setValue('nonsense')
    await view.get('button.shared-load').trigger('click')
    expect(view.text()).toContain('Link non riconosciuto')
    await view.get('input').setValue(`${SHARE}.${KEY}`)
    await view.get('button.shared-load').trigger('click')
    await vi.waitFor(() => expect(view.text()).toContain('Monza'))
    expect(view.emitted('loaded')).toBeUndefined()
  })
})

describe('SessionAnalysisPanel sharing and coach view', () => {
  const laps = [{ lap_number: 5, lap_time_ms: 104310, is_valid: true }, { lap_number: 6, lap_time_ms: 104900, is_valid: true }]

  it('"Condividi giro" shares the selected lap and copies the link', async () => {
    const writeText = vi.fn(async () => {})
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    ;(window as any).electronAPI = {
      listLapTraces: vi.fn(async () => [
        { id: 'h__c/lap_20261025_175240_L005_104310ms.json.gz' },
        { id: 'h__c/lap_20261025_175240_L006_104900ms.json.gz' },
      ]),
      readLapTrace: vi.fn(async (id: string) => rawLap({ lapNumber: id.includes('L005') ? 5 : 6, lapTime: id.includes('L005') ? 104.31 : 104.9 })),
      shareLapTrace: vi.fn(async () => ({ link: `https://x/giro#${SHARE}.${KEY}`, shareId: SHARE })),
    }
    const view = mount(SessionAnalysisPanel, { props: { sessionToken: '20261025_175240', laps }, global: { stubs: { AnalysisMap: true, AnalysisCharts: true, AnalysisCar: true } } })
    await flushPromises()
    const button = view.findAll('button.bar-btn').find(b => b.text() === 'Condividi giro')!
    await button.trigger('click')
    await flushPromises()
    expect((window as any).electronAPI.shareLapTrace).toHaveBeenCalledWith('h__c/lap_20261025_175240_L006_104900ms.json.gz')
    expect(writeText).toHaveBeenCalledWith(`https://x/giro#${SHARE}.${KEY}`)
    expect(view.text()).toContain('Link copiato')
    view.unmount()
  })

  it('someone else\'s session opened by link never reads this PC\'s laps', async () => {
    ;(window as any).electronAPI = { listLapTraces: vi.fn(async () => []), readLapTrace: vi.fn() }
    const view = mount(SessionAnalysisPanel, { props: { sessionToken: '20261025_175240', laps, foreign: true }, global: { stubs: { AnalysisMap: true, AnalysisCharts: true, AnalysisCar: true } } })
    await flushPromises()
    expect((window as any).electronAPI.listLapTraces).not.toHaveBeenCalled()
    expect(view.text()).toContain('Condividi giro')
    view.unmount()
  })

  it('in coach view reads the pilot laps from the archive and offers no sharing', async () => {
    const fetchImpl = vi.fn(async (url: string) => url.endsWith('20261025_175240')
      ? new Response(JSON.stringify({ laps: [
        { lapId: '1'.repeat(24), lapNumber: 5, lapTimeMs: 104310, valid: true },
        { lapId: '2'.repeat(24), lapNumber: 6, lapTimeMs: 104900, valid: true },
      ] }), { status: 200 })
      : gzResponse(rawLap({ lapNumber: url.includes('1111') ? 5 : 6 })))
    vi.stubGlobal('fetch', fetchImpl)
    ;(window as any).electronAPI = { listLapTraces: vi.fn(async () => []), readLapTrace: vi.fn(), shareLapTrace: vi.fn() }
    const view = mount(SessionAnalysisPanel, { props: { sessionToken: '20261025_175240', laps, pilotUid: 'pilot-1' }, global: { stubs: { AnalysisMap: true, AnalysisCharts: true, AnalysisCar: true } } })
    await vi.waitFor(() => expect(view.text()).toContain('Giro 5'))
    expect(fetchImpl.mock.calls[0]![0]).toContain('/v1/laps/of/pilot-1/20261025_175240')
    expect(view.findAll('button.bar-btn').some(b => b.text() === 'Condividi giro')).toBe(false)
    await vi.waitFor(() => expect((window as any).electronAPI.listLapTraces).toHaveBeenCalledWith({ track: 'Hungaroring', car: 'ferrari_296_gt3' }))
    view.unmount()
  })
})
