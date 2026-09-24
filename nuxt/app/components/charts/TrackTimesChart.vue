<script setup lang="ts">
import { computed, ref } from 'vue'
import { Line } from 'vue-chartjs'
import { Chart as ChartJS, LinearScale, PointElement, LineElement, Tooltip, Legend, type ChartData, type ChartOptions } from 'chart.js'
import type { TrackHistoricalPointProjection } from '~/types/trackProjections'
import { buildTrackTimesChart, type TrackChartPeriod, type TrackChartScale, type TrackChartPoint } from '~/utils/trackTimesChart'
import { formatLapTime } from '~/utils/telemetryFormat'

ChartJS.register(LinearScale, PointElement, LineElement, Tooltip, Legend)
const props = defineProps<{ history: TrackHistoricalPointProjection[]; loading?: boolean }>()
const period = ref<TrackChartPeriod>('30')
const scale = ref<TrackChartScale>('focus')
const model = computed(() => buildTrackTimesChart(props.history, period.value, scale.value, new Date()))
const seriesLabels = { bestQualy: 'Best qualifica', bestRace: 'Best gara' }
const chartData = computed<ChartData<'line', TrackChartPoint[]>>(() => ({
  datasets: (['bestQualy', 'bestRace'] as const).flatMap(key => {
    const color = key === 'bestQualy' ? '#f0b400' : '#ff6464'
    const points = model.value.series[key]
    const radii = points.map((point, index) => {
      const isolated = (points[index - 1]?.y == null) && (points[index + 1]?.y == null)
      return point.y !== null && (points.length <= 8 || isolated) ? 3 : 0
    })
    return [{
      label: seriesLabels[key], data: points, borderColor: color, backgroundColor: color,
      borderWidth: 1.75, pointRadius: radii, pointHoverRadius: 5,
      pointHitRadius: 12, tension: 0, spanGaps: false, fill: false,
    }, {
      label: `${seriesLabels[key]} · fuori scala`,
      data: model.value.outside.filter(point => point.series === key),
      borderColor: color, backgroundColor: color, pointStyle: 'triangle' as const,
      pointRadius: 5, pointHoverRadius: 7, pointHitRadius: 12, showLine: false, clip: false,
    }]
  }),
}))
const chartOptions = computed<ChartOptions<'line'>>(() => ({
  responsive: true, maintainAspectRatio: false, animation: false,
  interaction: { intersect: false, mode: 'nearest' },
  layout: { padding: { top: 8 } },
  plugins: {
    // Static legend keeps a series and its overflow markers coherent.
    legend: { display: false },
    tooltip: {
      backgroundColor: 'rgba(20,20,30,0.96)', padding: 12,
      callbacks: {
        title: items => (items[0]?.raw as TrackChartPoint | undefined)?.label ?? '',
        label: item => {
          const point = item.raw as TrackChartPoint
          return `${item.dataset.label}: ${formatLapTime(point.original * 1000)}`
        },
      },
    },
  },
  scales: {
    x: {
      type: 'linear', min: -0.5, max: Math.max(0.5, model.value.labels.length - 0.5),
      afterBuildTicks: axis => {
        const count = Math.min(6, model.value.labels.length)
        axis.ticks = Array.from({ length: count }, (_, index) => ({
          value: count === 1 ? 0 : Math.round(index * (model.value.labels.length - 1) / (count - 1)),
        }))
      },
      grid: { display: false },
      title: { display: true, text: 'Sessioni in ordine cronologico', color: '#85858f' },
      ticks: { color: '#9898a3', maxTicksLimit: 6, precision: 0, maxRotation: 0,
        callback: value => Number.isInteger(Number(value)) ? model.value.labels[Number(value)] ?? '' : '' },
    },
    y: {
      min: model.value.min, max: model.value.max,
      grid: { color: 'rgba(255,255,255,0.06)' },
      ticks: { color: '#9898a3', maxTicksLimit: 6, callback: value => formatLapTime(Number(value) * 1000) },
    },
  },
}))
</script>

