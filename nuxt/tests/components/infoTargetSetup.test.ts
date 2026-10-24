// @vitest-environment jsdom
import { createApp, nextTick } from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import InfoTargetSetup from '~/components/overlay/InfoTargetSetup.vue'
let app: ReturnType<typeof createApp> | null = null
afterEach(() => { app?.unmount(); document.body.innerHTML = '' })
function mountSetup() {
  const setTime = vi.fn(), setTolerance = vi.fn(), confirm = vi.fn(), keep = vi.fn()
  const el = document.createElement('div'); document.body.append(el)
  app = createApp(InfoTargetSetup, { appearance: 'quick-panel', targetTimeMs: 118800, toleranceMs: 500, keepBetweenSessions: true,
    bestLapMs: 117_432, lastLapMs: 118_961,
    'onSet-target-time': setTime, 'onSelect-tolerance': setTolerance, onConfirm: confirm, 'onToggle-keep': keep })
  const instance = app.mount(el) as unknown as { handleWheelCommand(command: string): boolean }
  const field = (id: string) => el.querySelector(`[data-overlay-wheel-action="target-${id}"]`) as HTMLButtonElement
  return { el, instance, field, setTime, setTolerance, confirm, keep }
}
// PIP-611: in Ctrl+K one lap time field (1:58,8) and the tolerance, plus the real best/last laps.
it('engages the lap time from the wheel: SEC, then DEC, then MIN, never saving on its own', async () => {
  const { el, instance, field, setTime, confirm, keep } = mountSetup()
  expect(instance.handleWheelCommand('next-action')).toBe(false)
  expect([...el.querySelectorAll('[data-overlay-wheel-action]')].map(e => e.getAttribute('data-overlay-wheel-action'))).toEqual([
    // ← (same as Back, discards) first, then fields, shortcuts, the one primary action.
    'target-cancel', 'target-time', 'target-tolerance', 'target-use-best', 'target-use-last', 'target-confirm'])
  expect(field('time').textContent).toContain('1:58,8')
  field('time').click(); await nextTick()
  expect(el.querySelector('.is-active')?.textContent).toBe('58')
  expect(instance.handleWheelCommand('next-action')).toBe(true)
  expect(instance.handleWheelCommand('previous-action')).toBe(true)
  expect(instance.handleWheelCommand('activate-action')).toBe(true); await nextTick()
  expect(el.querySelector('.is-active')?.textContent).toBe('8')
  expect(instance.handleWheelCommand('next-action')).toBe(true)
  // The prop stays 1:58,8 here (no parent): each step starts from it.
  expect(setTime.mock.calls.map(([value]) => value)).toEqual([119_800, 117_800, 118_900])
  expect(instance.handleWheelCommand('activate-action')).toBe(true); await nextTick()
  expect(el.querySelector('.is-active')?.textContent).toBe('1')
  expect(instance.handleWheelCommand('activate-action')).toBe(true)
  expect(instance.handleWheelCommand('next-action')).toBe(false)
  expect(confirm).not.toHaveBeenCalled(); expect(keep).not.toHaveBeenCalled()
  expect(el.querySelector('.target-keep')).toBeNull()
})
it('types the lap time from the right and the tolerance in tenths', async () => {
  const { field, setTime, setTolerance } = mountSetup()
  for (const key of ['1', '3', '0', '5']) field('time').dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }))
  expect(setTime.mock.calls.at(-1)?.[0]).toBe(90_500)
  field('tolerance').dispatchEvent(new KeyboardEvent('keydown', { key: '8', bubbles: true, cancelable: true }))
  expect(setTolerance.mock.calls.at(-1)?.[0]).toBe(800)
  // Esc puts back the value the field had before typing.
  field('time').dispatchEvent(new KeyboardEvent('keydown', { key: '7', bubbles: true, cancelable: true }))
  field('time').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
  expect(setTime.mock.calls.at(-1)?.[0]).toBe(118_800)
})
it('a real mouse click does not engage the wheel editing, and ends one already engaged', async () => {
  const { el, instance, field } = mountSetup()
  field('time').dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })); await nextTick()
  expect(el.querySelector('.is-active')).toBeNull()
  field('time').click(); await nextTick()
  expect(el.querySelector('.is-active')).not.toBeNull()
  field('tolerance').dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 })); await nextTick()
  expect(el.querySelector('.is-active')).toBeNull()
  expect(instance.handleWheelCommand('next-action')).toBe(false)
})
it('uses the best or last lap rounded to the tenth in one press', async () => {
  const setTime = vi.fn()
  const el = document.createElement('div'); document.body.append(el)
  app = createApp(InfoTargetSetup, { appearance: 'quick-panel', targetTimeMs: 120_000, toleranceMs: 500, keepBetweenSessions: false,
    bestLapMs: 117_432, lastLapMs: 118_961, 'onSet-target-time': setTime })
  app.mount(el)
  ;(el.querySelector('[data-overlay-wheel-action="target-use-best"]') as HTMLButtonElement).click()
  ;(el.querySelector('[data-overlay-wheel-action="target-use-last"]') as HTMLButtonElement).click()
  expect(setTime.mock.calls.map(([value]) => value)).toEqual([117_400, 119_000])
  expect(el.textContent).toContain('Giro obiettivo')
})
