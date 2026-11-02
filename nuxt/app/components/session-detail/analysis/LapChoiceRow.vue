<script setup lang="ts">
// PIP-695: one lap in the chooser. 01/11 (user): one line, larger text, more air; the conditions as the short tags
// of the pills (115 L · AIR 15° · TRK 18° · OPT), never "Benzina", "Gomme" again. A click uses the lap at once
// (no "Usa" button); the row of the other side swaps the two laps when that is possible. When it was driven and
// the conditions in words stay in the tooltip.
import { computed } from 'vue'
import { formatLapTime } from '~/utils/telemetryFormat'
import type { LapChoice } from '~/services/telemetry/lapChoice'
import { useLapChoiceText } from '~/composables/useLapChoiceText'
import { useI18n } from '~/i18n'

const props = defineProps<{ choice: LapChoice, selected: boolean, current?: boolean, otherSide?: string | null, idealScope?: 'session' | 'history', rank?: number | null, hideWhen?: boolean, hideDriver?: boolean,
  /** 01/11: the row of the other side swaps the two laps (no "Scambia" button any more). */
  swappable?: boolean,
  /** 02/11 (user, as Track Titan): name, tags and time only; the "why" only when it says something (x% faster). */
  brief?: boolean }>()
const emit = defineEmits<{ select: [choice: LapChoice], confirm: [choice: LapChoice] }>()
const { t } = useI18n()
const text = useLapChoiceText()
const status = computed(() => text.status(props.choice.status))
const tags = computed(() => text.conditionsShort(props.choice.conditions))
const lapLabel = computed(() => props.choice.ideal ? t('telemetry.choice.idealShort') : props.choice.lapNumber && !props.brief ? t('sessionDetail.chart.lap', { lap: props.choice.lapNumber }) : '')
const when = computed(() => props.choice.ideal || props.hideWhen || props.brief ? '' : text.when(props.choice))
const reasonText = computed(() => {
  const r = props.choice.reason
  if (!r) return ''
  if (!props.brief) return text.reason(r)
  return r.kind === 'stepUp' && r.pct > 0 ? t('telemetry.choice.reason.fasterShort', { pct: text.decimal(r.pct) }) : ''
})
const tooltip = computed(() => [props.choice.ideal ? text.idealNote(props.idealScope) : text.when(props.choice), text.conditions(props.choice.conditions)].filter(Boolean).join('\n'))
const blocked = computed(() => !!props.otherSide && !props.swappable)
function use() { emit('confirm', props.choice) }
function onKey(event: KeyboardEvent) {
  if (event.key !== 'Enter') return
  event.preventDefault()
  use()
}
</script>

<template>
  <button type="button" class="choice-row" :class="{ 'is-selected': selected, 'is-current': current, 'is-ideal': choice.ideal, 'is-off': choice.status === 'incomplete' || blocked }" :aria-pressed="selected"
    :aria-current="current ? 'true' : undefined" :aria-disabled="blocked || undefined" :data-key="choice.key" :title="tooltip" @click="use" @keydown="onKey">
    <span v-if="rank" class="choice-row__rank">{{ rank }}</span>
    <span class="choice-row__main">
      <span v-if="!hideDriver" class="choice-row__driver">{{ text.driver(choice) }}</span>
      <span v-if="lapLabel" class="choice-row__lap">{{ lapLabel }}</span>
      <span v-if="when" class="choice-row__when">{{ when }}</span>
    </span>
    <span v-if="tags.length" class="choice-row__tags"><span v-for="tag in tags" :key="tag">{{ tag }}</span></span>
    <span class="choice-row__badges">
      <!-- valid says nothing; invalid is the red time (the word for screen readers only). -->
      <span v-if="!choice.ideal && (choice.status === 'invalid' || choice.status === 'valid')" class="sr-only">{{ status.text }}</span>
      <span v-else-if="!choice.ideal && choice.status !== 'valid'" class="choice-row__status" :class="`is-${choice.status}`" :title="status.text"><span aria-hidden="true">{{ status.icon }}</span><span class="sr-only">{{ status.text }}</span></span>
      <span v-if="choice.best" class="choice-row__best" :title="t('telemetry.choice.status.best')"><span aria-hidden="true">★</span><span class="sr-only">{{ t('telemetry.choice.status.best') }}</span></span>
      <span v-if="reasonText" class="choice-row__reason">{{ reasonText }}</span>
      <span v-if="choice.note" class="choice-row__note">{{ choice.note }}</span>
      <span v-if="current" class="choice-row__pill">{{ t('telemetry.choice.dialog.current') }}</span>
      <span v-if="otherSide" class="choice-row__pill" :class="{ 'is-swap': swappable }">{{ swappable ? t('telemetry.choice.dialog.swapWith', { side: otherSide }) : t('telemetry.choice.dialog.onOtherSide', { side: otherSide }) }}</span>
    </span>
    <span class="choice-row__time" :class="{ 'is-best': choice.best, 'is-invalid': choice.status === 'invalid' }">{{ formatLapTime(choice.lapTimeMs) }}</span>
  </button>
