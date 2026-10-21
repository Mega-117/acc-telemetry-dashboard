// Keyboard side of a command assignment: while the bridge is capturing (any device or the
// keyboard/button-box reader), a single key press-and-release becomes the binding. Shared by
// Impostazioni > Comandi and the onboarding command setup (PIP-571).
import { onBeforeUnmount, onMounted, ref, type DeepReadonly, type Ref } from 'vue'
import { KEY_HINT_INVALID, KEY_HINT_RELEASE } from '~/services/controls/commandCapture'
import { keyboardButton, type WheelControlsState } from '~/services/controls/wheelBindingModel'

interface KeyboardCaptureBridge {
  state: Readonly<Ref<DeepReadonly<WheelControlsState>>>
  captureKey: (key: number) => Promise<void>
  cancelCapture: () => Promise<void>
}

export function useKeyboardCapture(bridge: KeyboardCaptureBridge) {
  const keyHint = ref('')
  let pendingKey: number | null = null

  const reset = () => { pendingKey = null; keyHint.value = '' }
  const onKeyDown = (event: KeyboardEvent) => {
    const capture = bridge.state.value.capture
    if (!capture) return
    if (event.key === 'Escape') { event.preventDefault(); event.stopImmediatePropagation(); void bridge.cancelCapture(); pendingKey = null; return }
    if (capture.deviceId && capture.deviceId !== 'keyboard:system') return
    event.preventDefault()
    event.stopImmediatePropagation()
    if (event.repeat) return
    pendingKey = keyboardButton(event)
    keyHint.value = pendingKey === null ? KEY_HINT_INVALID : KEY_HINT_RELEASE
  }
  const onKeyUp = (event: KeyboardEvent) => {
    if (pendingKey === null || !bridge.state.value.capture) return
    event.preventDefault()
    event.stopImmediatePropagation()
    if (keyboardButton(event) === pendingKey) { void bridge.captureKey(pendingKey); reset() }
  }
  const onBlur = () => { pendingKey = null }

  onMounted(() => {
    window.addEventListener('keydown', onKeyDown, true)
    window.addEventListener('keyup', onKeyUp, true)
    window.addEventListener('blur', onBlur)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('keydown', onKeyDown, true)
    window.removeEventListener('keyup', onKeyUp, true)
    window.removeEventListener('blur', onBlur)
  })

  return { keyHint, reset }
}
