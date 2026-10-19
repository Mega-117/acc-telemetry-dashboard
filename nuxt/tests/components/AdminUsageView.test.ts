// @vitest-environment jsdom
import { mount } from '@vue/test-utils'
import { describe, expect, it } from 'vitest'
import AdminUsageView from '../../app/components/admin/AdminUsageView.vue'
import type { UsageItem } from '../../app/utils/usageMetrics'
const items: UsageItem[] = Array.from({ length: 26 }, (_, i) => ({ key: `key-${i}`, uid: `pilot-${i}`, summary: {
  schemaVersion: 1, source: 'desktop', producer: 'test-producer', day: '2026-10-19', firstAt: 1, lastAt: 2,
  drivingMs: 3600000, sessions: ['one'], features: ['overlay.tyres'], partial: i === 1,
  outcomes: { started: 2, verified: 1, unknown: 1 },
  context: { game: 'acc', track: 'monza', car: 'ferrari', sessionType: 'practice', mode: 'multiplayer', channel: 'dev', version: 'test' },
} }))
const props = { items, names: { 'pilot-0': 'Pilota sintetico' }, days: ['2026-10-19'], loading: false, updatedAt: Date.now(), error: '', selected: '', details: [], detailLoading: false, detailError: '', preferences: { 'pilot-0': { enabled: false } } }
describe('admin usage view', () => {
  it('uses complete totals while paginating 25 visible users and distinguishes disabled coverage', async () => {
    const view = mount(AdminUsageView, { props })
    expect(view.findAll('tbody tr')).toHaveLength(25)
    expect(view.find('.metrics').text()).toContain('26,0')
    expect(view.text()).toContain('Raccolta disattivata')
    await view.findAll('button').find(b => b.text() === 'Successiva')!.trigger('click')
    expect(view.findAll('tbody tr')).toHaveLength(1)
    view.unmount()
  })
  it('filters by name, opens details on explicit selection, retains stale status', async () => {
    const view = mount(AdminUsageView, { props: { ...props, error: 'Rete non disponibile.' } })
    await view.find('input[type="search"]').setValue('Pilota sintetico')
    expect(view.findAll('tbody tr')).toHaveLength(1)
    await view.find('.user-name').trigger('click')
    expect(view.emitted('select')?.[0]).toEqual(['pilot-0'])
    expect(view.find('[role="alert"]').text()).toContain('ultimo risultato valido')
    view.unmount()
  })
})