</template>

<style scoped lang="scss">
.choice-row { display: flex; align-items: center; gap: 14px; width: 100%; min-height: 48px; padding: 10px 16px; border: 1px solid #ffffff14; border-left: 3px solid transparent; background: #ffffff05; color: #e6e6ea; text-align: left; cursor: pointer;
  &:hover { background: #ffffff10; border-color: #ffffff40; }
  &:focus-visible { outline: 2px solid #fff; outline-offset: -2px; }
  &.is-selected, &.is-current { border-left-color: var(--c, #fff); background: color-mix(in srgb, var(--c, #fff) 12%, transparent); }
  &.is-ideal { border-style: dashed; }
  &.is-off { color: #8a8a90; }
  &[aria-disabled='true'] { cursor: default; &:hover { background: #ffffff05; border-color: #ffffff14; } } }
.choice-row__rank { min-width: 24px; color: #b3b3b8; font: italic 700 16px 'Racer Display', sans-serif; text-align: right; }
.choice-row__main { display: flex; align-items: baseline; gap: 10px; min-width: 0; flex: 0 1 auto; font: 700 15px 'Inter', sans-serif; }
.choice-row__driver { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.choice-row__lap { color: #d4d4da; white-space: nowrap; }
.choice-row__when { color: #9a9aa0; font: 500 13px 'Inter', sans-serif; white-space: nowrap; }
.choice-row__tags { display: flex; gap: 4px; flex: none; span { padding: 1px 6px; border: 1px solid #ffffff24; color: #c8c8cc; font: 600 12px/18px 'Inter', sans-serif; font-variant-numeric: tabular-nums; } }
.choice-row__badges { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; min-width: 0; flex: 1; font: 600 13px 'Inter', sans-serif; color: #9a9aa0; }
.choice-row__status { font-size: 15px; &.is-incomplete, &.is-unknown { color: #b3b3b8; } }
.choice-row__best { color: #c084fc; font-size: 15px; }
.choice-row__reason { color: #d9c08a; }
.choice-row__note { color: #fbbf24; }
.choice-row__pill { padding: 1px 8px; border: 1px solid #ffffff40; color: #e6e6ea; font-size: 12px; white-space: nowrap;
  &.is-swap { border-color: var(--c, #fff); color: #fff; } }
.choice-row__time { margin-left: auto; flex: none; font: italic 700 18px 'Racer Display', sans-serif; letter-spacing: .02em; font-variant-numeric: tabular-nums; &.is-best { color: #c084fc; } &.is-invalid { color: #ff5a6e; } }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
@media (max-width: 640px) { .choice-row { flex-wrap: wrap; gap: 6px 10px; } .choice-row__tags { order: 5; } .choice-row__badges { flex-basis: 100%; order: 6; } }
</style>
