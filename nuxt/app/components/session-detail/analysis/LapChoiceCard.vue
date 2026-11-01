<script setup lang="ts">
// PIP-695: "Tu" and "Riferimento", always in sight: whose lap, which one, when, its status and (reference) why.
// The colour names the side (azzurro / ambra) and is always next to its word.
import { computed } from 'vue'
import type { LapChoice, LapSide, RefReason } from '~/services/telemetry/lapChoice'
import { useLapChoiceText } from '~/composables/useLapChoiceText'
import { useI18n } from '~/i18n'

const props = defineProps<{
  side: LapSide
  choice: LapChoice | null
  reason?: RefReason | null
  idealScope?: 'session' | 'history'
  /** Coach view: the reasons speak of this driver, not of "you". */
  pilotName?: string | null
  disabled?: boolean
}>()
const emit = defineEmits<{ change: [] }>()
const { t } = useI18n()
const text = useLapChoiceText()
const color = computed(() => props.side === 'you' ? '#38bdf8' : '#fbbf24')
const status = computed(() => props.choice ? text.status(props.choice.status) : null)
const when = computed(() => props.choice ? text.when(props.choice) : '')
const conditions = computed(() => text.conditions(props.choice?.conditions))
</script>

<template>
  <div class="lap-card" :class="[`lap-card--${side}`, { 'is-ideal': choice?.ideal }]" :style="{ '--c': color }">
    <span class="lap-card__side" :title="t(side === 'you' ? 'telemetry.youHint' : 'telemetry.referenceHint')">{{ text.side(side) }}</span>
    <div class="lap-card__body">
      <template v-if="choice">
        <p class="lap-card__who">
          <span class="lap-card__driver">{{ text.driver(choice) }}</span>
          <span v-if="choice.mine" class="lap-card__tag">{{ t('telemetry.choice.tagYou') }}</span>
        </p>
        <p class="lap-card__lap" :class="{ 'is-best': choice.best }">{{ text.lapLine(choice) }}</p>
        <p v-if="choice.ideal" class="lap-card__meta">{{ text.idealNote(idealScope) }}</p>
        <p v-else class="lap-card__meta">
          <span v-if="when">{{ when }}</span>
          <span class="lap-card__status" :class="`is-${choice.status}`"><span aria-hidden="true">{{ status!.icon }}</span> {{ status!.text }}</span>
        </p>
        <p v-if="conditions" class="lap-card__cond">{{ conditions }}</p>
        <p v-if="side === 'ref' && reason" class="lap-card__reason">{{ text.reason(reason, { pilotName }) }}</p>
      </template>
      <p v-else class="lap-card__lap">{{ t('telemetry.choice.noLap') }}</p>
    </div>
    <div class="lap-card__actions">
      <slot />
      <button type="button" class="lap-card__change" :disabled="disabled" :aria-label="t(side === 'you' ? 'telemetry.choice.changeYouAria' : 'telemetry.choice.changeRefAria')" aria-haspopup="dialog" @click="emit('change')">{{ t('telemetry.choice.change') }}</button>
    </div>
  </div>
</template>

<style scoped lang="scss">
.lap-card { --c: #38bdf8; display: flex; align-items: stretch; flex: 1 1 340px; min-width: 260px; max-width: 460px; border: 1px solid var(--c); background: color-mix(in srgb, var(--c) 10%, #0a0a0f);
  &.is-ideal { border-style: dashed; } }
.lap-card__side { display: grid; place-items: center; padding: 0 8px; background: var(--c); color: #0a0a0f; font: italic 700 13px 'Racer Display', sans-serif; text-transform: uppercase; writing-mode: horizontal-tb; }
.lap-card__body { display: grid; gap: 1px; flex: 1; min-width: 0; padding: 5px 10px; p { margin: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; } }
.lap-card__who { display: flex; align-items: center; gap: 6px; color: #fff; font: 700 13px 'Inter', sans-serif; }
.lap-card__driver { overflow: hidden; text-overflow: ellipsis; }
.lap-card__tag { flex-shrink: 0; padding: 0 5px; border: 1px solid var(--c); color: var(--c); font: 700 10px/16px 'Inter', sans-serif; letter-spacing: .05em; }
.lap-card__cond { color: #b3b3b8; font: 500 12px 'Inter', sans-serif; font-variant-numeric: tabular-nums; }
.lap-card__lap { color: #e6e6ea; font: italic 700 14px 'Racer Display', sans-serif; letter-spacing: .02em; &.is-best { color: #c084fc; } }
.lap-card__meta { display: flex; gap: 8px; color: #b3b3b8; font: 500 12px 'Inter', sans-serif; }
.lap-card__status { &.is-valid { color: #3ddc5a; } &.is-invalid { color: #ff8a98; } &.is-incomplete, &.is-unknown { color: #b3b3b8; } }
.lap-card__body .lap-card__reason { color: #d9c08a; font: 500 11px 'Inter', sans-serif; white-space: normal; } // why this lap: never cut off
.lap-card__actions { display: flex; flex-direction: column; justify-content: center; gap: 4px; padding: 6px; }
.lap-card__change, .lap-card__actions :slotted(button) { min-height: 28px; padding: 0 10px; border: 1px solid #ffffff40; background: #ffffff0d; color: #fff; font: 700 12px 'Inter', sans-serif; cursor: pointer;
  &:hover:not(:disabled) { border-color: var(--c); background: color-mix(in srgb, var(--c) 18%, transparent); }
  &:focus-visible { outline: 2px solid #fff; outline-offset: 1px; }
  &:disabled { opacity: .5; cursor: default; } }
@media (max-width: 700px) { .lap-card { flex-basis: 100%; max-width: none; min-width: 0; } }
</style>
