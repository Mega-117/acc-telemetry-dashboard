<script setup lang="ts">
// PIP-695: "Cambia il tuo giro" / "Cambia il riferimento". A wide modal by default (W3C APG dialog: focus in,
// Tab kept inside, focus back to "Cambia"). 01/11 (user, simpler): a click (or Enter) on a row uses it at once;
// no Annulla / Usa / Scambia / Togli buttons: ✕, Esc or a click outside close; the row of the other side swaps
// the two laps. 02/11 (user, as Track Titan): three tabs (Suggeriti, I miei giri, Altri piloti; the link is a button
// inside Altri piloti) and no "Nessun riferimento": a reference is always there. Dev builds can try a side panel.
import { computed, nextTick, onBeforeUnmount, ref, useId, watch } from 'vue'
import LapChoiceRow from './LapChoiceRow.vue'
import LapChoiceMyLaps from './LapChoiceMyLaps.vue'
import LapChoiceDrivers from './LapChoiceDrivers.vue'
import { choiceBlock, type LapChoice, type LapSide } from '~/services/telemetry/lapChoice'
import type { LapChoiceSource } from '~/composables/useLapChoice'
import { useLapChoiceText } from '~/composables/useLapChoiceText'
import { useI18n } from '~/i18n'

type Tab = 'suggested' | 'mine' | 'drivers'
const props = defineProps<{
  open: boolean
  side: LapSide
  source: LapChoiceSource
  /** Confirms a row: null when done, else the sentence to show (the dialog stays open). */
  apply: (side: LapSide, choice: LapChoice) => Promise<string | null>
  variant?: 'modal' | 'panel'
  idealScope?: 'session' | 'history'
  initialTab?: Tab | null
  /** 01/11: Tu and Riferimento can trade places (the button left the bar between the pills). */
  canSwap?: boolean
}>()
const emit = defineEmits<{ close: [], swap: [] }>()
const { t } = useI18n()
const text = useLapChoiceText()
const uid = useId()

const tabs = computed<Tab[]>(() => props.side === 'you' ? ['mine'] : ['suggested', 'mine', 'drivers'])
const tab = ref<Tab>('mine')
const selected = ref<LapChoice | null>(null)
const message = ref('')
const busy = ref(false)
const otherSideName = computed(() => text.side(props.side === 'you' ? 'ref' : 'you'))
const currentKey = computed(() => props.source.currentKey(props.side))
const otherKey = computed(() => props.source.currentKey(props.side === 'you' ? 'ref' : 'you'))
const suggested = computed(() => props.source.suggested())
const thisSession = computed(() => {
  const laps = [...props.source.sessionLaps()].sort((a, b) => (a.lapNumber ?? 0) - (b.lapNumber ?? 0))
  // ★ on the fastest valid lap of the session, as in the session table.
  const best = laps.filter(c => c.status === 'valid' && c.lapTimeMs > 0).sort((a, b) => a.lapTimeMs - b.lapTimeMs)[0]?.key
  return laps.map(c => ({ ...c, best: c.key === best }))
})
const tabLabel = (id: Tab) => id === 'mine' && props.source.subjectName() ? t('telemetry.choice.dialog.pilotLaps', { driver: props.source.subjectName()! })
  : t(`telemetry.choice.dialog.${id}`)

const block = computed(() => choiceBlock(selected.value, otherKey.value))
const blockText = computed(() => block.value === 'sameLap' ? t('telemetry.choice.dialog.sameLap', { side: otherSideName.value })
  : block.value === 'incomplete' ? t('telemetry.choice.dialog.incomplete') : '')
