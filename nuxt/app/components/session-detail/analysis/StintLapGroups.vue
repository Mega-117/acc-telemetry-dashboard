<script setup lang="ts" generic="T extends { key: string, stint?: number | null, stintFuelL?: number | null, lapNumber?: number | null }">
// dev.11 (user 05/11): the laps of this session under one heading per stint, the same in "Cambia il tuo
// giro" and in "Cambia riferimento › I miei giri". Only the headings are new: each row is the caller's.
import { computed } from 'vue'
import { groupByStint } from '~/services/telemetry/lapChoice'
import { useI18n } from '~/i18n'

const props = defineProps<{ laps: T[] }>()
defineSlots<{ default(props: { lap: T }): unknown }>()
const { t, locale } = useI18n()
const groups = computed(() => groupByStint(props.laps))
// The departure fuel only: a lap count here would differ from the Sessione page's (laps without a trace
// - the in-lap - are not in these lists).
const meta = (g: { startFuelL: number | null }) => g.startFuelL !== null
  ? `${(Math.round(g.startFuelL * 10) / 10).toString().replace('.', locale.value === 'it' ? ',' : '.')} L` : ''
</script>

<template>
  <div class="stint-groups">
    <section v-for="g in groups" :key="g.stint ?? 'none'" class="stint-groups__group" :aria-label="g.stint !== null ? t('telemetry.stintBlock.stint', { n: g.stint }) : undefined">
      <header v-if="g.stint !== null" class="stint-groups__head" data-testid="stint-group-head">
        <strong>{{ t('telemetry.stintBlock.stint', { n: g.stint }) }}</strong>
        <span v-if="g.kind" class="stint-groups__kind" :class="`is-${g.kind}`">{{ t(`telemetry.choice.kind.${g.kind}`) }}</span>
        <span class="stint-groups__meta">{{ meta(g) }}</span>
      </header>
      <div class="choice-list">
        <template v-for="lap in g.laps" :key="lap.key">
          <slot :lap="lap" />
        </template>
      </div>
    </section>
  </div>
</template>

<style scoped lang="scss">
.stint-groups { display: grid; gap: 14px; }
.stint-groups__group { display: grid; gap: 4px; }
.stint-groups__head { display: flex; align-items: baseline; gap: 8px; padding: 0 4px 6px; border-bottom: 1px solid var(--rc-section-line, #ffffff40);
  strong { font: 800 12px/1.2 'Inter', sans-serif; letter-spacing: .06em; text-transform: uppercase; color: #fff; }
}
/* The same pill as the rows' "Stint gara / Stint qualifica" (LapChoiceRow .choice-row__kind). */
.stint-groups__kind { --k: #b3b3b8; padding: 1px 8px; border: 1px solid color-mix(in srgb, var(--k) 45%, transparent); background: color-mix(in srgb, var(--k) 10%, transparent);
  color: var(--k); font: 700 11px/18px 'Inter', sans-serif; letter-spacing: .04em; text-transform: uppercase; white-space: nowrap;
  &.is-qualify { --k: var(--racing-qualify, #ffc400); }
  &.is-race { --k: color-mix(in srgb, var(--racing-race, #ff0024) 80%, white); }
}
.stint-groups__meta { margin-left: auto; font: 500 12px/1.2 'Inter', sans-serif; color: #b3b3b8; font-variant-numeric: tabular-nums; }
</style>
