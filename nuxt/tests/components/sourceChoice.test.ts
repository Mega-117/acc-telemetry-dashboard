// @vitest-environment jsdom
import { mount, flushPromises } from '@vue/test-utils'
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import SourceChoice from '~/components/layout/SourceChoice.vue'
import { useGameContext } from '~/composables/useGameContext'
import { setLocale } from '~/i18n'

// Italian assertions (jsdom defaults to English).
setLocale('it')

const state = () => ({ status: 'choice-required', generation: 'a'.repeat(32), available: ['acc', 'evo'], observed_at_ms: Date.now() })
let getSourceSelection: ReturnType<typeof vi.fn>
let selectSource: ReturnType<typeof vi.fn>
beforeEach(() => {
  vi.useFakeTimers()
  getSourceSelection = vi.fn().mockImplementation(async () => state())
  selectSource = vi.fn().mockResolvedValue({ ok: true })
  Object.assign(window, { electronAPI: { getSourceSelection, selectSource } })
  useGameContext().selectGame('acc')
})
afterEach(() => { vi.useRealTimers(); delete (window as any).electronAPI })

describe('recording source choice', () => {
  it('shows both sources, submits current generation, preserves consulted game and stops polling', async () => {
    const view = mount(SourceChoice); await flushPromises()
    expect(view.get('[role="alert"]').text()).toContain('Quale gioco vuoi registrare?')
    expect(view.findAll('button')).toHaveLength(2)
    getSourceSelection.mockResolvedValue({ ...state(), status: 'selected', selected: 'evo' })
    await view.findAll('button')[1]!.trigger('click'); await flushPromises()
    expect(selectSource).toHaveBeenCalledWith({ generation: 'a'.repeat(32), gameId: 'evo' })
    expect(useGameContext().consultedGame.value).toBe('acc')
    expect(view.find('section').exists()).toBe(false)
    view.unmount(); const calls = getSourceSelection.mock.calls.length
    await vi.advanceTimersByTimeAsync(3000)
    expect(getSourceSelection).toHaveBeenCalledTimes(calls)
  })
  it.each([null, { status: 'selected' }, { ...state(), observed_at_ms: 1 }, { ...state(), available: ['acc', 'acc'] }])('hides absent, stale or invalid choices', async raw => {
    getSourceSelection.mockResolvedValue(raw)
    const view = mount(SourceChoice); await flushPromises()
    expect(view.find('section').exists()).toBe(false); view.unmount()
  })
  it('shows rejected choices and retries only with the refreshed generation', async () => {
    selectSource.mockResolvedValue({ ok: false })
    const view = mount(SourceChoice); await flushPromises()
    await view.findAll('button')[0]!.trigger('click'); await flushPromises()
    expect(view.get('[role="status"]').text()).toContain('disponibilità è cambiata')
    getSourceSelection.mockResolvedValue({ ...state(), generation: 'b'.repeat(32) })
    await vi.advanceTimersByTimeAsync(1000); await flushPromises()
    await view.findAll('button')[1]!.trigger('click'); await flushPromises()
    expect(selectSource).toHaveBeenLastCalledWith({ generation: 'b'.repeat(32), gameId: 'evo' }); view.unmount()
  })
  it('handles bridge failure and ignores an outstanding refresh after unmount', async () => {
    selectSource.mockRejectedValue(new Error('offline'))
    const view = mount(SourceChoice); await flushPromises()
    await view.findAll('button')[0]!.trigger('click'); await flushPromises()
    expect(view.get('[role="status"]').text()).toContain('Scelta non salvata')
    let finish!: (value: unknown) => void
    getSourceSelection.mockImplementation(() => new Promise(resolve => { finish = resolve }))
    await vi.advanceTimersByTimeAsync(1000)
    view.unmount(); finish(state()); await flushPromises()
    expect(selectSource).toHaveBeenCalledTimes(1)
  })
})
