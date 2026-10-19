<script setup lang="ts">
import { ref } from 'vue'
import { useOverlayRegionApi } from '~/composables/useOverlayRegionApi'
import { stepNumberField, typeNumberField, type NumberFieldLimits } from '~/utils/controlKNumberField'

// PIP-556: one number field for every Control K editor, usable three ways:
// wheel (OK, then Up/Down: the parent forwards the commands while `editing`),
// mouse (scroll over the field) and keyboard (click, type the digits, Tab to
// the next field, Enter or Esc to finish). No +/- buttons.
const props = withDefaults(defineProps<{
  value: number | null
  label: string
  action: string
  /** Spoken name of the field (aria-label = name + current value). */
  name: string
  min: number
  max: number
  /** Digits shown (zero padded) and accepted while typing. */
  digits?: number
  wrap?: boolean
  prefix?: string
  suffix?: string
  editing?: boolean
  disabled?: boolean
  /** Custom display, e.g. tenths shown as "0,5". */
  format?: (value: number) => string
}>(), { digits: 2, wrap: false, prefix: '', suffix: '', editing: false, disabled: false, format: undefined })
const emit = defineEmits<{ 'update:value': [value: number]; toggle: [] }>()
const getApi = useOverlayRegionApi()
const typed = ref('')
const keyboard = ref(false)
let lastKeyAt = 0

const limits = (): NumberFieldLimits => ({ min: props.min, max: props.max, digits: props.digits, wrap: props.wrap })
const shown = () => props.value === null ? '—' : props.format ? props.format(props.value) : String(props.value).padStart(props.digits, '0')

function step(direction: 1 | -1) {
  if (props.disabled) return
  emit('update:value', stepNumberField(props.value, direction, limits()))
}
function onWheel(event: WheelEvent) {
  if (!event.deltaY || props.disabled) return
  step(event.deltaY < 0 ? 1 : -1)
}
async function requestKeyboard(event: PointerEvent) {
  if (props.disabled || keyboard.value) return
  const target = event.currentTarget as HTMLButtonElement
  try {
    keyboard.value = await getApi()?.trainingOverlayKeyboardEditing?.(true) === true
    if (keyboard.value) target.focus({ preventScroll: true })
  } catch { keyboard.value = false }
}
function releaseKeyboard() {
  typed.value = ''
  if (!keyboard.value) return
  keyboard.value = false
  // Another field of the same editor may take the focus right away (Tab).
  setTimeout(() => {
    if (!(document.activeElement as HTMLElement | null)?.classList?.contains('ck-field')) {
      void getApi()?.trainingOverlayKeyboardEditing?.(false)?.catch?.(() => {})
    }
  }, 0)
}
function onKey(event: KeyboardEvent) {
  if (props.disabled || event.ctrlKey || event.altKey || event.metaKey) return
  if (/^\d$/.test(event.key)) {
    event.preventDefault(); event.stopPropagation()
    const now = Date.now()
    // A pause of more than 1,5 s starts a new number.
    const result = typeNumberField(now - lastKeyAt > 1500 ? '' : typed.value, event.key, limits())
    lastKeyAt = now
    typed.value = result.typed
    emit('update:value', result.value)
    return
  }
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    event.preventDefault(); event.stopPropagation()
    step(event.key === 'ArrowUp' ? 1 : -1)
    return
  }
  if (event.key === 'Backspace') {
    event.preventDefault(); event.stopPropagation()
    typed.value = typed.value.slice(0, -1)
    if (typed.value) emit('update:value', Number(typed.value))
    return
  }
  if (event.key === 'Enter' || event.key === 'Escape') {
    event.preventDefault(); event.stopPropagation()
    ;(event.currentTarget as HTMLButtonElement).blur()
  }
}
</script>

<template>
  <button type="button" class="ck-field" :class="{ 'is-editing': editing || keyboard }" :data-overlay-wheel-action="action"
    :aria-label="`${name}: ${shown()}`" :aria-pressed="editing" :disabled="disabled"
    @click="emit('toggle')" @pointerdown="requestKeyboard" @wheel.prevent.stop="onWheel" @keydown="onKey" @blur="releaseKeyboard">
    <small>{{ label }}</small><strong>{{ prefix }}{{ shown() }}<em v-if="suffix">{{ suffix }}</em></strong>
  </button>
</template>

<style scoped>
.ck-field {
  display: grid; align-content: center; justify-items: center; gap: 2px; min-width: 0; height: 52px; padding: 0;
  border: 1px solid #ffffff30; border-radius: 0; background: #ffffff05; color: #fff; font: inherit; cursor: pointer;
}
.ck-field small { color: #aaa; font-size: 10px; font-weight: 600; letter-spacing: .06em; }
.ck-field strong { font-size: 20px; font-weight: 650; font-variant-numeric: tabular-nums; }
.ck-field em { margin-left: 2px; font-size: 10px; font-style: normal; font-weight: 500; color: #bbb; }
.ck-field:hover:not(:disabled) { background: #ffffff12; }
.ck-field.is-editing { outline: 2px solid #00e5ff; outline-offset: 2px; background: #00e5ff18; }
.ck-field:disabled { opacity: .4; cursor: default; }
</style>
