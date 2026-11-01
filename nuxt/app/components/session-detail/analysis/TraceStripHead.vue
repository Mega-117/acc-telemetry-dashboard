<script setup lang="ts">
// The bar above the Tracce charts: what you are looking at (‹ › for corners, ✕ back to the whole lap),
// the corner to look at (01/11, Track Titan's focus zone), where the delta sits, and the extra channels.
import { formatDelta } from '~/services/telemetry/lapAnalysis'
import { useI18n } from '~/i18n'

export type DeltaPlace = 'top' | 'centre'
const DELTA_PLACES: DeltaPlace[] = ['top', 'centre']

defineProps<{
  viewLabel: string
  wholeView: boolean
  /** A corner is open (not a sector or a zoom): ‹ › step through the corners. */
  stepping: boolean
  focus: { number: number, lostS: number } | null
  showDeltaSwitch: boolean
}>()
const deltaPlace = defineModel<DeltaPlace>('deltaPlace', { required: true })
const allChannels = defineModel<boolean>('allChannels', { required: true })
const emit = defineEmits<{ step: [direction: -1 | 1], whole: [], openFocus: [number: number] }>()
const { t } = useI18n()
</script>

<template>
  <!-- PIP-635 (Garage 61, Delta, MoTeC): one context control on the left (what you are looking at, ‹ › for
       corners, ✕ back to the whole lap, also Esc / double click), the channels on the right. -->
  <div class="strip-head">
    <span class="strip-context" :class="{ 'is-zoomed': !wholeView }">
      <button v-if="stepping" type="button" class="strip-context__step" :aria-label="t('telemetry.prevCorner')" :title="`${t('telemetry.prevCorner')} (←)`" @click="emit('step', -1)">‹</button>
      <strong aria-live="polite">{{ viewLabel }}</strong>
      <button v-if="stepping" type="button" class="strip-context__step" :aria-label="t('telemetry.nextCorner')" :title="`${t('telemetry.nextCorner')} (→)`" @click="emit('step', 1)">›</button>
      <button v-if="!wholeView" type="button" class="strip-context__close" :aria-label="t('telemetry.backWhole')" :title="t('telemetry.backWholeTitle')" @click="emit('whole')">✕</button>
    </span>
    <button v-if="focus" type="button" class="strip-focus" :title="t('telemetry.focusTitle')" @click="emit('openFocus', focus.number)">{{ t('telemetry.focus', { n: focus.number, gap: formatDelta(focus.lostS) }) }}</button>
    <span v-if="showDeltaSwitch" class="delta-switch" role="group" :aria-label="t('telemetry.deltaPlace.label')">
      <span class="delta-switch__name" aria-hidden="true">{{ t('telemetry.deltaPlace.name') }}</span>
      <button v-for="p in DELTA_PLACES" :key="p" type="button" :aria-pressed="deltaPlace === p" :class="{ active: deltaPlace === p }" @click="deltaPlace = p">{{ t(`telemetry.deltaPlace.${p}`) }}</button>
    </span>
    <button type="button" class="strip-channels" :class="{ active: allChannels, alone: !showDeltaSwitch }" @click="allChannels = !allChannels">{{ allChannels ? t('telemetry.essential') : t('telemetry.moreChannels') }}</button>
  </div>
</template>

<style scoped lang="scss">
// Aligned to the plot area of the charts (42 px axis): the head starts over the axis.
// 01/11 (Codex): on a narrow column the controls wrap instead of leaving it.
.strip-head { display: flex; flex-wrap: wrap; align-items: center; gap: 6px 10px; min-height: 26px; white-space: nowrap; margin-left: -34px; color: #b3b3b8; font: 700 12px "Inter", sans-serif; text-transform: uppercase; letter-spacing: .04em; }
.strip-channels { height: 26px; padding: 0 10px; border: 1px solid #ffffff2e; background: #ffffff0a; color: #e6e6ea; font: 700 12px "Inter", sans-serif; text-transform: none; letter-spacing: 0; cursor: pointer;
  &.active { border-color: #ff0024; } &.alone { margin-left: auto; } }
// PIP-635: what you are looking at, in one framed control: "‹ Curva 5 › ✕" or "Giro intero".
.strip-context { display: inline-flex; align-items: stretch; height: 26px; border: 1px solid #ffffff2e; background: #ffffff08;
  strong { display: grid; place-items: center; min-width: 96px; padding: 0 10px; color: #c8c8cc; font: italic 700 13px "Racer Display", sans-serif; letter-spacing: .03em; }
  &.is-zoomed { border-color: #ffffff59; strong { color: #fff; } }
  button { width: 24px; padding: 0; border: 0; border-left: 1px solid #ffffff1f; background: transparent; color: #e6e6ea; font: 700 13px/1 "Inter", sans-serif; cursor: pointer;
    &:hover { background: #ffffff1a; color: #fff; } &:focus-visible { outline: 2px solid #fff; outline-offset: -2px; } }
  &__step:first-child { border-left: 0; border-right: 1px solid #ffffff1f; }
  &__close:hover { background: #ff002433; } }
.strip-focus { padding: 4px 10px; border: 1px solid #fbbf2466; background: #fbbf2414; color: #fde68a; font: 700 12px 'Inter', sans-serif; text-transform: none; letter-spacing: 0; cursor: pointer; white-space: nowrap;
  &:hover { background: #fbbf2426; } &:focus-visible { outline: 2px solid #fff; outline-offset: 2px; } }
.delta-switch { margin-left: auto; display: inline-flex; align-items: center; border: 1px solid #ffffff24;
  &__name { padding: 0 8px; color: #a1a1a8; font: 700 11px 'Inter', sans-serif; text-transform: uppercase; letter-spacing: .04em; border-right: 1px solid #ffffff24; }
  button { padding: 4px 10px; border: 0; background: transparent; color: #a1a1a8; font: 600 12px 'Inter', sans-serif; text-transform: none; letter-spacing: 0; cursor: pointer;
    &.active { background: #ffffff1f; color: #fff; } &:hover:not(.active) { color: #e6e6ea; } &:focus-visible { outline: 2px solid #fff; outline-offset: -2px; } } }
</style>
