// @vitest-environment jsdom
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { createApp, defineComponent, h, nextTick, ref } from 'vue'
import InfoTargetSetup from '~/components/overlay/InfoTargetSetup.vue'
import { useOverlayActionSelection } from '~/composables/useOverlayActionSelection'

describe('Info Target setup layout contract', () => {
  it('adjusts each drum with the mouse wheel and ignores horizontal-only scrolling', async () => {
    const host = document.createElement('div')
    const time = vi.fn(), tolerance = vi.fn()
    const app = createApp(InfoTargetSetup, {
      targetTimeMs: 90_000, toleranceMs: 500, keepBetweenSessions: false,
      appearance: 'sectors', contextLabel: 'Settori',
      'onSet-target-time': time, 'onSelect-tolerance': tolerance,
    })
    try {
      app.mount(host); await nextTick()
      expect(host.querySelector('.info-target-setup--sectors')).not.toBeNull()
      expect(host.querySelector('header span')?.textContent).toBe('Settori')
      for (const control of host.querySelectorAll('.target-drum, .target-tolerance__control')) {
        for (const deltaY of [0, -1, 1]) {
          control.dispatchEvent(new WheelEvent('wheel', { deltaY, bubbles: true }))
        }
      }
      expect(time.mock.calls.map(([value]) => value)).toEqual([150_000, 30_000, 91_000, 89_000, 90_100, 89_900])
      expect(tolerance.mock.calls.map(([value]) => value)).toEqual([600, 400])
    } finally { app.unmount() }
  })

  it('edits every target control and reaches confirm/cancel through wheel selection', async () => {
    const host = document.createElement('div')
    document.body.append(host)
    const rects = vi.spyOn(HTMLElement.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
    const time = ref(90_000), tolerance = ref(500), keep = ref(false), voice = ref(true)
    const confirm = vi.fn(), cancel = vi.fn()
    let nav!: ReturnType<typeof useOverlayActionSelection>
    const app = createApp(defineComponent({
      setup() {
        const root = ref<HTMLElement | null>(null)
        nav = useOverlayActionSelection(root, () => true)
        return () => h('main', { ref: root }, h(InfoTargetSetup, {
          targetTimeMs: time.value, toleranceMs: tolerance.value, keepBetweenSessions: keep.value,
          'onSet-target-time': (value: number) => { time.value = value },
          'onSelect-tolerance': (value: number) => { tolerance.value = value },
          'onToggle-keep': () => { keep.value = !keep.value },
          showVoiceToggle: true, voiceEnabled: voice.value,
          'onToggle-voice': () => { voice.value = !voice.value },
          onConfirm: confirm, onCancel: cancel,
        }))
      },
    }))
    try {
      app.mount(host); await nextTick(); nav.first()
      const expected = [
        ['target-minutes-increase', 150_000, 500], ['target-minutes-decrease', 90_000, 500],
        ['target-seconds-increase', 91_000, 500], ['target-seconds-decrease', 90_000, 500],
        ['target-tenths-increase', 90_100, 500], ['target-tenths-decrease', 90_000, 500],
        ['target-tolerance-decrease', 90_000, 400], ['target-tolerance-increase', 90_000, 500],
        ['target-voice', 90_000, 500], ['target-keep', 90_000, 500], ['target-confirm', 90_000, 500], ['target-cancel', 90_000, 500],
      ] as const
      for (const [id, expectedTime, expectedTolerance] of expected) {
        expect(nav.selectedId.value).toBe(id)
        expect(host.querySelectorAll('[data-overlay-selected]')).toHaveLength(1)
        nav.activate(); await nextTick()
        expect(time.value).toBe(expectedTime); expect(tolerance.value).toBe(expectedTolerance)
        nav.next()
      }
      expect(voice.value).toBe(false)
      expect(host.querySelector('[data-overlay-wheel-action=target-voice]')?.getAttribute('aria-pressed')).toBe('false')
      expect(keep.value).toBe(true)
      expect(confirm).toHaveBeenCalledTimes(1); expect(cancel).toHaveBeenCalledTimes(1)
      expect(nav.selectedId.value).toBe('target-minutes-increase')
    } finally { app.unmount(); host.remove(); rects.mockRestore() }
  })

  it('keeps tolerance separate from the three-part time picker', () => {
    const source = readFileSync(resolve(process.cwd(), 'app/components/overlay/InfoTargetSetup.vue'), 'utf8')

    expect(source).toContain('v-for="control in timeControls"')
    expect(source).toContain('grid-template-columns: repeat(3, minmax(0, 1fr))')
    expect(source).toContain('<section class="target-tolerance"')
    expect(source).toContain('Margine concesso oltre il target. I giri più veloci restano validi.')
    expect(source).toContain('@wheel.prevent="onWheel(toleranceControl, $event)"')
  })

  it('mantiene Ctrl+K di default e abilita la variante visuale Settori', () => {
    const source = readFileSync(resolve(process.cwd(), 'app/components/overlay/InfoTargetSetup.vue'), 'utf8')

    expect(source).toContain("contextLabel: 'HUD Info'")
    expect(source).toContain("appearance: 'default'")
    expect(source).toContain("'info-target-setup--sectors': appearance === 'sectors'")
    expect(source).toContain('data-overlay-interactive')
  })
})
