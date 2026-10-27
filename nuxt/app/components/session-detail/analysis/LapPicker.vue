<script setup lang="ts">
// PIP-635: scelta del giro (Tu / Riferimento) nello stile del sito, al posto della select del sistema:
// il best in viola come nei tempi del gioco, i giri non validi in rosso, i parziali spenti e non sceglibili.
import { computed, nextTick, ref, useId } from 'vue'
import { vClickOutside } from '~/directives/clickOutside'

export interface LapOption { id: string, title: string, time: string, conditions: string, valid: boolean, complete: boolean, best: boolean }
export interface LapGroup { label: string, options: LapOption[] }
/** Extra actions under the list, about this lap choice (paste another pilot's lap, share yours). */
export interface LapAction { id: string, label: string, disabled?: boolean, hint?: string }

const props = defineProps<{ modelValue: string, groups: LapGroup[], name: string, color: string, disabled?: boolean, hint?: string, actions?: LapAction[] }>()
const emit = defineEmits<{ 'update:modelValue': [id: string], 'action': [id: string] }>()

const open = ref(false)
const active = ref('')
const root = ref<HTMLElement | null>(null)
const button = ref<HTMLButtonElement | null>(null)
const list = ref<HTMLElement | null>(null)
const all = computed(() => props.groups.flatMap(g => g.options))
const choosable = computed(() => all.value.filter(o => o.complete))
const current = computed(() => all.value.find(o => o.id === props.modelValue) ?? null)
const uid = useId()

// Keyboard (WAI-ARIA select-only pattern): opening moves the focus to the listbox, which carries the active
// option; Tab goes on to the actions under it; Escape or a choice gives the focus back to the button.
function show() {
  if (props.disabled || !all.value.length) return
  open.value = true
  active.value = current.value?.id ?? choosable.value[0]?.id ?? ''
  void nextTick(() => {
    list.value?.focus()
    list.value?.querySelector<HTMLElement>('[aria-selected="true"]')?.scrollIntoView?.({ block: 'nearest' })
  })
}
function close(refocus = false) {
  open.value = false
  if (refocus) void nextTick(() => button.value?.focus())
}
function pick(option: LapOption) {
  if (!option.complete) return
  emit('update:modelValue', option.id)
  close(true)
}
function runAction(action: LapAction) {
  if (action.disabled) return
  close(true)
  emit('action', action.id)
}
function move(step: 1 | -1 | 'first' | 'last') {
  const options = choosable.value
  if (!options.length) return
  const i = options.findIndex(o => o.id === active.value)
  const next = step === 'first' ? 0 : step === 'last' ? options.length - 1 : (i + step + options.length) % options.length
  active.value = options[next]!.id
  void nextTick(() => list.value?.querySelector<HTMLElement>(`[data-id="${active.value}"]`)?.scrollIntoView?.({ block: 'nearest' }))
}
// Escape is consumed here: it closes this menu and must not also reach the page shortcuts (whole lap).
function onEscape(event: KeyboardEvent) {
  event.preventDefault()
  event.stopPropagation()
  close(true)
}
function onButtonKey(event: KeyboardEvent) {
  if (['ArrowDown', 'ArrowUp', 'Enter', ' '].includes(event.key)) { event.preventDefault(); show() }
}
function onListKey(event: KeyboardEvent) {
  if (event.key === 'ArrowDown' || event.key === 'ArrowUp') { event.preventDefault(); move(event.key === 'ArrowDown' ? 1 : -1) }
  else if (event.key === 'Home' || event.key === 'End') { event.preventDefault(); move(event.key === 'Home' ? 'first' : 'last') }
  else if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); const o = all.value.find(x => x.id === active.value); if (o) pick(o) }
  else if (event.key === 'Escape') onEscape(event)
}
// The menu closes when the focus leaves the whole picker (Tab past the last action, a click elsewhere).
function onFocusOut(event: FocusEvent) {
  if (open.value && !root.value?.contains(event.relatedTarget as Node | null)) close()
}
</script>

<template>
  <div ref="root" v-click-outside="() => close()" class="lap-picker" :style="{ '--c': color }" :title="hint" @focusout="onFocusOut">
    <span class="lap-picker__name">{{ name }}</span>
    <button ref="button" type="button" class="lap-picker__button" :disabled="disabled || !all.length" aria-haspopup="listbox" :aria-expanded="open" :aria-controls="`${uid}-list`"
      :aria-label="`${name}: ${current ? `${current.title} ${current.time}` : 'nessun giro'}`" @click="open ? close() : show()" @keydown="onButtonKey">
      <template v-if="current">
        <span class="lap-picker__title">{{ current.title }}</span>
        <span class="lap-picker__time" :class="{ 'is-invalid': !current.valid, 'is-best': current.best }">{{ current.time }}</span>
        <span v-if="current.conditions" class="lap-picker__cond">{{ current.conditions }}</span>
      </template>
      <span v-else class="lap-picker__title">--</span>
      <svg class="lap-picker__chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
    </button>
    <div v-if="open" class="lap-picker__pop">
    <div :id="`${uid}-list`" ref="list" class="lap-picker__list" role="listbox" tabindex="0" :aria-label="name" :aria-activedescendant="active ? `${uid}-${active}` : undefined" @keydown="onListKey">
      <template v-for="group in groups" :key="group.label">
        <p v-if="groups.length > 1 || group.label" class="lap-picker__group" role="presentation">{{ group.label }}</p>
        <div v-for="o in group.options" :id="`${uid}-${o.id}`" :key="o.id" :data-id="o.id" role="option" class="lap-row"
          :class="{ 'is-active': active === o.id, 'is-selected': modelValue === o.id, 'is-partial': !o.complete }" :aria-selected="modelValue === o.id" :aria-disabled="!o.complete || undefined"
          @mouseenter="o.complete && (active = o.id)" @click="pick(o)">
          <span class="lap-row__title">{{ o.title }}</span>
          <span class="lap-row__time" :class="{ 'is-invalid': !o.valid, 'is-best': o.best }" :title="o.best ? 'Il tuo giro migliore' : undefined">{{ o.time }}</span>
          <span class="lap-row__tags">
            <span v-if="!o.complete" class="lap-tag lap-tag--partial">Parziale</span>
            <span v-else-if="!o.valid" class="lap-tag lap-tag--invalid">Non valido</span>
          </span>
          <span class="lap-row__cond" :title="o.conditions">{{ o.conditions }}</span>
        </div>
      </template>
    </div>
    <div v-if="actions?.length" class="lap-picker__actions" @keydown.esc="onEscape">
      <button v-for="a in actions" :key="a.id" type="button" :disabled="a.disabled" :title="a.hint" @click="runAction(a)">{{ a.label }}</button>
    </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
