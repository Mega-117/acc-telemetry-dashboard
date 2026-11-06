// 06/11 (user): the wheel over the Telemetria's fixed top scrolls the charts below with the same feel.
import { describe, expect, it, vi } from 'vitest'
import { useWheelForward } from '~/composables/useWheelForward'

function box(scrollTop = 0) {
  const scrollTo = vi.fn()
  return { el: { scrollHeight: 1000, clientHeight: 400, scrollTop, scrollTo } as unknown as HTMLElement, scrollTo }
}
const wheel = (deltaY: number, extra: Partial<WheelEvent> = {}) => ({ deltaY, deltaMode: 0, ctrlKey: false, preventDefault: vi.fn(), ...extra }) as unknown as WheelEvent

describe('useWheelForward', () => {
  it('notches in a row add up to one smooth target, clamped to the box', () => {
    const { box: ref, onWheel } = useWheelForward()
    const { el, scrollTo } = box(100)
    ref.value = el
    onWheel(wheel(100))
    onWheel(wheel(100))
    expect(scrollTo.mock.calls.map(c => c[0])).toEqual([{ top: 200, behavior: 'smooth' }, { top: 300, behavior: 'smooth' }])
    onWheel(wheel(5000))
    expect(scrollTo.mock.calls.at(-1)![0].top).toBe(600)
  })

  it('Ctrl + wheel (the charts zoom) and a box with nothing to scroll are left alone', () => {
    const { box: ref, onWheel } = useWheelForward()
    const { el, scrollTo } = box()
    ref.value = el
    const zoom = wheel(100, { ctrlKey: true })
    onWheel(zoom)
    expect(scrollTo).not.toHaveBeenCalled()
    expect(zoom.preventDefault).not.toHaveBeenCalled()
    ref.value = { ...el, scrollHeight: 400 } as unknown as HTMLElement
    onWheel(wheel(100))
    expect(scrollTo).not.toHaveBeenCalled()
  })
})
