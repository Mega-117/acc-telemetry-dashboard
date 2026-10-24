<script setup lang="ts">
import { ChevronDown, ChevronUp, ChevronsUpDown } from '@lucide/vue'
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import { useOverlayRegionApi } from '~/composables/useOverlayRegionApi'
import {
  fieldStartPart, formatFieldParts, splitField, stepField, typeFieldDigit, typedFieldParts, typedFieldText, typedFieldValue, type NumberFieldSpec,
} from '~/utils/controlKNumberField'

// PIP-556 / PIP-611: one field for every Control K value, even when it has parts
// (1:30,5). Three ways to use it, rules in utils/controlKNumberField.ts:
// wheel (OK engages a part, Up/Down change it, OK next part: the parent forwards
// the commands while `part` is set), mouse (scroll over a part) and keyboard
// (click, type the digits: they enter from the right; Enter keeps, Esc restores).
const props = withDefaults(defineProps<{
  value: number | null
  spec: NumberFieldSpec
  label: string
  action: string
  /** Spoken name of the field (aria-label = name + current value). */
  name: string
  /** Part engaged from the wheel, null when the field is not engaged. */
  part?: number | null
  suffix?: string
  disabled?: boolean
}>(), { part: null, suffix: '', disabled: false })
// update:value null only when Esc/Backspace bring back a field that was empty.
// release: a real mouse click, the wheel engagement of any field ends.
const emit = defineEmits<{ 'update:value': [value: number | null]; toggle: []; release: [] }>()
const getApi = useOverlayRegionApi()
const keyboard = ref(false)
// null: not typing; '' after Backspace removed every digit.
const typed = ref<string | null>(null)
let valueBeforeTyping: number | null = null

// The value changed from elsewhere (wheel, preset, best lap): the typed digits are stale.
watch(() => props.value, value => {
  if (typed.value !== null && value !== typedFieldValue(typed.value, props.spec)) typed.value = null
})
// While typing the parts are the digits as written, so the pointer still finds them.
const parts = computed(() => typed.value !== null ? typedFieldParts(typed.value, props.spec)
  : props.value === null ? null : splitField(props.value, props.spec))
const shown = computed(() => typed.value !== null ? typedFieldText(typed.value, props.spec)
  : parts.value ? formatFieldParts(parts.value, props.spec) : '—')
// What is drawn: each part with its separator; a single formatted value is one part.
const shownParts = computed(() => {
  if (props.spec.parts.length === 1 || props.spec.format || !parts.value) return [{ separator: '', text: shown.value }]
  return props.spec.parts.map((part, index) => ({ separator: part.separator ?? '',
    text: String(parts.value![index] ?? 0).padStart(part.pad ?? (index === 0 ? 1 : part.digits), '0') }))
})

// PIP-611: ▲/▼ appear on the part under the mouse or engaged from the wheel.
// Pressed with the mouse they step that part; held down they repeat.
let repeatDelay: ReturnType<typeof setTimeout> | undefined
let repeatEvery: ReturnType<typeof setInterval> | undefined
function stopRepeat() { clearTimeout(repeatDelay); clearInterval(repeatEvery); repeatDelay = repeatEvery = undefined }
function arrowAt(event: Event) { return (event.target as HTMLElement | null)?.closest?.('[data-step]') as HTMLElement | null }
function onArrowPress(event: PointerEvent, arrow: HTMLElement) {
  event.preventDefault(); event.stopPropagation()
  if (props.disabled) return
  emit('release')
  const index = Number((arrow.closest('[data-part]') as HTMLElement).dataset.part)
  const direction = arrow.dataset.step === '1' ? 1 : -1
  stopRepeat()
  step(index, direction)
  repeatDelay = setTimeout(() => { repeatEvery = setInterval(() => step(index, direction), 100) }, 400)
  window.addEventListener('pointerup', stopRepeat, { once: true })
  window.addEventListener('pointercancel', stopRepeat, { once: true })
}
onBeforeUnmount(stopRepeat)
function onPointerDown(event: PointerEvent) {
  const arrow = arrowAt(event)
  if (arrow) onArrowPress(event, arrow)
  else void requestKeyboard(event)
}

function step(index: number, direction: 1 | -1) {
  if (props.disabled) return
  typed.value = null
  emit('update:value', stepField(props.value, index, direction, props.spec))
}
function onWheel(event: WheelEvent) {
  if (!event.deltaY || props.disabled) return
  const hovered = (event.target as HTMLElement | null)?.closest?.('[data-part]') as HTMLElement | null
  const index = hovered ? Number(hovered.dataset.part) : props.part ?? fieldStartPart(props.spec)
  step(index, event.deltaY < 0 ? 1 : -1)
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
  typed.value = null
  if (!keyboard.value) return
  keyboard.value = false
  // Another field of the same editor may take the focus right away (Tab).
  setTimeout(() => {
    if (!(document.activeElement as HTMLElement | null)?.classList?.contains('ck-field')) {
      void getApi()?.trainingOverlayKeyboardEditing?.(false)?.catch?.(() => {})
    }
  }, 0)
}
// OK from the wheel arrives as a synthetic click (detail 0) and engages a part;
// a real mouse click only opens the keyboard: the driver types or scrolls.
function onClick(event: MouseEvent) {
  if (arrowAt(event)) return // already handled on press
  if (event.detail === 0) emit('toggle')
  else emit('release')
}
function consume(event: KeyboardEvent) { event.preventDefault(); event.stopPropagation() }
function onKey(event: KeyboardEvent) {
  if (props.disabled || event.ctrlKey || event.altKey || event.metaKey) return
  if (/^\d$/.test(event.key)) {
    consume(event)
    // The first digit replaces the value: no need to clear the field first.
    if (typed.value === null) valueBeforeTyping = props.value
    typed.value = typeFieldDigit(typed.value ?? '', event.key, props.spec)
    emit('update:value', typedFieldValue(typed.value, props.spec))
    return
  }
  if (event.key === 'Backspace') {
    consume(event)
    if (typed.value === null) return
    typed.value = typed.value.slice(0, -1)
    if (typed.value) { emit('update:value', typedFieldValue(typed.value, props.spec)); return }
    // Every digit removed: the field shows again the value it had before typing.
    typed.value = null
    emit('update:value', valueBeforeTyping)
    return
  }
  if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
    consume(event)
    step(props.part ?? fieldStartPart(props.spec), event.key === 'ArrowUp' ? 1 : -1)
    return
  }
  if (event.key === 'Escape' && typed.value !== null) emit('update:value', valueBeforeTyping)
  if (event.key === 'Enter' || event.key === 'Escape') {
    consume(event)
    typed.value = null
    ;(event.currentTarget as HTMLButtonElement).blur()
  }
}
</script>

