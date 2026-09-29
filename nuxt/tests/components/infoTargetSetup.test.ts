// @vitest-environment jsdom
import { createApp, nextTick } from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import InfoTargetSetup from '~/components/overlay/InfoTargetSetup.vue'
let app: ReturnType<typeof createApp> | null = null
afterEach(() => { app?.unmount(); document.body.innerHTML = '' })
it.each(['minutes', 'seconds', 'tenths', 'tolerance'])('edits %s only after confirm and exits without saving', async field => {
  const setTime = vi.fn(), setTolerance = vi.fn(), confirm = vi.fn(), keep = vi.fn()
  const el = document.createElement('div'); document.body.append(el)
  app = createApp(InfoTargetSetup, { appearance: 'quick-panel', targetTimeMs: 118800, toleranceMs: 500, keepBetweenSessions: true,
    'onSet-target-time': setTime, 'onSelect-tolerance': setTolerance, onConfirm: confirm, 'onToggle-keep': keep })
  const instance = app.mount(el) as unknown as { handleWheelCommand(command: string): boolean }
  expect(instance.handleWheelCommand('next-action')).toBe(false)
  expect([...el.querySelectorAll('[data-overlay-wheel-action]')].map(e => e.getAttribute('data-overlay-wheel-action'))).toEqual([
    'target-minutes', 'target-seconds', 'target-tenths', 'target-tolerance', 'target-confirm', 'target-cancel'])
  ;(el.querySelector(`[data-overlay-wheel-action="target-${field}"]`) as HTMLButtonElement).click()
  await nextTick(); expect(el.querySelector('.is-editing')).not.toBeNull()
  expect(instance.handleWheelCommand('next-action')).toBe(true)
  expect(instance.handleWheelCommand('previous-action')).toBe(true)
  expect(field === 'tolerance' ? setTolerance : setTime).toHaveBeenCalledTimes(2)
  expect(instance.handleWheelCommand('activate-action')).toBe(true)
  expect(instance.handleWheelCommand('next-action')).toBe(false)
  expect(confirm).not.toHaveBeenCalled(); expect(keep).not.toHaveBeenCalled()
  expect(el.querySelector('.target-keep')).toBeNull()
})
