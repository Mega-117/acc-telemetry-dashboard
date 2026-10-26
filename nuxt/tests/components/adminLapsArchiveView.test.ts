// @vitest-environment jsdom
// PIP-623: pannello admin "Archivio giri".
import { describe, expect, it } from 'vitest'
import { mount } from '@vue/test-utils'
import AdminLapsArchiveView from '~/components/admin/AdminLapsArchiveView.vue'
import { lapsArchiveModel } from '~/repositories/lapsArchiveRepository'

const NOW = Date.now()
const today = new Date(NOW).toISOString().slice(0, 10)
const model = (overrides = {}) => lapsArchiveModel({
  decision: { enabled: true, reason: 'ok' },
  state: { checkedAt: new Date(NOW).toISOString(), storageBytes: 3.5 * 1024 ** 3, classAMonth: 1000, classBMonth: 10 },
  override: null, lastSync: null,
  days: { [today]: { 'uid-1': { uploads: 8, shares: 2 } } },
  rejections: [{ day: today, reason: 'daily-cap', uid: 'uid-1' }],
  ...overrides,
}, NOW)

describe('AdminLapsArchiveView', () => {
  it('shows usage on the free tier, the switch, pilots by name and rejections', async () => {
    const view = mount(AdminLapsArchiveView, { props: { model: model(), names: { 'uid-1': 'Rico' }, loading: false, error: '', switching: false } })
    expect(view.text()).toContain('Caricamenti attivi')
    expect(view.text()).toContain('35%')
    expect(view.find('article.warn').exists()).toBe(true)
    expect(view.text()).toContain('Rico')
    expect(view.text()).toContain('daily-cap')
    expect(view.text()).toContain('mai')
    await view.findAll('.status button')[0]!.trigger('click')
    expect(view.emitted('switch')![0]).toEqual(['off'])
  })

  it('offers to switch back on when the admin turned it off', async () => {
    const view = mount(AdminLapsArchiveView, { props: { model: model({ decision: { enabled: false, reason: 'admin-off' } }), names: {}, loading: false, error: '', switching: false } })
    expect(view.text()).toContain('Caricamenti spenti')
    await view.get('.status button').trigger('click')
    expect(view.emitted('switch')![0]).toEqual(['auto'])
  })
})