<template>
  <button type="button" class="ck-field" :class="{ 'is-editing': part !== null || keyboard, 'is-keyboard': keyboard, 'is-typing': typed !== null }"
    :data-overlay-wheel-action="action" :aria-label="`${name}: ${shown}`" :aria-pressed="part !== null" :disabled="disabled"
    @click="onClick" @pointerdown="onPointerDown" @wheel.prevent.stop="onWheel" @keydown="onKey" @blur="releaseKeyboard">
    <small>{{ label }}</small>
    <ChevronsUpDown class="ck-field__hint" :size="12" aria-hidden="true" />
    <strong>
      <template v-for="(item, index) in shownParts" :key="index">{{ item.separator }}<span class="ck-field__part" :data-part="index"
        :class="{ 'is-active': part === index }"><span class="ck-field__arrow ck-field__arrow--up" data-step="1" aria-hidden="true"><ChevronUp :size="16"
        /></span>{{ item.text }}<span class="ck-field__arrow ck-field__arrow--down" data-step="-1" aria-hidden="true"><ChevronDown :size="16"
        /></span></span></template><em v-if="suffix">{{ suffix }}</em>
    </strong>
  </button>
</template>

<style scoped>
/* Same language as the Control K cells: square, thin border, red Racer Core accent. */
.ck-field {
  position: relative; display: grid; grid-template-rows: 12px 1fr; justify-items: center; align-items: center; min-width: 0; height: 88px;
  padding: 6px 8px 4px; border: 1px solid #ffffff30; border-radius: 0; background: #ffffff08; color: #fff; font: inherit; cursor: text;
}
.ck-field small { color: #aaa; font-size: 10px; font-weight: 600; letter-spacing: .06em; line-height: 12px; }
.ck-field strong { font-size: 24px; font-weight: 700; line-height: 28px; font-variant-numeric: tabular-nums; white-space: nowrap; }
.ck-field em { margin-left: 2px; font-size: 11px; font-style: normal; font-weight: 500; color: #bbb; }
.ck-field__part { position: relative; display: inline-block; padding: 0 2px; }
/* ▲ above and ▼ below the part: hidden at rest, shown under the mouse or when engaged. */
.ck-field__arrow {
  position: absolute; left: 50%; display: grid; place-items: center; width: 30px; height: 17px; margin-left: -15px;
  border: 1px solid #ffffff40; background: #1a1a1a; color: #fff; opacity: 0; pointer-events: none; cursor: pointer;
  transition: opacity 80ms ease;
}
.ck-field__arrow--up { bottom: calc(100% + 1px); }
.ck-field__arrow--down { top: calc(100% + 1px); }
.ck-field:not(:disabled) .ck-field__part:hover .ck-field__arrow,
.ck-field__part.is-active .ck-field__arrow { opacity: 1; pointer-events: auto; }
.ck-field__arrow:hover { border-color: #ff0024; background: #ff002430; }
/* At rest a small ⇅ in the corner says the value can be changed. */
.ck-field__hint { position: absolute; top: 4px; right: 4px; color: #ffffff70; }
.ck-field:hover .ck-field__hint, .ck-field.is-editing .ck-field__hint, .ck-field:disabled .ck-field__hint { display: none; }
/* The part changed by Up/Down (engaged from the wheel), like a pressed Control K choice. */
.ck-field__part.is-active { background: #ff002426; box-shadow: inset 0 -2px #ff0024; }
.ck-field:hover:not(:disabled) { background: #ffffff12; }
.ck-field.is-editing { border-color: #ff0024; background: #ff00240f; }
/* Clicked for typing: a blinking caret after the value. */
.ck-field.is-keyboard { border-color: #ffffff90; }
.ck-field.is-keyboard strong::after {
  content: ''; display: inline-block; width: 2px; height: 22px; margin-left: 3px; vertical-align: -3px; background: #ff0024;
  animation: ck-caret 1s steps(1) infinite;
}
@keyframes ck-caret { 50% { opacity: 0; } }
@media (prefers-reduced-motion: reduce) { .ck-field.is-keyboard strong::after { animation: none; } }
.ck-field:disabled { opacity: .4; cursor: default; }
</style>
