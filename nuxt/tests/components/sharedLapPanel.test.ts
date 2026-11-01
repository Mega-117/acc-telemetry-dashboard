// @vitest-environment jsdom
// PIP-623: "Giro di un altro pilota" e "Condividi giro" nella Telemetria.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { setLocale } from '~/i18n'
import { flushPromises, mount } from '@vue/test-utils'
import { gzipSync } from 'node:zlib'
import { ref } from 'vue'

vi.mock('~/repositories/publicProfileRepository', () => ({ loadPublicNickname: vi.fn(async () => 'Marco') }))
vi.mock('~/composables/useFirebaseAuth', () => ({ useFirebaseAuth: () => ({ currentUser: ref({ getIdToken: async () => 'token' }) }) }))
// Track edges (PIP-636) are not what these tests check, and they read the Nuxt runtime config.
vi.mock('~/composables/useTrackEdges', () => ({ useTrackEdges: () => ref(null) }))

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

// PIP-665: these checks read the Italian texts; the default would follow the system language.
setLocale('it')

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
    // PIP-695: "Condividi" sits on the "Tu" card.
    const button = view.get('.lap-pill--you .share-lap')
    await button.trigger('click')
    await flushPromises()
    // 01/11: "Tu" opens on the fastest valid lap of the session (lap 5).
    expect((window as any).electronAPI.shareLapTrace).toHaveBeenCalledWith('h__c/lap_20261025_175240_L005_104310ms.json.gz')
    expect(writeText).toHaveBeenCalledWith(`https://x/giro#${SHARE}.${KEY}`)
    expect(view.text()).toContain('Link copiato')
    view.unmount()
  })

  // 01/11: after the ✕ the panel opens with only your lap, and a choice in Cambia gives the page its reference back.
  it('opens without a reference after the ✕ and asks the page to remove the comparison', async () => {
    ;(window as any).electronAPI = {
      listLapTraces: vi.fn(async (f: { sessionToken?: string }) => f?.sessionToken ? [
        { id: 'h__c/lap_20261025_175240_L005_104310ms.json.gz' },
        { id: 'h__c/lap_20261025_175240_L006_104900ms.json.gz' },
      ] : []),
      readLapTrace: vi.fn(async (id: string) => rawLap({ lapNumber: id.includes('L005') ? 5 : 6, lapTime: id.includes('L005') ? 104.31 : 104.9 })),
    }
    const view = mount(SessionAnalysisPanel, { props: { sessionToken: '20261025_175240', laps, referenceRemoved: true }, global: { stubs: { AnalysisMap: true, AnalysisCharts: true, AnalysisCar: true } } })
    await flushPromises()
    expect(view.get('.lap-pill--you').text()).toContain('G5')
    expect(view.get('.lap-pill--ref').text()).not.toContain('G6')
    expect(view.find('.lap-pill--ref .lap-pill__remove').exists()).toBe(false)
    await view.setProps({ referenceRemoved: false })
    view.unmount()
    const again = mount(SessionAnalysisPanel, { props: { sessionToken: '20261025_175240', laps }, global: { stubs: { AnalysisMap: true, AnalysisCharts: true, AnalysisCar: true } } })
    await flushPromises()
    await again.get('.lap-pill--ref .lap-pill__remove').trigger('click')
    expect(again.emitted('removeCompare')).toHaveLength(1)
    expect(again.get('.lap-pill--ref').text()).not.toContain('G6')
    again.unmount()
  })

  // PIP-695 + 01/11: the two cards on open: Tu my fastest valid lap, Riferimento the next one with its reason; "Cambia" opens the chooser.
  it('opens with the two cards, the reason of the reference and the chooser on the right side', async () => {
    ;(window as any).electronAPI = {
      listLapTraces: vi.fn(async (f: { sessionToken?: string }) => f?.sessionToken ? [
        { id: 'h__c/lap_20261025_175240_L005_104310ms.json.gz' },
        { id: 'h__c/lap_20261025_175240_L006_104900ms.json.gz' },
      ] : []),
      readLapTrace: vi.fn(async (id: string) => rawLap({ lapNumber: id.includes('L005') ? 5 : 6, lapTime: id.includes('L005') ? 104.31 : 104.9 })),
    }
    const view = mount(SessionAnalysisPanel, { props: { sessionToken: '20261025_175240', laps, sessionType: 'race' }, attachTo: document.body, global: { stubs: { AnalysisMap: true, AnalysisCharts: true, AnalysisCar: true } } })
    await flushPromises()
    expect(view.get('.lap-pill--you .lap-pill__lap').text()).toBe('G5')
    expect(view.get('.lap-pill--you .lap-pill__time').text()).toBe('1:44.310')
    expect(view.get('.lap-pill--ref .lap-pill__lap').text()).toBe('G6')
    expect(view.get('.lap-pill--ref .lap-pill__time').text()).toBe('1:44.900')
    expect(view.get('.lap-pill--ref .lap-pill__why').attributes('aria-label')).toContain('Perché questo: il tuo giro valido più veloce dopo questo')
    expect(view.get('.lap-pill--ref .lap-pill__body').attributes('title')).toContain('Gara')
    // Both laps are mine: they can be swapped, from Cambia (01/11: the button left the bar).
    expect(view.find('.compare-swap').exists()).toBe(false)
    await view.get('.lap-pill--ref .lap-pill__change').trigger('click')
    await flushPromises()
    ;(document.body.querySelector('.choice-dialog__swap') as HTMLButtonElement).click()
    await flushPromises()
    expect(document.body.querySelector('[role="dialog"]')).toBeNull()
    expect(view.get('.lap-pill--you .lap-pill__lap').text()).toBe('G6')
    expect(view.get('.lap-pill--ref .lap-pill__why').attributes('aria-label')).toContain('giro scelto da te')
    await view.get('.lap-pill--ref .lap-pill__change').trigger('click')
    await flushPromises()
    expect(document.body.querySelector('[role="dialog"]')?.textContent).toContain('Cambia il riferimento')
    view.unmount()
  })

  // 01/11: with a target the bar lives in the page's title row; it leaves with the panel.
  it('puts Tu and Riferimento in the page title row and takes them away on unmount', async () => {
    ;(window as any).electronAPI = {
      listLapTraces: vi.fn(async (f: { sessionToken?: string }) => f?.sessionToken ? [{ id: 'h__c/lap_20261025_175240_L005_104310ms.json.gz' }] : []),
      readLapTrace: vi.fn(async () => rawLap({ lapNumber: 5, lapTime: 104.31 })),
    }
    const head = document.createElement('div')
    head.id = 'head-test'
    document.body.appendChild(head)
    const view = mount(SessionAnalysisPanel, { props: { sessionToken: '20261025_175240', laps, sessionType: 'race', headTarget: '#head-test' }, attachTo: document.body, global: { stubs: { AnalysisMap: true, AnalysisCharts: true, AnalysisCar: true } } })
    await flushPromises()
    expect(head.querySelector('.analysis-bar--head .lap-pill--you')).not.toBeNull()
    expect(view.element.querySelector('.analysis-bar')).toBeNull()
    view.unmount()
    expect(head.querySelector('.analysis-bar')).toBeNull()
    head.remove()
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
    await vi.waitFor(() => expect(view.text()).toContain('G5'))
    expect(fetchImpl.mock.calls[0]![0]).toContain('/v1/laps/of/pilot-1/20261025_175240')
    expect(view.findAll('button.bar-btn').some(b => b.text() === 'Condividi giro')).toBe(false)
    await vi.waitFor(() => expect((window as any).electronAPI.listLapTraces).toHaveBeenCalledWith({ track: 'Hungaroring', car: 'ferrari_296_gt3' }))
    view.unmount()
  })
})
