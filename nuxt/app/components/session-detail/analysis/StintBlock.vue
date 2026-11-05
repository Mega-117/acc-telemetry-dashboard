<script setup lang="ts">
// dev.10 (user 05/11): the stint of "Tu" under the minimap: three short lines, the Sessione page's facts.
import { computed } from 'vue'
import type { StintFacts } from '~/services/telemetry/stintBlock'
import { formatLapTime } from '~/utils/telemetryFormat'
import { useI18n } from '~/i18n'

const props = defineProps<{ facts: StintFacts }>()
const { t, locale } = useI18n()
const dec = (n: number, digits = 1) => n.toFixed(digits).replace('.', locale.value === 'it' ? ',' : '.')
const title = computed(() => [t('telemetry.stintBlock.stint', { n: props.facts.stint }),
  props.facts.kind ? t(`telemetry.stintBlock.kind.${props.facts.kind}`) : '',
  props.facts.startFuelL !== null ? (props.facts.endFuelL !== null ? `${Math.round(props.facts.startFuelL)} → ${Math.round(props.facts.endFuelL)} L` : `${Math.round(props.facts.startFuelL)} L`) : '',
].filter(Boolean).join(' · '))
const pace = computed(() => props.facts.avgMs !== null
  ? t('telemetry.stintBlock.pace', { time: formatLapTime(props.facts.avgMs), n: props.facts.cleanCount })
  : t('telemetry.stintBlock.paceFew', { n: props.facts.cleanCount }))
const items = computed(() => [
  { label: t('telemetry.stintBlock.best'), value: props.facts.bestMs !== null ? formatLapTime(props.facts.bestMs) : '–' },
  { label: t('telemetry.stintBlock.theoretical'), value: props.facts.theoreticalMs !== null ? formatLapTime(props.facts.theoreticalMs) : '–' },
  { label: t('telemetry.stintBlock.valid'), value: String(props.facts.valid) },
  { label: t('telemetry.stintBlock.invalid'), value: String(props.facts.invalid) },
  { label: t('telemetry.stintBlock.fuel'), value: props.facts.fuelPerLapL !== null ? `${dec(props.facts.fuelPerLapL, 2)} L` : '–' },
  { label: t('telemetry.stintBlock.temps'), value: props.facts.airC !== null || props.facts.roadC !== null
    ? `${props.facts.airC !== null ? Math.round(props.facts.airC) + '°' : '–'} / ${props.facts.roadC !== null ? Math.round(props.facts.roadC) + '°' : '–'}` : '–' },
])
</script>

<template>
  <section class="stint-block panel" :aria-label="title">
    <header class="stint-block__head">
      <strong>{{ title }}</strong>
    </header>
    <p class="stint-block__pace">{{ pace }}</p>
    <dl class="stint-block__grid">
      <div v-for="item in items" :key="item.label"><dt>{{ item.label }}</dt><dd>{{ item.value }}</dd></div>
    </dl>
  </section>
</template>

<style scoped lang="scss">
.stint-block { padding: 12px 14px; display: grid; gap: 8px; }
.stint-block__head strong { font: 800 13px/1.2 'Inter', sans-serif; letter-spacing: .04em; text-transform: uppercase; color: #e6e6ea; }
.stint-block__pace { margin: 0; font: 600 13px/1.3 'Inter', sans-serif; color: #c8c8cc; font-variant-numeric: tabular-nums; }
.stint-block__grid { margin: 0; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px 10px;
  div { display: grid; gap: 1px; }
  dt { font: 600 10px/1.2 'Inter', sans-serif; letter-spacing: .06em; text-transform: uppercase; color: #8a8a92; }
  dd { margin: 0; font: 700 14px/1.2 'Inter', sans-serif; color: #f0f0f2; font-variant-numeric: tabular-nums; }
}
</style>
