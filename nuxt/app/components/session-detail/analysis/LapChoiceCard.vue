<script setup lang="ts">
// PIP-695: "Tu" and "Riferimento", always in sight. The colour names the side (azzurro / ambra), always with its word.
// 01/11 (Track Titan's lap pills): a low pill that fits the page's title row. Line 1: side, driver, lap, status,
// the time large; line 2, small: fuel, air, track and grip. ⓘ opens a box over the page (it never
// makes the pill taller) with the reason of the reference, when the lap was driven and the conditions in words.
import { computed, onBeforeUnmount, ref, watch } from 'vue'
import type { LapChoice, LapSide, RefReason } from '~/services/telemetry/lapChoice'
import { useLapChoiceText } from '~/composables/useLapChoiceText'
import { formatLapTime } from '~/utils/telemetryFormat'
import { useI18n } from '~/i18n'

const props = defineProps<{
  side: LapSide
  choice: LapChoice | null
  reason?: RefReason | null
  idealScope?: 'session' | 'history'
  /** Coach view: the reasons speak of this driver, not of "you". */
  pilotName?: string | null
  disabled?: boolean
  /** 01/11: the reference can be taken away (✕): the page then shows only your lap. */
  removable?: boolean
}>()
const emit = defineEmits<{ change: [], remove: [] }>()
const { t } = useI18n()
const text = useLapChoiceText()
const color = computed(() => props.side === 'you' ? '#38bdf8' : '#fbbf24')
const status = computed(() => props.choice ? text.status(props.choice.status) : null)
const when = computed(() => props.choice ? text.when(props.choice) : '')
const tags = computed(() => text.conditionsShort(props.choice?.conditions))
const lapLabel = computed(() => props.choice?.ideal ? t('telemetry.choice.idealShort') : props.choice?.lapNumber ? t('telemetry.choice.lapShort', { n: props.choice.lapNumber }) : '')
const reasonText = computed(() => props.side === 'ref' && props.reason ? text.reason(props.reason, { pilotName: props.pilotName }) : '')
const infoLines = computed(() => [reasonText.value, props.choice?.ideal ? text.idealNote(props.idealScope) : when.value, text.conditions(props.choice?.conditions)].filter(Boolean))
const tooltip = computed(() => infoLines.value.join('\n'))
// ⓘ opens on a click, a tap or Enter, not only on hover; a second click, Esc or a click elsewhere closes it.
// Esc is taken first (capture) and marked handled: closing the box never also sends the charts back to the whole lap.
const infoOpen = ref(false)
const root = ref<HTMLElement | null>(null)
function onKey(event: KeyboardEvent) {
  if (event.key !== 'Escape') return
  event.preventDefault()
  event.stopPropagation()
  infoOpen.value = false
}
function onPointer(event: PointerEvent) { if (!root.value?.contains(event.target as Node)) infoOpen.value = false }
function listen(on: boolean) {
  if (on) {
    window.addEventListener('keydown', onKey, true)
    window.addEventListener('pointerdown', onPointer, true)
  } else {
    window.removeEventListener('keydown', onKey, true)
    window.removeEventListener('pointerdown', onPointer, true)
  }
}
watch(infoOpen, open => listen(open))
onBeforeUnmount(() => listen(false))
</script>

<template>
  <div ref="root" class="lap-pill" :class="[`lap-pill--${side}`, { 'is-ideal': choice?.ideal }]" :style="{ '--c': color }">
    <span class="lap-pill__side" :title="t(side === 'you' ? 'telemetry.youHint' : 'telemetry.referenceHint')">{{ text.side(side) }}</span>
    <div class="lap-pill__body" :title="tooltip">
      <template v-if="choice">
        <p class="lap-pill__main">
          <span class="lap-pill__driver">{{ text.driver(choice) }}</span>
          <span v-if="lapLabel" class="lap-pill__lap">{{ lapLabel }}</span>
          <!-- 01/11: valid says nothing (no tick); invalid is the red time; unknown or incomplete keep their sign. -->
          <span v-if="!choice.ideal && choice.status === 'valid'" class="sr-only">{{ status!.text }}</span>
          <span v-else-if="!choice.ideal" class="lap-pill__status" :class="`is-${choice.status}`" :title="status!.text"><span v-if="choice.status !== 'invalid'" aria-hidden="true">{{ status!.icon }}</span><span class="sr-only">{{ status!.text }}</span></span>
          <button v-if="infoLines.length" type="button" class="lap-pill__why" :aria-expanded="infoOpen" :aria-label="infoLines.join('. ')" :title="tooltip" @click="infoOpen = !infoOpen">ⓘ</button>
        </p>
        <p v-if="tags.length" class="lap-pill__tags">
          <span v-for="tag in tags" :key="tag">{{ tag }}</span>
        </p>
      </template>
      <p v-else class="lap-pill__main">{{ t('telemetry.choice.noLap') }}</p>
    </div>
    <strong v-if="choice" class="lap-pill__time" :class="{ 'is-best': choice.best, 'is-invalid': choice.status === 'invalid' }">{{ formatLapTime(choice.lapTimeMs) }}</strong>
    <div class="lap-pill__actions">
      <slot />
      <button type="button" class="lap-pill__change" :disabled="disabled" :aria-label="t(side === 'you' ? 'telemetry.choice.changeYouAria' : 'telemetry.choice.changeRefAria')" :title="t('telemetry.choice.change')" aria-haspopup="dialog" @click="emit('change')">▾</button>
      <button v-if="removable && choice" type="button" class="lap-pill__remove" :aria-label="t('telemetry.choice.removeRef')" :title="t('telemetry.choice.removeRef')" @click="emit('remove')">✕</button>
    </div>
    <div v-if="infoOpen && choice" class="lap-pill__info" role="note" :aria-label="t('telemetry.choice.infoAria')">
      <p v-for="line in infoLines" :key="line" class="lap-pill__reason">{{ line }}</p>
    </div>
  </div>
