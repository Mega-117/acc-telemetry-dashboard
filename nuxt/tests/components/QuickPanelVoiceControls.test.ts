// @vitest-environment jsdom
import { createApp, h, nextTick, ref } from 'vue'
import { afterEach, describe, expect, it, vi } from 'vitest'
import QuickPanelVoiceControls from '~/components/overlay/QuickPanelVoiceControls.vue'
import PitwallOverlayButton from '~/components/pitwall/PitwallOverlayButton.vue'
import { useOverlayActionSelection } from '~/composables/useOverlayActionSelection'

let app: ReturnType<typeof createApp> | undefined
afterEach(() => { app?.unmount(); document.body.innerHTML = ''; vi.restoreAllMocks() })

describe('Ctrl+K voice switches', () => {
  it('shows real Pitwall states independently of pointer selection, without changing its visible label', async () => {
    let update: (value: { state: string; available: boolean; roomId: null; reason: null }) => void = () => {}
    const host = document.createElement('div'); document.body.append(host)
    const toggle = vi.fn()
    app = createApp(PitwallOverlayButton, { selected: true, api: {
      trainingOverlayPitwallToggle: toggle,
      onPitwallIntentState: (callback: typeof update) => { update = callback; return () => {} },
    } })
    app.mount(host)
    const button = host.querySelector('button')!
    expect(button.disabled).toBe(true)
    for (const state of ['off', 'arming', 'open']) {
      update({ state, available: true, roomId: null, reason: null }); await nextTick()
      expect(button.dataset.state).toBe(state)
      expect(button.textContent?.trim()).toBe('Pitwall')
      expect(button.getAttribute('aria-pressed')).toBe(String(state === 'open'))
      expect(button.querySelector('svg')).not.toBeNull()
    }
    button.click(); await nextTick()
    expect(toggle).toHaveBeenCalledTimes(1)
  })
  it('keeps labels stable while mouse and wheel activation toggle each independent setting once', async () => {
    vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
    const values = ref({ coach: false, references: true, pressure: false, target: true })
    const calls = { coach: vi.fn(), references: vi.fn(), pressure: vi.fn(), target: vi.fn() }
    let selection!: ReturnType<typeof useOverlayActionSelection>
    const host = document.createElement('div'); document.body.append(host)
    app = createApp({ setup() {
      const root = ref<HTMLElement | null>(null)
      selection = useOverlayActionSelection(root, () => true)
      const toggle = (key: keyof typeof calls) => { calls[key](); values.value[key] = !values.value[key] }
      return () => h('div', { ref: root }, [h(QuickPanelVoiceControls, { ...values.value, disabled: false,
        'onToggle-coach': () => toggle('coach'), 'onToggle-references': () => toggle('references'),
        'onToggle-pressure': () => toggle('pressure'), 'onToggle-target': () => toggle('target'),
      })])
    } })
    app.mount(host); await nextTick()
    const buttons = [...host.querySelectorAll<HTMLButtonElement>('[role="switch"]')]
    expect(buttons.map(b => b.dataset.overlayWheelAction)).toEqual(['coach', 'references', 'pressure-audio', 'target-voice'])
    const labels = buttons.map(b => b.getAttribute('aria-label'))
    buttons[0]!.click(); await nextTick()
    expect(buttons[0]!.getAttribute('aria-checked')).toBe('true')
    selection.select('references'); selection.activate(); await nextTick()
    selection.next(); selection.activate(); await nextTick()
    selection.next(); selection.activate(); await nextTick()
    expect(values.value).toEqual({ coach: true, references: false, pressure: true, target: false })
    Object.values(calls).forEach(call => expect(call).toHaveBeenCalledTimes(1))
    expect(buttons.map(b => b.getAttribute('aria-label'))).toEqual(labels)
    expect(host.textContent).not.toMatch(/Attiva|Disattiva/)
    expect(host.querySelectorAll('[data-overlay-selected]')).toHaveLength(1)
  })

  it('disables all switches when the runtime does not allow spotter controls', async () => {
    const callback = vi.fn()
    const host = document.createElement('div'); document.body.append(host)
    app = createApp(QuickPanelVoiceControls, { coach: false, references: false, pressure: false, target: false, disabled: true, 'onToggle-coach': callback })
    app.mount(host)
    const buttons = [...host.querySelectorAll<HTMLButtonElement>('button')]
    expect(buttons).toHaveLength(4)
    buttons.forEach(button => { expect(button.disabled).toBe(true); button.click() })
    await nextTick(); expect(callback).not.toHaveBeenCalled()
  })
})