// Stessa larghezza per Tu e Riferimento (si stringono insieme se la riga e' corta, cosi' lo switcher
// Avanzata / Semplice non va a capo); il menu combacia con il campo.
.lap-picker { --c: #38bdf8; position: relative; display: flex; align-items: stretch; flex: 0 1 360px; min-width: 260px; max-width: 100%; height: 38px; border: 1px solid var(--c); background: color-mix(in srgb, var(--c) 14%, #0a0a0f); }
@media (max-width: 700px) { .lap-picker { flex-basis: 100%; min-width: 0; } }
.lap-picker__name { display: grid; place-items: center; padding: 0 8px; background: var(--c); color: #0a0a0f; font: italic 700 13px 'Racer Display', sans-serif; text-transform: uppercase; }
// Il contenuto non tocca mai la freccia: la freccia ha il suo spazio a destra.
.lap-picker__button { display: flex; align-items: center; gap: 8px; flex: 1; min-width: 0; height: 100%; padding: 0 30px 0 10px; position: relative; border: 0; background: transparent; color: #fff; font: 600 13px 'Inter', sans-serif; text-align: left; cursor: pointer; white-space: nowrap; overflow: hidden;
  &:disabled { opacity: .5; cursor: default; }
  &:focus-visible { outline: 2px solid #fff; outline-offset: -3px; } }
.lap-picker__chevron { position: absolute; right: 12px; top: 50%; transform: translateY(-50%); color: #fff; transition: transform .15s ease; }
.lap-picker__button[aria-expanded='true'] .lap-picker__chevron { transform: translateY(-50%) rotate(180deg); }
.lap-picker__time { font: italic 700 13px 'Racer Display', sans-serif; letter-spacing: .02em; }
// Le condizioni (aria/asfalto, grip) si leggono sempre intere: niente puntini.
.lap-picker__cond { flex-shrink: 0; color: #b3b3b8; font-weight: 500; font-size: 12px; }
.lap-picker__pop { position: absolute; top: calc(100% + 4px); left: -1px; z-index: 30; width: calc(100% + 2px); box-sizing: border-box; border: 1px solid #ffffff40; background: #0b0b10f7; box-shadow: 0 14px 34px #000c; }
.lap-picker__list { max-height: 360px; overflow-y: auto; padding: 4px; outline: none;
  // The focus is on the list: the option you would choose wears the ring.
  &:focus-visible .lap-row.is-active { outline: 2px solid #fff; outline-offset: -2px; } }
.lap-picker__actions { display: grid; gap: 2px; padding: 4px; border-top: 1px solid #ffffff1f;
  button { height: 32px; padding: 0 10px; border: 0; background: transparent; color: #e6e6ea; font: 600 13px 'Inter', sans-serif; text-align: left; cursor: pointer;
    &:hover:not(:disabled) { background: #ffffff12; color: #fff; } &:disabled { opacity: .45; cursor: default; } &:focus-visible { outline: 2px solid #fff; outline-offset: -2px; } } }
.lap-picker__group { margin: 6px 8px 4px; color: #8a8a90; font: 600 10px 'Inter', sans-serif; letter-spacing: .06em; text-transform: uppercase; }
.lap-row { display: grid; grid-template-columns: 54px 72px 1fr auto; align-items: center; gap: 8px; min-height: 32px; padding: 0 10px; border-left: 2px solid transparent; color: #e6e6ea; font: 500 13px 'Inter', sans-serif; cursor: pointer; white-space: nowrap;
  &.is-active { background: #ffffff12; }
  &.is-selected { border-left-color: var(--c); background: color-mix(in srgb, var(--c) 14%, transparent); }
  &.is-partial { color: #6e6e74; cursor: default; }
  &__title { font-weight: 600; }
  &__time { font: italic 700 13px 'Racer Display', sans-serif; letter-spacing: .02em; }
  &__cond { color: #9a9aa0; font-size: 12px; text-align: right; } }
// Viola per il best (come i tempi del gioco), rosso per i giri non validi.
.is-best { color: #c084fc; }
.is-invalid { color: #ff5a6e; }
.lap-tag { display: inline-grid; place-items: center; height: 18px; padding: 0 6px; border: 1px solid currentColor; font: 700 10px 'Inter', sans-serif; letter-spacing: .04em; text-transform: uppercase; }
.lap-tag--invalid { color: #ff5a6e; background: #ff5a6e1a; }
.lap-tag--partial { color: #8a8a90; }
</style>