function select(choice: LapChoice | null) { selected.value = choice; message.value = '' }
async function confirm(choice: LapChoice | null = selected.value) {
  if (busy.value) return
  if (choice) selected.value = choice
  // The lap of the other side: the two trade places (01/11: the "Scambia" button left the header).
  if (choice && choice.key === otherKey.value && props.canSwap) { emit('swap'); close(); return }
  if (block.value) { message.value = block.value === 'none' ? t('telemetry.choice.dialog.pickFirst') : blockText.value; return }
  if (choice!.key === currentKey.value) { close(); return }
  busy.value = true
  message.value = ''
  const run = ++confirmRun
  const error = await props.apply(props.side, choice!)
  // Closed (or closed and reopened) meanwhile: this answer belongs to a window that is gone (Codex 01/11).
  if (run !== confirmRun) return
  busy.value = false
  if (error) message.value = error
  else close()
}

// ── Focus: in on open, kept inside (modal), back to the opener on close ──
const root = ref<HTMLElement | null>(null)
let opener: HTMLElement | null = null
const focusables = () => [...(root.value?.querySelectorAll<HTMLElement>('button:not([disabled]), input, [tabindex="0"]') ?? [])]
function close() { emit('close') }
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); return }
  if (event.key !== 'Tab' || props.variant === 'panel') return
  const list = focusables(), first = list[0], last = list[list.length - 1]
  if (!first || !last) return
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus() }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus() }
}
function onTabKey(event: KeyboardEvent) {
  if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return
  const focused = (event.target as HTMLElement | null)?.dataset?.tab as Tab | undefined
  const i = tabs.value.indexOf(focused ?? tab.value)
  const next = tabs.value[(i + (event.key === 'ArrowRight' ? 1 : tabs.value.length - 1)) % tabs.value.length]!
  tab.value = next
  void nextTick(() => root.value?.querySelector<HTMLElement>(`#${uid}-tab-${next}`)?.focus())
}
let confirmRun = 0
watch(() => props.open, open => {
  confirmRun++
  if (typeof document === 'undefined') return
  if (open) {
    opener = document.activeElement as HTMLElement | null
    tab.value = props.initialTab && tabs.value.includes(props.initialTab) ? props.initialTab : props.side === 'you' ? 'mine' : 'suggested'
    selected.value = null
    message.value = ''
    busy.value = false
    void nextTick(() => (root.value?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"], input, .choice-row, button') ?? root.value)?.focus())
  } else {
    opener?.focus?.()
    opener = null
  }
}, { immediate: true })
onBeforeUnmount(() => { opener?.focus?.() })
const rowProps = (c: LapChoice) => ({ choice: c, selected: c.key === selected.value?.key, current: c.key === currentKey.value, otherSide: c.key === otherKey.value ? otherSideName.value : null,
  swappable: !!props.canSwap && c.key === otherKey.value, idealScope: props.idealScope })
</script>

<template>
  <Teleport to="body">
    <div v-if="open" :class="variant === 'panel' ? 'choice-panel-wrap' : 'choice-backdrop'" @click.self="variant === 'panel' ? undefined : close()">
      <div ref="root" class="choice-dialog" :class="[`choice-dialog--${side}`, { 'choice-dialog--panel': variant === 'panel' }]" role="dialog" :aria-modal="variant === 'panel' ? 'false' : 'true'"
        :aria-labelledby="`${uid}-title`" tabindex="-1" @keydown="onKeydown">
        <header class="choice-dialog__head">
          <h2 :id="`${uid}-title`"><span class="choice-dialog__swatch" aria-hidden="true" />{{ t(side === 'you' ? 'telemetry.choice.dialog.titleYou' : 'telemetry.choice.dialog.titleRef') }}</h2>
          <button type="button" class="choice-dialog__x" :aria-label="t('telemetry.choice.dialog.close')" @click="close">✕</button>
        </header>
        <p v-if="variant === 'panel'" class="choice-empty">{{ t('telemetry.choice.dialog.panelNote') }}</p>
        <div class="choice-dialog__tabs">
          <div v-if="tabs.length > 1" role="tablist" :aria-label="t('telemetry.choice.dialog.tabsAria')" @keydown="onTabKey">
            <button v-for="id in tabs" :id="`${uid}-tab-${id}`" :key="id" type="button" role="tab" :data-tab="id" :aria-selected="tab === id" :aria-controls="`${uid}-panel`" :tabindex="tab === id ? 0 : -1" @click="tab = id">{{ tabLabel(id) }}</button>
          </div>
          <h3 v-else class="choice-dialog__single">{{ t('telemetry.choice.dialog.thisSession') }}</h3>
        </div>
        <p v-if="busy || message" class="choice-dialog__msg" role="status">{{ busy ? t('telemetry.choice.dialog.loadingLap') : message }}</p>
        <div :id="`${uid}-panel`" class="choice-dialog__body" :role="tabs.length > 1 ? 'tabpanel' : undefined" :aria-labelledby="tabs.length > 1 ? `${uid}-tab-${tab}` : undefined">
          <template v-if="tab === 'suggested'">
            <div class="choice-list">
              <p v-if="!suggested.length" class="choice-empty">{{ t('telemetry.choice.suggested.empty') }}</p>
              <template v-for="c in suggested" :key="c.key">
                <LapChoiceRow v-bind="rowProps(c)" brief @confirm="confirm" />
                <p v-if="c.reason?.kind === 'fastest'" class="choice-empty">{{ t('telemetry.choice.suggested.fastestNote') }}</p>
              </template>
            </div>
            <p v-if="source.idealSame?.()" class="choice-empty">{{ t('telemetry.choice.suggested.idealSame') }}</p>
          </template>
          <!-- 02/11 (user, as Track Titan): "Tu" picks only among the laps of this session. -->
          <div v-else-if="side === 'you'" class="choice-list">
            <p v-if="!thisSession.length" class="choice-empty">{{ t('telemetry.choice.dialog.noSessionLaps') }}</p>
            <LapChoiceRow v-for="c in thisSession" :key="c.key" v-bind="rowProps(c)" hide-driver hide-when @confirm="confirm" />
          </div>
          <LapChoiceMyLaps v-else-if="tab === 'mine'" :source="source" :selected-key="selected?.key ?? null" :current-key="currentKey" :other-key="otherKey" :other-side="otherSideName" :can-swap="!!canSwap" @select="select" @confirm="confirm" />
          <LapChoiceDrivers v-else :source="source" :selected-key="selected?.key ?? null" :current-key="currentKey" :other-key="otherKey" :other-side="otherSideName" :can-swap="!!canSwap"
            @select="select" @confirm="confirm" />
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped lang="scss">
.choice-backdrop { position: fixed; inset: 0; z-index: 1000; display: grid; place-items: center; padding: 24px; background: #000000a6; backdrop-filter: blur(8px); }
.choice-panel-wrap { position: fixed; top: 0; right: 0; bottom: 0; z-index: 1000; width: min(520px, 100vw); pointer-events: none; > * { pointer-events: auto; } }
:global(body:has(.electron-titlebar)) .choice-backdrop, :global(body:has(.electron-titlebar)) .choice-panel-wrap { top: 36px; }
.choice-dialog { --c: #38bdf8; display: flex; flex-direction: column; gap: 18px; width: min(960px, 100%); max-height: calc(100dvh - 84px); padding: 28px 32px; overflow: hidden;
  border: 1px solid var(--rc-section-line, #ffffff2e); border-top: 3px solid var(--c); background: #0a0a0df2; color: #fff; outline: none;
  &--ref { --c: #fbbf24; }
  &--panel { height: 100%; max-height: none; width: 100%; box-shadow: -16px 0 30px #000a; } }
.choice-dialog__swap { margin-left: auto; padding: 4px 10px; border: 1px solid #ffffff40; background: #ffffff0d; color: #fff; font: 700 12px 'Inter', sans-serif; cursor: pointer;
  &:hover { border-color: #fff; } &:focus-visible { outline: 2px solid #fff; outline-offset: 1px; } }
.choice-dialog__head { display: flex; justify-content: space-between; align-items: center; gap: 12px;
  h2 { display: flex; align-items: center; gap: 10px; margin: 0; font: italic 700 24px/1.2 'Racer Display', sans-serif; text-transform: uppercase; } }
.choice-dialog__swatch { width: 14px; height: 14px; background: var(--c); }
.choice-dialog__x { width: 38px; height: 38px; border: 1px solid #ffffff40; background: transparent; color: #fff; cursor: pointer; &:focus-visible { outline: 2px solid #fff; outline-offset: 1px; } }
.choice-dialog__tabs { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; border-bottom: 1px solid #ffffff1f; padding-bottom: 8px;
  [role='tablist'] { display: flex; gap: 4px; }
  [role='tab'] { height: 40px; padding: 0 18px; border: 1px solid #ffffff26; background: transparent; color: #cfcfd4; font: 700 14px 'Inter', sans-serif; cursor: pointer;
    &[aria-selected='true'] { border-color: var(--c); background: color-mix(in srgb, var(--c) 16%, transparent); color: #fff; box-shadow: inset 0 -3px var(--c); }
    &:focus-visible { outline: 2px solid #fff; outline-offset: 1px; } } }
.choice-dialog__single { margin: 0; font: italic 700 15px 'Racer Display', sans-serif; text-transform: uppercase; }
.choice-dialog__link { margin-left: auto; height: 36px; padding: 0 14px; border: 1px dashed #ffffff66; background: #ffffff0a; color: #fff; font: 700 13px 'Inter', sans-serif; cursor: pointer;
  &[aria-pressed='true'] { border-style: solid; border-color: var(--c); } &:focus-visible { outline: 2px solid #fff; outline-offset: 1px; } }
.choice-dialog__body { min-height: 220px; overflow-y: auto; padding-right: 4px; }
.choice-dialog__foot { display: flex; align-items: center; gap: 10px; padding-top: 10px; border-top: 1px solid #ffffff1f; }
.choice-dialog__msg { margin: 0; padding: 8px 12px; border-left: 2px solid var(--c); background: #ffffff08; color: #e6e6ea; font: 500 14px 'Inter', sans-serif; }
.choice-dialog :deep(.choice-list) { display: grid; gap: 6px; }
.choice-dialog :deep(.choice-order) { margin: 0; color: #9a9aa0; font: 600 12px 'Inter', sans-serif; letter-spacing: .04em; text-transform: uppercase; }
.choice-dialog :deep(.choice-empty) { margin: 6px 0; color: #b3b3b8; font: 500 14px 'Inter', sans-serif; }
.choice-dialog :deep(.choice-error) { margin: 0; padding: 8px 12px; border-left: 2px solid #ff0024; background: #ff00240a; color: #ff9aaa; font-size: 13px; }
.choice-dialog :deep(.choice-link) { padding: 0; border: 0; background: none; color: #e6e6ea; font: 600 13px 'Inter', sans-serif; text-decoration: underline; text-underline-offset: 3px; cursor: pointer;
  &:focus-visible { outline: 2px solid #fff; outline-offset: 2px; } }
.choice-dialog :deep(.choice-btn) { min-height: 40px; padding: 0 16px; border: 1px solid var(--c); background: color-mix(in srgb, var(--c) 22%, transparent); color: #fff; font: 700 13px 'Inter', sans-serif; cursor: pointer;
  &:disabled { opacity: .45; cursor: default; } &:focus-visible { outline: 2px solid #fff; outline-offset: 1px; } }
// Sass cannot add a suffix to :deep(): the ghost variant has its own selector.
.choice-dialog :deep(.choice-btn--ghost) { border-color: #ffffff40; background: transparent; }
@media (max-width: 640px) { .choice-backdrop { padding: 10px; } .choice-dialog { padding: 16px; } .choice-dialog__foot { flex-wrap: wrap; } .choice-dialog__msg { flex-basis: 100%; } }
</style>
