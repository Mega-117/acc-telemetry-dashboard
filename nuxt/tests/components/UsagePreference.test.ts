// @vitest-environment jsdom
import { mount, flushPromises } from '@vue/test-utils'
import { describe, expect, it, vi } from 'vitest'
vi.mock('../../app/services/usage/usageClient', () => ({ usagePreference: vi.fn() }))
import { usagePreference } from '../../app/services/usage/usageClient'
import UsagePreference from '../../app/components/UsagePreference.vue'
describe('usage preference', () => {
  it('loads the account preference and explains an offline opt-out', async () => {
    vi.mocked(usagePreference).mockResolvedValueOnce({ enabled: true, revision: 0 }).mockRejectedValueOnce(Error('offline'))
    const view = mount(UsagePreference); await flushPromises()
    expect((view.find('input').element as HTMLInputElement).checked).toBe(true)
    await view.find('input').setValue(false); await flushPromises()
    expect(usagePreference).toHaveBeenLastCalledWith(false)
    expect(view.text()).toContain('Raccolta fermata su questo dispositivo')
    expect((view.find('input').element as HTMLInputElement).checked).toBe(false)
    view.unmount()
  })
  it('keeps unavailable distinct from disabled and supports retry', async () => {
    vi.mocked(usagePreference).mockRejectedValueOnce(Error('offline')).mockResolvedValueOnce({ enabled: false, revision: 1 })
    const view = mount(UsagePreference); await flushPromises()
    expect(view.find('input').attributes('disabled')).toBeDefined()
    await view.find('button').trigger('click'); await flushPromises()
    expect(view.find('input').attributes('disabled')).toBeUndefined()
    expect((view.find('input').element as HTMLInputElement).checked).toBe(false)
    view.unmount()
  })
  it('tells the user summaries stay 90 days', async () => {
    vi.mocked(usagePreference).mockResolvedValueOnce({ enabled: true, revision: 0 })
    const view = mount(UsagePreference); await flushPromises()
    expect(view.text()).toContain('restano disponibili per 90 giorni')
    view.unmount()
  })
})
