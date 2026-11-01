<script setup lang="ts">
// PIP-695: one lap in the chooser, three lines: driver and time; lap and session; status or note.
// A click selects it, a double click or Enter uses it at once.
import { computed } from 'vue'
import { formatLapTime } from '~/utils/telemetryFormat'
import type { LapChoice } from '~/services/telemetry/lapChoice'
import { useLapChoiceText } from '~/composables/useLapChoiceText'
import { useI18n } from '~/i18n'

const props = defineProps<{ choice: LapChoice, selected: boolean, current?: boolean, otherSide?: string | null, idealScope?: 'session' | 'history', rank?: number | null, hideWhen?: boolean, hideDriver?: boolean }>()
const emit = defineEmits<{ select: [choice: LapChoice], confirm: [choice: LapChoice] }>()
const { t } = useI18n()
const text = useLapChoiceText()
const status = computed(() => text.status(props.choice.status))
const conditions = computed(() => text.conditions(props.choice.conditions))
const second = computed(() => {
  if (props.choice.ideal) return text.idealNote(props.idealScope)
  const lap = props.choice.lapNumber ? t('sessionDetail.chart.lap', { lap: props.choice.lapNumber }) : ''
  return [lap, props.hideWhen ? '' : text.when(props.choice)].filter(Boolean).join(' · ')
})
function onKey(event: KeyboardEvent) {
  if (event.key !== 'Enter') return
  event.preventDefault()
  emit('confirm', props.choice)
}
</script>

<template>
  <button type="button" class="choice-row" :class="{ 'is-selected': selected, 'is-ideal': choice.ideal, 'is-off': choice.status === 'incomplete' }" :aria-pressed="selected"
    :aria-current="current ? 'true' : undefined" :data-key="choice.key" @click="emit('select', choice)" @dblclick="emit('confirm', choice)" @keydown="onKey">
    <span v-if="rank" class="choice-row__rank">{{ rank }}</span>
    <span class="choice-row__text">
      <span class="choice-row__l1">
        <span v-if="!hideDriver" class="choice-row__driver">{{ text.driver(choice) }}</span>
        <span v-if="choice.mine && !hideDriver" class="choice-row__tag">{{ t('telemetry.choice.tagYou') }}</span>
        <span class="choice-row__time" :class="{ 'is-best': choice.best, 'is-invalid': choice.status === 'invalid' }">{{ formatLapTime(choice.lapTimeMs) }}</span>
      </span>
      <span v-if="second" class="choice-row__l2">{{ second }}</span>
      <span v-if="conditions" class="choice-row__cond">{{ conditions }}</span>
      <span class="choice-row__l3">
        <!-- 01/11: valid says nothing; invalid is the red time (the word for screen readers only). -->
        <span v-if="!choice.ideal && choice.status === 'invalid'" class="sr-only">{{ status.text }}</span>
        <span v-else-if="!choice.ideal && choice.status !== 'valid'" class="choice-row__status" :class="`is-${choice.status}`"><span aria-hidden="true">{{ status.icon }}</span> {{ status.text }}</span>
        <span v-if="choice.best" class="choice-row__best"><span aria-hidden="true">★</span> {{ t('telemetry.choice.status.best') }}</span>
        <span v-if="choice.reason" class="choice-row__reason">{{ text.reason(choice.reason) }}</span>
        <span v-if="choice.note" class="choice-row__note">{{ choice.note }}</span>
        <span v-if="current" class="choice-row__current">{{ t('telemetry.choice.dialog.current') }}</span>
        <span v-if="otherSide" class="choice-row__other">{{ t('telemetry.choice.dialog.onOtherSide', { side: otherSide }) }}</span>
      </span>
    </span>
  </button>
</template>

<style scoped lang="scss">
.choice-row { display: flex; align-items: center; gap: 10px; width: 100%; padding: 8px 12px; border: 1px solid #ffffff14; border-left: 3px solid transparent; background: #ffffff05; color: #e6e6ea; text-align: left; cursor: pointer;
  &:hover { background: #ffffff10; border-color: #ffffff40; }
  &:focus-visible { outline: 2px solid #fff; outline-offset: -2px; }
  &.is-selected { border-color: #fff; border-left-color: var(--c, #fff); background: color-mix(in srgb, var(--c, #fff) 16%, transparent); }
  &.is-ideal { border-style: dashed; }
  &.is-off { color: #8a8a90; } }
.choice-row__rank { min-width: 28px; color: #b3b3b8; font: italic 700 15px 'Racer Display', sans-serif; text-align: right; }
.choice-row__text { display: grid; gap: 2px; min-width: 0; flex: 1; }
.choice-row__cond { color: #b3b3b8; font: 500 12px 'Inter', sans-serif; font-variant-numeric: tabular-nums; }
.choice-row__l1 { display: flex; align-items: baseline; gap: 8px; font: 700 13px 'Inter', sans-serif; }
.choice-row__driver { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.choice-row__tag { padding: 0 5px; border: 1px solid currentColor; color: #38bdf8; font: 700 10px/15px 'Inter', sans-serif; letter-spacing: .05em; }
.choice-row__time { margin-left: auto; font: italic 700 14px 'Racer Display', sans-serif; letter-spacing: .02em; &.is-best { color: #c084fc; } &.is-invalid { color: #ff5a6e; } }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
.choice-row__l2 { color: #b3b3b8; font: 500 12px 'Inter', sans-serif; }
.choice-row__l3 { display: flex; flex-wrap: wrap; gap: 4px 10px; font: 500 11px 'Inter', sans-serif; color: #9a9aa0; }
.choice-row__status { &.is-valid { color: #3ddc5a; } &.is-invalid { color: #ff8a98; } }
.choice-row__best { color: #c084fc; }
.choice-row__reason { color: #d9c08a; }
.choice-row__note { color: #fbbf24; }
.choice-row__current, .choice-row__other { padding: 0 5px; border: 1px solid #ffffff40; color: #e6e6ea; }
</style>
