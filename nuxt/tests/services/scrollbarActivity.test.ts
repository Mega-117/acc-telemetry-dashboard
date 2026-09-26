// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { installScrollbarActivity } from '~/services/ui/scrollbarActivity'

let dispose: (() => void) | undefined
afterEach(() => { dispose?.(); document.body.innerHTML = ''; vi.useRealTimers() })
describe('global scrollbar activity', () => {
  it('tracks nested and document scrolling independently and resets the idle delay', () => {
    vi.useFakeTimers(); dispose = installScrollbarActivity()
    const parent = document.createElement('div'), child = document.createElement('div')
    document.body.append(parent); parent.append(child)
    child.dispatchEvent(new Event('scroll'))
    expect(child.classList.contains('is-scrolling')).toBe(true)
    expect(parent.classList.contains('is-scrolling')).toBe(false)
    vi.advanceTimersByTime(500)
    child.dispatchEvent(new Event('scroll'))
    document.dispatchEvent(new Event('scroll'))
    vi.advanceTimersByTime(500)
    expect(child.classList.contains('is-scrolling')).toBe(true)
    vi.advanceTimersByTime(150)
    expect(child.classList.contains('is-scrolling')).toBe(false)
    expect(document.documentElement.classList.contains('is-scrolling')).toBe(false)
    child.dispatchEvent(new Event('scroll')); child.remove(); dispose()
    expect(vi.getTimerCount()).toBe(0)
    expect(child.classList.contains('is-scrolling')).toBe(false)
  })
})