</template>

<style scoped lang="scss">
.lap-pill { --c: #38bdf8; position: relative; display: flex; align-items: center; gap: 8px; flex: none; padding-right: 3px; border: 1px solid var(--c); background: color-mix(in srgb, var(--c) 12%, #0a0a0f);
  &.is-ideal { border-style: dashed; } }
// The side label keeps its own width (TU stays square); 01/11: what follows it has the same width on both pills
// (body and time fixed), so the two laps line up.
.lap-pill__side { align-self: stretch; display: grid; place-items: center; flex: none; padding: 0 7px; background: var(--c); color: #0a0a0f; font: italic 700 12px 'Racer Display', sans-serif; text-transform: uppercase; }
.lap-pill__body { display: grid; gap: 1px; flex: none; width: clamp(170px, 15vw, 240px); min-width: 0; padding: 3px 0; p { margin: 0; } }
.lap-pill__main { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 7px; color: #fff; font: 700 13px 'Inter', sans-serif; }
.lap-pill__driver { min-width: 0; overflow-wrap: anywhere; }
.lap-pill__lap { color: #d4d4da; font: 600 12px 'Inter', sans-serif; }
.lap-pill__status { font: 700 13px 'Inter', sans-serif; &.is-valid { color: #3ddc5a; } &.is-invalid { color: #ff8a98; } &.is-incomplete, &.is-unknown { color: #b3b3b8; } }
.lap-pill__why { padding: 0 2px; border: 0; background: none; color: #fde68a; font: 700 13px 'Inter', sans-serif; cursor: help; &:focus-visible { outline: 2px solid #fff; } }
.lap-pill__tags { display: flex; flex-wrap: nowrap; overflow: hidden; align-items: center; gap: 3px; > span { flex: none; padding: 0 4px; border: 1px solid #ffffff24; color: #c8c8cc; font: 600 11px/15px 'Inter', sans-serif; font-variant-numeric: tabular-nums; } }
.lap-pill__time { margin-left: auto; color: #fff; font: italic 700 18px 'Racer Display', sans-serif; font-variant-numeric: tabular-nums; white-space: nowrap; min-width: 82px; text-align: right; &.is-best { color: #c084fc; } &.is-invalid { color: #ff5a6e; } }
.lap-pill__actions { display: flex; align-items: center; gap: 3px; }
.lap-pill__change, .lap-pill__remove, .lap-pill__actions :slotted(button) { min-width: 28px; min-height: 28px; padding: 0 7px; border: 1px solid #ffffff40; background: #ffffff0d; color: #fff; font: 700 12px 'Inter', sans-serif; cursor: pointer;
  &:hover:not(:disabled) { border-color: var(--c); background: color-mix(in srgb, var(--c) 18%, transparent); }
  &:focus-visible { outline: 2px solid #fff; outline-offset: 1px; }
  &:disabled { opacity: .5; cursor: default; } }
// Over the page, under the pill: opening it never moves the charts.
.lap-pill__info { position: absolute; top: calc(100% + 4px); left: -1px; right: -1px; z-index: 30; display: grid; gap: 4px; padding: 8px 10px; border: 1px solid var(--c); background: #121218; box-shadow: 0 10px 24px #000a; }
.lap-pill__reason { margin: 0; color: #e6e6ea; font: 500 12px/1.4 'Inter', sans-serif; &:first-child { color: #fde68a; } }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
@media (max-width: 700px) { .lap-pill { flex-basis: 100%; } .lap-pill__body { flex: 1 1 auto; width: auto; } }
</style>
