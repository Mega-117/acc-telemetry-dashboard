<script setup lang="ts">
// PIP-695: "Tu" and "Riferimento", always in sight. The colour names the side (azzurro / ambra), always with its word.
// 01/11 (Track Titan's lap pills): a low pill. Line 1: side, driver, lap, status, the time large; line 2, small:
// fuel, tyres, air and track as short tags. When it was driven sits in the tooltip, the reason behind ⓘ.
import { computed, ref } from 'vue'
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
// ⓘ also opens on a click or Enter (touch and keyboard), not only on hover.
const reasonOpen = ref(false)
</script>

<template>
  <div class="lap-pill" :class="[`lap-pill--${side}`, { 'is-ideal': choice?.ideal }]" :style="{ '--c': color }">
    <span class="lap-pill__side" :title="t(side === 'you' ? 'telemetry.youHint' : 'telemetry.referenceHint')">{{ text.side(side) }}</span>
    <div class="lap-pill__body" :title="tooltip">
      <template v-if="choice">
        <p class="lap-pill__main">
          <span class="lap-pill__driver">{{ text.driver(choice) }}</span>
          <span v-if="choice.mine" class="lap-pill__you">{{ t('telemetry.choice.tagYou') }}</span>
          <span v-if="lapLabel" class="lap-pill__lap">{{ lapLabel }}</span>
          <span v-if="!choice.ideal" class="lap-pill__status" :class="`is-${choice.status}`" :title="status!.text"><span aria-hidden="true">{{ status!.icon }}</span><span class="sr-only">{{ status!.text }}</span></span>
          <button v-if="infoLines.length" type="button" class="lap-pill__why" :aria-expanded="reasonOpen" :aria-label="infoLines.join('. ')" :title="tooltip" @click="reasonOpen = !reasonOpen">ⓘ</button>
        </p>
        <p v-if="tags.length" class="lap-pill__tags">
          <span v-for="tag in tags" :key="tag">{{ tag }}</span>
        </p>
        <p v-for="line in reasonOpen ? infoLines : []" :key="line" class="lap-pill__reason">{{ line }}</p>
      </template>
      <p v-else class="lap-pill__main">{{ t('telemetry.choice.noLap') }}</p>
    </div>
    <strong v-if="choice" class="lap-pill__time" :class="{ 'is-best': choice.best }">{{ formatLapTime(choice.lapTimeMs) }}</strong>
    <div class="lap-pill__actions">
      <slot />
      <button type="button" class="lap-pill__change" :disabled="disabled" :aria-label="t(side === 'you' ? 'telemetry.choice.changeYouAria' : 'telemetry.choice.changeRefAria')" :title="t('telemetry.choice.change')" aria-haspopup="dialog" @click="emit('change')">▾</button>
      <button v-if="removable && choice" type="button" class="lap-pill__remove" :aria-label="t('telemetry.choice.removeRef')" :title="t('telemetry.choice.removeRef')" @click="emit('remove')">✕</button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.lap-pill { --c: #38bdf8; display: flex; align-items: center; gap: 8px; flex: 1 1 320px; min-width: 240px; max-width: 520px; padding-right: 4px; border: 1px solid var(--c); background: color-mix(in srgb, var(--c) 12%, #0a0a0f);
  &.is-ideal { border-style: dashed; } }
.lap-pill__side { align-self: stretch; display: grid; place-items: center; padding: 0 7px; background: var(--c); color: #0a0a0f; font: italic 700 12px 'Racer Display', sans-serif; text-transform: uppercase; }
.lap-pill__body { display: grid; gap: 1px; flex: 1; min-width: 0; padding: 4px 0; p { margin: 0; } }
.lap-pill__main { display: flex; flex-wrap: wrap; align-items: baseline; gap: 2px 8px; color: #fff; font: 700 13px 'Inter', sans-serif; }
.lap-pill__driver { min-width: 0; overflow-wrap: anywhere; }
.lap-pill__you { padding: 0 4px; border: 1px solid var(--c); color: var(--c); font: 700 10px/15px 'Inter', sans-serif; letter-spacing: .05em; align-self: center; }
.lap-pill__lap { color: #d4d4da; font: 600 12px 'Inter', sans-serif; }
.lap-pill__status { font: 700 13px 'Inter', sans-serif; &.is-valid { color: #3ddc5a; } &.is-invalid { color: #ff8a98; } &.is-incomplete, &.is-unknown { color: #b3b3b8; } }
.lap-pill__why { padding: 0 2px; border: 0; background: none; color: #fde68a; font: 700 13px 'Inter', sans-serif; cursor: help; &:focus-visible { outline: 2px solid #fff; } }
.lap-pill__tags { display: flex; flex-wrap: wrap; gap: 4px; span { padding: 0 5px; border: 1px solid #ffffff24; color: #c8c8cc; font: 600 11px/16px 'Inter', sans-serif; font-variant-numeric: tabular-nums; } }
.lap-pill__reason { color: #fde68a; font: 500 12px 'Inter', sans-serif; }
.lap-pill__time { margin-left: auto; color: #fff; font: italic 700 18px 'Racer Display', sans-serif; font-variant-numeric: tabular-nums; white-space: nowrap; &.is-best { color: #c084fc; } }
.lap-pill__actions { display: flex; align-items: center; gap: 3px; }
.lap-pill__change, .lap-pill__remove, .lap-pill__actions :slotted(button) { min-width: 30px; min-height: 30px; padding: 0 8px; border: 1px solid #ffffff40; background: #ffffff0d; color: #fff; font: 700 12px 'Inter', sans-serif; cursor: pointer;
  &:hover:not(:disabled) { border-color: var(--c); background: color-mix(in srgb, var(--c) 18%, transparent); }
  &:focus-visible { outline: 2px solid #fff; outline-offset: 1px; }
  &:disabled { opacity: .5; cursor: default; } }
.sr-only { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap; }
@media (max-width: 700px) { .lap-pill { flex-basis: 100%; max-width: none; min-width: 0; } }
</style>
