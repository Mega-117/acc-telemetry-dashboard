// @vitest-environment jsdom
import { createApp, h, nextTick } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import PressureTestPanel from '~/components/overlay/PressureTestPanel.vue'

vi.mock('~/composables/usePresentationVisibility', () => ({ usePresentationInterval: () => ({ start: vi.fn() }) }))
let app: ReturnType<typeof createApp>
const settle = async () => { for (let i = 0; i < 4; i++) { await Promise.resolve(); await nextTick() } }
afterEach(() => { app?.unmount(); document.body.innerHTML = '' })
function mount(api: any, disabled = false, horizontal = false) {
  const host = document.createElement('div'); document.body.append(host)
  app = createApp({ render: () => h(PressureTestPanel, { api, disabled, horizontal }) }); app.mount(host)
  return host
}
const ready = { status: 'ready', applied: true, result: { target: 27.1, context: { track: 'monza', air: 21.6, road: 21.6 },
  wheels: ['Anteriore sinistra', 'Anteriore destra', 'Posteriore sinistra', 'Posteriore destra'].map((name, i) => ({ name, wheel: String(i), cold: 26 + i / 10 })) } }
describe('Pressioni Test isolated panel', () => {
  it('keeps the horizontal button compact and puts partial outcomes in the feedback column', async () => {
    const feedback = document.createElement('div'); feedback.id = 'quick-panel-horizontal-feedback'; document.body.append(feedback)
    const host = mount({ trainingOverlayPressureTestState: async () => ({ available: true, status: 'error', partial: true, reason: 'OCR', result: ready.result, observed: { FL: 261 } }) }, false, true)
    await settle()
    expect(host.querySelector('.pressure-test--horizontal button')).not.toBeNull()
    expect(host.querySelector('[role="alert"]')).toBeNull()
    expect(feedback.textContent).toContain('Applicazione incompleta')
    expect(feedback.textContent).toContain('FL 26,1')
  })
  it('is absent when development capability is unavailable', async () => {
    const host = mount({ trainingOverlayPressureTestState: async () => ({ available: false }) }); await settle()
    expect(host.querySelector('button')).toBeNull()
  })
  it('shows four PSI only, clears old values during a new request and shows the new result', async () => {
    let resolve!: (v: any) => void
    const run = vi.fn(() => new Promise(r => { resolve = r }))
    const host = mount({ trainingOverlayPressureTestState: async () => ({ available: true, ...ready }), trainingOverlayPressureTest: run })
    await settle(); expect(host.querySelectorAll('dd')).toHaveLength(4)
    host.querySelector('button')!.click(); await settle()
    expect(host.querySelectorAll('dd')).toHaveLength(0); expect(host.querySelector('button')!.disabled).toBe(true)
    resolve(ready); await settle(); expect(host.textContent).toContain('applicate e verificate')
    expect(host.querySelector('button small')?.textContent).toBe('BETA')
    expect(host.textContent).toContain('27,1'); expect(run).toHaveBeenCalledOnce()
  })
  it('displays failure without old suggestions and blocks preview activation', async () => {
    const run = vi.fn(async () => { throw Error('offline') })
    const host = mount({ trainingOverlayPressureTestState: async () => ({ available: true }), trainingOverlayPressureTest: run })
    await settle(); host.querySelector('button')!.click(); await settle()
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('interrotta'); expect(host.querySelector('dd')).toBeNull()
    app.unmount(); const preview = mount({ trainingOverlayPressureTestState: async () => ({ available: true }), trainingOverlayPressureTest: run }, true)
    await settle(); expect(preview.querySelector('button')!.disabled).toBe(true)
  })
})
