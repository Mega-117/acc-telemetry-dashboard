<script setup lang="ts">
// PIP-633: i numeri del periodo con la freccia rispetto al periodo prima (come le Tendenze di Apple Fitness).
import { ArrowDownRight, ArrowRight, ArrowUpRight } from '@lucide/vue'
import { trend, type PeriodTotals } from '~/utils/statsJourney'
import { formatDriveTime } from '~/utils/telemetryFormat'
import { useI18n } from '~/i18n'

const props = defineProps<{ current: PeriodTotals, previous: PeriodTotals | null, periodLabel: string }>()

const { t } = useI18n()
const hours = (ms: number) => (ms > 0 ? formatDriveTime(ms) : '0m')
const cards = computed(() => {
  const p = props.previous
  return [
    { id: 'time', label: t('stats.trend.time'), value: hours(props.current.timeMs), t: trend(props.current.timeMs, p?.timeMs ?? null), fmt: (d: number) => hours(Math.abs(d)) },
    { id: 'sessions', label: t('stats.trend.sessions'), value: String(props.current.sessions), t: trend(props.current.sessions, p?.sessions ?? null), fmt: (d: number) => String(Math.abs(d)) },
    { id: 'laps', label: t('stats.trend.laps'), value: String(props.current.laps), t: trend(props.current.laps, p?.laps ?? null), fmt: (d: number) => String(Math.abs(d)) },
    { id: 'valid', label: t('stats.trend.valid'), value: props.current.validPct === null ? '–' : `${props.current.validPct}%`, t: trend(props.current.validPct, p?.validPct ?? null), fmt: (d: number) => t('stats.trend.points', { n: Math.abs(d) }) },
  ]
})
</script>

<template>
  <dl class="trend-cards" :aria-label="t('stats.trend.aria', { period: periodLabel })">
    <div v-for="c in cards" :key="c.id" class="trend-card" :class="`trend-card--${c.id}`">
      <dt>{{ c.label }}</dt>
      <dd>
        <strong>{{ c.value }}</strong>
        <span v-if="c.t" class="trend" :class="`trend--${c.t.direction}`">
          <ArrowUpRight v-if="c.t.direction === 'up'" :size="16" aria-hidden="true" />
          <ArrowDownRight v-else-if="c.t.direction === 'down'" :size="16" aria-hidden="true" />
          <ArrowRight v-else :size="16" aria-hidden="true" />
          {{ c.t.direction === 'flat' ? t('stats.trend.same') : t('stats.trend.change', { delta: `${c.t.direction === 'up' ? '+' : '−'}${c.fmt(c.t.delta)}` }) }}
        </span>
      </dd>
    </div>
  </dl>
</template>

<style scoped lang="scss">
.trend-cards { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; margin: 0; }
.trend-card { border: 1px solid rgba(255, 255, 255, 0.3960784314); border-left: 3px solid var(--kpi); padding: 14px 16px;
  background: linear-gradient(90deg, color-mix(in srgb, var(--kpi) 16%, transparent), transparent 65%); }
.trend-card--time { --kpi: #0076ff; }
.trend-card--sessions { --kpi: #00c2d6; }
.trend-card--laps { --kpi: #ffc400; }
.trend-card--valid { --kpi: #22c55e; }
dt { font: 400 12px/1.2 'Arial Narrow', 'Segoe UI', sans-serif; text-transform: uppercase; color: #cfcfcf; }
dd { margin: 6px 0 0; display: flex; flex-direction: column; gap: 6px; }
strong { font: italic 700 clamp(26px, 2.4vw, 38px)/1 'Racer Display', sans-serif; font-variant-numeric: tabular-nums; }
.trend { display: inline-flex; align-items: center; gap: 4px; font-size: 12px; }
.trend--up { color: #4ade80; }
.trend--down { color: #fb923c; }
.trend--flat { color: #bdbdbd; }
@media (max-width: 1100px) { .trend-cards { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
