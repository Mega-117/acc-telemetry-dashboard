// @vitest-environment jsdom
import { createApp, nextTick } from 'vue'
import { afterEach, describe, expect, it } from 'vitest'
import { createQuickPanelPreview, blockQuickPanelPreviewAction } from '~/services/overlay/quickPanelPreview'
import SetupFuelPanel from '~/components/overlay/SetupFuelPanel.vue'
import ControlKFriendRequests from '~/components/overlay/ControlKFriendRequests.vue'
import PitwallOverlayButton from '~/components/pitwall/PitwallOverlayButton.vue'
import { setLocale } from '~/i18n'

// Assertions below read the Italian texts (jsdom starts in English).
setLocale('it')

let app: ReturnType<typeof createApp> | undefined
async function mount(component: any, props: any) {
  const root = document.createElement('div'); document.body.append(root)
  app = createApp(component, props); app.mount(root)
  await new Promise(resolve => setTimeout(resolve, 0)); await nextTick()
}
afterEach(() => { app?.unmount(); app = undefined; document.body.innerHTML = '' })
describe('complete quick panel visual fixture', () => {
  it('provides independent snapshots and exposes no mutating IPC methods', async () => {
    const demo = createQuickPanelPreview()
    expect(Object.keys(demo.api).sort()).toEqual(['friendRequestsGet', 'trainingOverlayGetPitwallState', 'trainingOverlayPreviewSetupFuel'])
    expect(demo.pressure.preview).toHaveLength(4)
    const first = await demo.api.friendRequestsGet(); first.requests.pop()
    expect((await demo.api.friendRequestsGet()).requests).toHaveLength(3)
    expect(createQuickPanelPreview().pressure).not.toBe(demo.pressure)
  })
  it('opens the actual fuel body immediately with a synthetic estimate', async () => {
    await mount(SetupFuelPanel, { api: createQuickPanelPreview().api, previewExpanded: true, separateView: true, showHeading: true, minutes: 30 })
    expect(document.querySelector('.fuel-body')).not.toBeNull()
    expect(document.querySelector('.fuel-apply')?.textContent).toContain('48 L')
    expect((document.querySelector('input') as HTMLInputElement).value).toBe('30')
  })
  it('normal fuel view remains collapsed after remount', async () => {
    await mount(SetupFuelPanel, { api: createQuickPanelPreview().api, separateView: true })
    expect(document.querySelector('.fuel-body')).toBeNull()
  })
  it('places the expanded editor in the full-width target and cleans it on unmount', async () => {
    const target = document.createElement('div'); target.id = 'preview-fuel'
    document.body.append(target)
    await mount(SetupFuelPanel, { api: createQuickPanelPreview().api, previewExpanded: true, bodyTarget: '#preview-fuel' })
    expect(target.querySelector('.fuel-apply')?.textContent).toContain('48 L')
    expect(document.querySelector('.fuel-panel .fuel-body')).toBeNull()
    app?.unmount(); app = undefined
    expect(target.querySelector('.fuel-body')).toBeNull()
  })
  it('uses the real request card with nickname, queue count and status', async () => {
    await mount(ControlKFriendRequests, { api: createQuickPanelPreview().api })
    expect(document.querySelector('.control-k-request__sender')?.textContent).toContain('Endurance Racing Team')
    expect(document.querySelector('.control-k-request__count')?.textContent).toContain('+2')
    expect(document.querySelector('[role="alert"]')).toBeNull()
  })
  it('renders Pitwall open without contacting the real bridge', async () => {
    await mount(PitwallOverlayButton, { api: createQuickPanelPreview().api })
    expect(document.querySelector('button')?.getAttribute('aria-pressed')).toBe('true')
  })
  it('blocks programmatic wheel clicks as well as native mouse clicks', () => {
    const root = document.createElement('div'), button = document.createElement('button')
    root.append(button); let calls = 0
    root.addEventListener('click', event => blockQuickPanelPreviewAction(event, true), true)
    button.addEventListener('click', () => calls++)
    button.click(); expect(calls).toBe(0)
    const normal = new MouseEvent('click', { cancelable: true })
    blockQuickPanelPreviewAction(normal, false); expect(normal.defaultPrevented).toBe(false)
  })
})
