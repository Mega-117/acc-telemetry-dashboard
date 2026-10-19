// @vitest-environment jsdom
import { createApp, nextTick } from 'vue'
import { afterEach, expect, it, vi } from 'vitest'
import InfoTargetSetup from '~/components/overlay/InfoTargetSetup.vue'
let app: ReturnType<typeof createApp> | null = null
afterEach(() => { app?.unmount(); document.body.innerHTML = '' })
// PIP-556: in Ctrl+K independent MIN | SEC | DEC fields plus the real best/last laps.
it.each([
  ['minutes', [178_800, 58_800]],
  ['seconds', [119_800, 117_800]],
  ['tenths', [118_900, 118_700]],
  ['tolerance', null],
] as const)('edits %s only after confirm and exits without saving', async (field, expected) => {
  const setTime = vi.fn(), setTolerance = vi.fn(), confirm = vi.fn(), keep = vi.fn()
  const el = document.createElement('div'); document.body.append(el)
  app = createApp(InfoTargetSetup, { appearance: 'quick-panel', targetTimeMs: 118800, toleranceMs: 500, keepBetweenSessions: true,
    bestLapMs: 117_432, lastLapMs: 118_961,
    'onSet-target-time': setTime, 'onSelect-tolerance': setTolerance, onConfirm: confirm, 'onToggle-keep': keep })
  const instance = app.mount(el) as unknown as { handleWheelCommand(command: string): boolean }
  expect(instance.handleWheelCommand('next-action')).toBe(false)
  expect([...el.querySelectorAll('[data-overlay-wheel-action]')].map(e => e.getAttribute('data-overlay-wheel-action'))).toEqual([
    'target-minutes', 'target-seconds', 'target-tenths', 'target-use-best', 'target-use-last', 'target-tolerance', 'target-confirm', 'target-cancel'])
  ;(el.querySelector(`[data-overlay-wheel-action="target-${field}"]`) as HTMLButtonElement).click()
  await nextTick(); expect(el.querySelector('.is-editing')).not.toBeNull()
  expect(instance.handleWheelCommand('next-action')).toBe(true)
  expect(instance.handleWheelCommand('previous-action')).toBe(true)
  expect(field === 'tolerance' ? setTolerance : setTime).toHaveBeenCalledTimes(2)
  if (expected) expect(setTime.mock.calls.map(([value]) => value)).toEqual(expected)
  expect(instance.handleWheelCommand('activate-action')).toBe(true)
  expect(instance.handleWheelCommand('next-action')).toBe(false)
  expect(confirm).not.toHaveBeenCalled(); expect(keep).not.toHaveBeenCalled()
  expect(el.querySelector('.target-keep')).toBeNull()
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
