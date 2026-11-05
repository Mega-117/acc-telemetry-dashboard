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
  /** 02/11 (user, as Track Titan): name, tags and time only; the "why" only when it says something (x% faster). */
  brief?: boolean,
  /** 02/11: best qualifying / race lap of a past session (yellow / red, as the times elsewhere). */
  kind?: 'qualify' | 'race' | null,
  /** 02/11: fixed columns (name/lap, kind, the four tags), so the rows of a list line up. */
  aligned?: boolean }>()
const emit = defineEmits<{ select: [choice: LapChoice], confirm: [choice: LapChoice] }>()
const { t } = useI18n()
const text = useLapChoiceText()
const status = computed(() => text.status(props.choice.status))
const tags = computed(() => props.aligned ? text.conditionSlots(props.choice.conditions) : text.conditionsShort(props.choice.conditions))
// 02/11 (user): "Stint qualifica" / "Stint gara" (yellow / red).
const kindText = computed(() => props.kind ? t(`telemetry.choice.kind.${props.kind}`) : '')
const lapLabel = computed(() => props.choice.ideal ? t('telemetry.choice.idealShort') : props.choice.lapNumber && !props.brief ? t('sessionDetail.chart.lap', { lap: props.choice.lapNumber }) : '')
const when = computed(() => props.choice.ideal || props.hideWhen || props.brief ? '' : text.when(props.choice))
const reasonText = computed(() => {
  const r = props.choice.reason
  if (!r) return ''
  if (!props.brief) return text.reason(r)
  // dev.10: a coach lap says its session and that its fuel is unknown, even in the short list.
  if (r.kind === 'coach') return [r.session ? t(`telemetry.choice.reason.coachSession.${r.session}`) : '', r.fuelKnown ? '' : t('telemetry.choice.reason.coachFuel'),
    r.otherCar ? t('telemetry.choice.reason.coachClass') : ''].filter(Boolean).join(' · ')
  return r.kind === 'stepUp' && r.pct > 0 ? t('telemetry.choice.reason.fasterShort', { pct: text.decimal(r.pct) }) : ''
})
const coach = computed(() => props.choice.reason?.kind === 'coach')
const tooltip = computed(() => [props.choice.ideal ? text.idealNote(props.idealScope) : text.when(props.choice), text.conditions(props.choice.conditions)].filter(Boolean).join('\n'))
function use() { emit('confirm', props.choice) }
function onKey(event: KeyboardEvent) {
  if (event.key !== 'Enter') return
  event.preventDefault()
  use()
}
</script>

<template>
  <!-- 02/11 (user): the lap already used on the other side is not listed (no "Scambia con …", no lap against itself). -->
  <button v-if="!otherSide" type="button" class="choice-row" :class="{ 'is-aligned': aligned, 'is-selected': selected, 'is-current': current, 'is-ideal': choice.ideal, 'is-off': choice.status === 'incomplete' }" :aria-pressed="selected"
    :aria-current="current ? 'true' : undefined" :data-key="choice.key" :title="tooltip" @click="use" @keydown="onKey">
    <span v-if="rank" class="choice-row__rank">{{ rank }}</span>
    <span class="choice-row__main">
      <span v-if="!hideDriver" class="choice-row__driver">{{ text.driver(choice) }}</span>
      <span v-if="coach" class="choice-row__coach">{{ t('telemetry.choice.coachTag') }}</span>
      <span v-if="lapLabel" class="choice-row__lap">{{ lapLabel }}</span>
      <span v-if="when" class="choice-row__when">{{ when }}</span>
    </span>
    <span v-if="aligned || kind" class="choice-row__kind" :class="kind ? `is-${kind}` : 'is-none'">{{ kindText }}</span>
    <span v-if="tags.length" class="choice-row__tags"><span v-for="(tag, i) in tags" :key="i" :class="{ 'is-empty': !tag }">{{ tag }}</span></span>
    <span class="choice-row__badges">
      <!-- valid says nothing; invalid is the red time (the word for screen readers only). -->
      <span v-if="!choice.ideal && (choice.status === 'invalid' || choice.status === 'valid')" class="sr-only">{{ status.text }}</span>
      <span v-else-if="!choice.ideal && choice.status !== 'valid'" class="choice-row__status" :class="`is-${choice.status}`" :title="status.text"><span aria-hidden="true">{{ status.icon }}</span><span class="sr-only">{{ status.text }}</span></span>
      <span v-if="choice.best" class="choice-row__best" :title="t('telemetry.choice.status.best')"><span aria-hidden="true">★</span><span class="sr-only">{{ t('telemetry.choice.status.best') }}</span></span>
      <span v-if="reasonText" class="choice-row__reason">{{ reasonText }}</span>
      <span v-if="choice.note" class="choice-row__note">{{ choice.note }}</span>
      <span v-if="current" class="choice-row__pill">{{ t('telemetry.choice.dialog.current') }}</span>
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
.choice-row__kind { flex: none; padding: 1px 8px; border: 1px solid color-mix(in srgb, var(--k) 45%, transparent); background: color-mix(in srgb, var(--k) 10%, transparent); color: var(--k);
  font: 700 11px/18px 'Inter', sans-serif; letter-spacing: .04em; text-align: center; text-transform: uppercase; white-space: nowrap;
  &.is-qualify { --k: var(--racing-qualify, #ffc400); } &.is-race { --k: color-mix(in srgb, var(--racing-race, #ff0024) 80%, white); } &.is-none { visibility: hidden; } }
// 02/11: fixed columns in the lists (name or lap + date | best kind | fuel | air | track | grip | … | time).
.choice-row.is-aligned {
  .choice-row__main { flex: 0 0 190px; }
  .choice-row__kind { flex: 0 0 128px; box-sizing: border-box; }
  .choice-row__tags span { box-sizing: border-box; text-align: center; &:nth-child(1) { width: 50px; } &:nth-child(2) { width: 66px; } &:nth-child(3) { width: 66px; } &:nth-child(4) { width: 46px; }
    &.is-empty { visibility: hidden; } } }
// dev.10: the coach's laps carry a teal COACH pill (the Pitwall coach colour), never mistaken for a driver.
.choice-row__coach { flex: none; padding: 1px 6px; border: 1px solid #2dd4bf; color: #2dd4bf; font: 800 11px/16px 'Inter', sans-serif; letter-spacing: .06em; }
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
