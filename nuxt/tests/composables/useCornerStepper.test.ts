// @vitest-environment jsdom
// PIP-635: tasti ← → per la curva precedente / successiva, Esc per il giro intero.
import { describe, expect, it } from 'vitest'
import { defineComponent, h, ref } from 'vue'
import { mount } from '@vue/test-utils'
import { useCornerStepper } from '~/composables/useCornerStepper'

const corners = ref([1, 2, 3].map(n => ({ number: n, start: n / 10, apex: n / 10 + 0.02, end: n / 10 + 0.05, minSpeedKmh: 100 })))
function setup(active = true) {
  const state = { selectedCorner: ref<number | null>(3), selectedSector: ref<number | null>(null), zoomRange: ref<[number, number] | null>([0.1, 0.2]), cursor: ref<number | null>(0.21), whole: 0 }
  let api!: ReturnType<typeof useCornerStepper>
  const wrapper = mount(defineComponent({ setup() {
    api = useCornerStepper({ active: () => active, corners, ...state, wholeLap: () => { state.whole++ } })
    return () => h('input')
  } }), { attachTo: document.body })
  return { state, api: () => api, wrapper }
}
const press = (key: string, target: EventTarget = window) => target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))

describe('useCornerStepper', () => {
  it('steps round the lap with the arrow keys and clears zoom and sector', () => {
    const { state, wrapper } = setup()
    press('ArrowRight')
    expect(state.selectedCorner.value).toBe(1)
    expect(state.zoomRange.value).toBeNull()
    press('ArrowLeft')
    expect(state.selectedCorner.value).toBe(3)
    press('Escape')
    expect(state.whole).toBe(1)
    wrapper.unmount()
  })

  it('leaves the arrows to inputs, and does nothing in other layouts', () => {
    const { state, wrapper } = setup()
    press('ArrowRight', wrapper.get('input').element)
    expect(state.selectedCorner.value).toBe(3)
    wrapper.unmount()
    const off = setup(false)
    press('ArrowRight')
    expect(off.state.selectedCorner.value).toBe(3)
    off.wrapper.unmount()
  })

  it('names the corner under the cursor, nothing on the straights', () => {
    const { state, api, wrapper } = setup()
    expect(api().cursorCorner.value).toBe('C2')
    state.cursor.value = 0.5
    expect(api().cursorCorner.value).toBeNull()
    wrapper.unmount()
  })
})
