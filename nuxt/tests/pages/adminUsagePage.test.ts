// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'

const mocks = vi.hoisted(() => ({
  usage: vi.fn(),
  names: vi.fn(),
}))

vi.mock('~/repositories/usageRepository', () => ({
  loadUsage: mocks.usage,
  loadUsageNames: mocks.names,
  loadUsageDetails: vi.fn(async () => []),
  loadUsagePreferences: vi.fn(async () => ({})),
}))
vi.mock('~/components/admin/AdminUsageView.vue', () => ({
  default: { props: ['items', 'names', 'error'], template: '<div class="view">{{ items.length }}|{{ JSON.stringify(names) }}|{{ error }}</div>' },
}))

import UsagePage from '~/pages/admin/utilizzo.vue'

beforeEach(() => {
  vi.stubGlobal('definePageMeta', vi.fn())
  vi.stubGlobal('useHead', vi.fn())
  vi.clearAllMocks()
  vi.spyOn(console, 'warn').mockImplementation(() => {})
})
afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('admin usage page', () => {
  it('PIP-591: shows the R2 usage even when the pilot names cannot be read', async () => {
    mocks.usage.mockResolvedValue([{ key: 'k1', uid: 'u1' }, { key: 'k2', uid: 'u2' }])
    mocks.names.mockRejectedValue(new Error('quota'))
    const view = mount(UsagePage)
    await flushPromises()
    const [count, names, error] = view.get('.view').text().split('|')
    expect(count).toBe('2')
    expect(names).toBe('{}')
    expect(error).toBe('')
  })

  it('keeps the names already known when a later refresh cannot read them', async () => {
    mocks.usage.mockResolvedValue([{ key: 'k1', uid: 'u1' }])
    mocks.names.mockResolvedValueOnce({ u1: 'Mario' }).mockRejectedValueOnce(new Error('quota'))
    const view = mount(UsagePage)
    await flushPromises()
    await (view.vm as unknown as { $: { setupState: { refresh: () => Promise<void> } } }).$.setupState.refresh()
    await flushPromises()
    expect(view.get('.view').text()).toContain('"u1":"Mario"')
  })
})