<template>
  <section class="track-times" aria-label="Andamento tempi">
    <header class="track-times__header">
      <div><h2>Andamento tempi</h2><p>Best per sessione</p></div>
      <div class="track-times__controls">
        <label>Periodo
          <select v-model="period" aria-label="Periodo del grafico">
            <option value="7">Ultimi 7 giorni</option>
            <option value="30">Ultimi 30 giorni</option>
            <option value="90">Ultimi 90 giorni</option>
            <option value="all">Storico disponibile</option>
          </select>
        </label>
        <fieldset>
          <legend>Scala</legend>
          <div class="track-times__toggle">
            <button type="button" :aria-pressed="scale === 'focus'" @click="scale = 'focus'">Focus</button>
            <button type="button" :aria-pressed="scale === 'complete'" @click="scale = 'complete'">Completa</button>
          </div>
        </fieldset>
      </div>
    </header>
    <div class="track-times__card" :aria-busy="loading">
      <p v-if="loading" class="track-times__empty" role="status">Caricamento tempi…</p>
      <template v-else-if="model.count">
        <div class="track-times__canvas">
          <Line :data="chartData" :options="chartOptions" role="img" :aria-label="`Andamento di ${model.count} ${model.count === 1 ? 'tempo' : 'tempi'}. Scala ${scale === 'focus' ? 'Focus' : 'Completa'}. ${model.outside.length} fuori scala.`" />
        </div>
        <div class="track-times__legend" aria-label="Legenda">
          <span><i class="track-times__qualy" />Best qualifica</span>
          <span><i class="track-times__race" />Best gara</span>
        </div>
        <div v-if="model.outside.length" class="track-times__notice" role="status">
          <span>△ {{ model.outside.length }} {{ model.outside.length === 1 ? 'tempo fuori scala' : 'tempi fuori scala' }}</span>
          <button type="button" @click="scale = 'complete'">Mostra tutti i tempi</button>
        </div>
        <details v-if="model.outside.length" class="track-times__details">
          <summary>Consulta i tempi fuori scala</summary>
          <ul>
            <li v-for="point in model.outside" :key="`${point.sessionId}-${point.series}`">
              {{ point.label }} · {{ seriesLabels[point.series] }} · <strong>{{ formatLapTime(point.original * 1000) }}</strong>
            </li>
          </ul>
        </details>
      </template>
      <div v-else class="track-times__empty" role="status">
        <p>Nessun tempo disponibile{{ period === 'all' ? '.' : ' nel periodo selezionato.' }}</p>
        <button v-if="period !== 'all' && history.length" type="button" @click="period = 'all'">Mostra lo storico disponibile</button>
      </div>
      <p v-if="!loading && model.unknownDates && period !== 'all'" class="track-times__hint">
        {{ model.unknownDates }} {{ model.unknownDates === 1 ? 'sessione senza data completa: consultabile' : 'sessioni senza data completa: consultabili' }} nello storico disponibile.
      </p>
      <p v-if="!loading && model.count" class="track-times__hint">
        {{ model.sessionCount }} {{ model.sessionCount === 1 ? 'sessione' : 'sessioni' }} · {{ period === 'all' ? 'Storico disponibile, fino a 200 sessioni.' : 'Periodo riferito a oggi.' }}
        {{ scale === 'focus' ? 'Focus adatta la scala; i tempi originali restano invariati.' : 'Scala completa: tutti i tempi del periodo.' }}
      </p>
    </div>
  </section>
</template>

<style scoped lang="scss">
.track-times {
  margin-bottom: 28px;
  &__header { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-bottom: 12px; }
  h2 { margin: 0; font-size: 18px; font-weight: 700; }
  &__header p { margin: 5px 0 0; font-size: 12px; color: #94949f; }
  &__controls { display: flex; align-items: end; flex-wrap: wrap; gap: 12px; }
  label, legend { font-size: 11px; color: #aaaab5; }
  label { display: flex; flex-direction: column; gap: 6px; }
  fieldset { border: 0; padding: 0; margin: 0; min-width: 0; }
  legend { padding: 0; margin-bottom: 6px; }
  select, &__toggle { background: #1a1d2e; border: 1px solid #363847; border-radius: 7px; color: #eeeef4; }
  select { padding: 8px; font: inherit; font-size: 12px; min-height: 35px; }
  &__toggle { display: flex; overflow: hidden; }
  &__toggle button { border: 0; padding: 8px 10px; min-height: 33px; color: #a8a8b4; }
  &__toggle button[aria-pressed='true'] { color: #fff; background: #393c50; }
  button { background: transparent; color: #e0b96e; cursor: pointer; font: inherit; font-size: 12px; border: 0; }
  button:focus-visible, select:focus-visible, summary:focus-visible { outline: 2px solid #f0b400; outline-offset: 3px; }
  &__card { padding: 16px; border: 1px solid rgba(255,255,255,.07); border-radius: 12px; background: rgba(255,255,255,.02); }
  &__canvas { position: relative; height: 280px; }
  &__legend { display: flex; justify-content: center; flex-wrap: wrap; gap: 20px; margin: 12px 0; color: #b7b7c1; font-size: 12px; }
  &__legend span { display: flex; align-items: center; gap: 7px; }
  &__legend i { width: 18px; height: 2px; display: inline-block; }
  &__qualy { background: #f0b400; } &__race { background: #ff6464; }
  &__notice { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: 8px; background: rgba(240,180,0,.06); border-radius: 6px; padding: 10px; font-size: 12px; color: #e0bc76; }
  &__details { margin-top: 12px; color: #b7b7c1; font-size: 12px; }
  summary { cursor: pointer; } li { margin: 8px 0; overflow-wrap: anywhere; }
  &__hint { color: #92929e; font-size: 11px; line-height: 1.6; margin: 12px 0 0; }
  &__empty { min-height: 180px; display: flex; flex-direction: column; align-items: center; justify-content: center; text-align: center; color: #b7b7c1; font-size: 13px; }
  @media (max-width: 480px) { &__card { padding: 10px; } &__canvas { height: 260px; } }
}
</style>
