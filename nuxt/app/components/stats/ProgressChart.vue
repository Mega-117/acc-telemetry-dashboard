<script setup lang="ts">
// PIP-633: "stai migliorando?". Il tempo di ogni sessione nel tempo per una pista e un'auto, con la
// frase che confronta i tuoi inizi con le sessioni recenti (come le Tendenze di Apple Fitness).
import { computed, ref, watch } from 'vue'
import { personalRecords, progressDelta, progressSeries, shortDate, type ProgressMetric } from '~/utils/statsJourney'
import type { SessionDocument } from '~/types/telemetry'
import { formatCarName, formatLapTime, formatTrackName } from '~/utils/telemetryFormat'
import { useI18n, type TranslationKey } from '~/i18n'

const props = defineProps<{ sessions: SessionDocument[], nowMs: number }>()
const { t, locale } = useI18n()
// Le combinazioni con piu' sessioni prima: e' li' che si vede un andamento.
const combos = computed(() => personalRecords(props.sessions, props.nowMs).slice().sort((a, b) => b.sessions - a.sessions))
const comboKey = ref('')
watch(combos, (list) => { if (!list.some(c => c.key === comboKey.value)) comboKey.value = list[0]?.key ?? '' }, { immediate: true })
const combo = computed(() => combos.value.find(c => c.key === comboKey.value) ?? null)

// Stessi nomi e colori del dettaglio pista: qualifica gialla, gara rossa, media gara azzurra (token unici, PIP-654).
const METRICS: { id: ProgressMetric, label: TranslationKey, color: string }[] = [
  { id: 'qualy', label: 'stats.best.qualy', color: 'var(--racing-qualify)' },
  { id: 'race', label: 'stats.best.race', color: 'var(--racing-race)' },
  { id: 'avgRace', label: 'stats.best.avgRace', color: 'var(--racing-practice)' },
]
const metric = ref<ProgressMetric>('race')
const available = computed(() => METRICS.filter(m => combo.value && progressSeries(props.sessions, combo.value.trackKey, combo.value.carKey, m.id).length))
// Si parte dal tempo con piu' sessioni: e' quello con l'andamento piu' leggibile.
watch(available, (list) => {
  if (list.some(m => m.id === metric.value) || !combo.value) return
  const c = combo.value
  metric.value = [...list].sort((a, b) => progressSeries(props.sessions, c.trackKey, c.carKey, b.id).length - progressSeries(props.sessions, c.trackKey, c.carKey, a.id).length)[0]?.id ?? 'race'
}, { immediate: true })
const color = computed(() => METRICS.find(m => m.id === metric.value)?.color ?? 'var(--racing-practice)')
const points = computed(() => (combo.value ? progressSeries(props.sessions, combo.value.trackKey, combo.value.carKey, metric.value) : []))
const delta = computed(() => progressDelta(points.value))

// Grafico come i record di Garmin: la linea e' il tuo record nel tempo (scende solo quando migliori),
// i puntini sono le singole sessioni. Piu' in alto = piu' veloce. Le sessioni molto lente (giri di
// prova, uscite) non schiacciano il grafico: restano sul bordo basso, segnate come fuori scala.
const W = 640, H = 300, PAD = 28
const chart = computed(() => {
  const p = points.value
  if (!p.length) return null
  const sorted = p.map(x => x.ms).sort((a, b) => a - b)
  const min = sorted[0]!, max = sorted[sorted.length - 1]!
  const q75 = sorted[Math.floor((sorted.length - 1) * 0.75)]!
  const span = Math.max(1500, (q75 - min) * 1.4)
  const x = (i: number) => (p.length === 1 ? W / 2 : PAD + (i / (p.length - 1)) * (W - PAD * 2))
  const y = (ms: number) => PAD + (Math.min(ms - min, span) / span) * (H - PAD * 2.2)
  let record = Infinity
  const pts = p.map((v, i) => {
    record = Math.min(record, v.ms)
    return { x: x(i), y: y(v.ms), recordY: y(record), v, outOfScale: v.ms - min > span }
  })
  // Linea a gradini del record: orizzontale finche' non lo batti, poi scende.
  const steps = pts.flatMap((q, i) => (i ? [`${q.x},${pts[i - 1]!.recordY}`, `${q.x},${q.recordY}`] : [`${q.x},${q.recordY}`]))
  return { pts, recordLine: steps.join(' '), best: pts.find(q => q.v.ms === min)!, min, max }
})
const sentence = computed(() => {
  if (!combo.value) return null
  const n = points.value.length
  if (n < 3) return t('stats.progress.needMore', { n })
  const d = delta.value!
  const since = shortDate(d.fromDate)
  const s = (Math.abs(d.deltaMs) / 1000).toFixed(1).replace('.', locale.value === 'it' ? ',' : '.')
  if (Math.abs(d.deltaMs) < 50) return t('stats.progress.stable', { since })
  return d.deltaMs < 0 ? t('stats.progress.better', { s, since }) : t('stats.progress.worse', { s, since })
})
const dateLabel = (iso: string) => shortDate(iso)
const metricLabel = computed(() => { const m = METRICS.find(x => x.id === metric.value); return m ? t(m.label) : '' })
</script>

<template>
  <section class="progress" aria-labelledby="stats-progress">
    <div class="progress__head">
      <h2 id="stats-progress">{{ t('stats.progress.title') }}</h2>
      <select v-model="comboKey" :aria-label="t('stats.progress.comboAria')">
        <option v-for="c in combos" :key="c.key" :value="c.key">{{ formatTrackName(c.track) }} · {{ formatCarName(c.car) }} ({{ c.sessions }})</option>
      </select>
    </div>
    <p v-if="sentence" class="progress__sentence" :class="{ 'is-good': delta && delta.deltaMs < -50 }">{{ sentence }}</p>
    <div v-if="available.length > 1" class="progress__metrics" role="group" :aria-label="t('stats.progress.metricAria')">
      <button v-for="m in available" :key="m.id" type="button" :class="{ active: m.id === metric }" :aria-pressed="m.id === metric" :style="{ '--m': m.color }" @click="metric = m.id">{{ t(m.label) }}</button>
    </div>
    <!-- Con un solo tempo disponibile non c'e' da scegliere, ma il nome resta visibile. -->
    <div v-else-if="available.length === 1" class="progress__metrics"><span class="active" :style="{ '--m': color }">{{ metricLabel }}</span></div>
    <svg v-if="chart" class="progress__chart" :viewBox="`0 0 ${W} ${H}`" role="img" :aria-label="t('stats.progress.chartAria', { best: formatLapTime(chart.min), worst: formatLapTime(chart.max) })">
      <line :x1="PAD" :x2="W - PAD" :y1="chart.best.y" :y2="chart.best.y" class="progress__best" />
      <g v-for="q in chart.pts" :key="q.v.date">
        <circle :cx="q.x" :cy="q.y" :r="q.outOfScale ? 3 : 4" :style="{ fill: color }" :opacity="q.outOfScale ? 0.25 : 0.45"><title>{{ dateLabel(q.v.date) }} · {{ formatLapTime(q.v.ms) }}{{ q.outOfScale ? ` (${t('stats.progress.outOfScale')})` : '' }}</title></circle>
      </g>
      <polyline :points="chart.recordLine" fill="none" :style="{ stroke: color }" stroke-width="3" stroke-linejoin="round" class="progress__record" />
      <circle :cx="chart.best.x" :cy="chart.best.y" r="6" fill="#fff" :style="{ stroke: color }" stroke-width="3" />
      <text :x="Math.min(Math.max(chart.best.x, PAD + 30), W - PAD - 30)" :y="Math.max(14, chart.best.y - 12)" text-anchor="middle" class="progress__label">{{ t('stats.progress.record') }} {{ formatLapTime(chart.min) }}</text>
      <text :x="PAD" :y="H - 4" class="progress__axis">{{ dateLabel(points[0]!.date) }}</text>
      <text :x="W - PAD" :y="H - 4" text-anchor="end" class="progress__axis">{{ dateLabel(points[points.length - 1]!.date) }}</text>
    </svg>
    <p v-if="chart" class="progress__legend"><span class="progress__legend-line" :style="{ background: color }" />{{ t('stats.progress.legendRecord') }} <span class="progress__legend-dot" :style="{ background: color }" />{{ t('stats.progress.legendSession') }}</p>
    <p v-else class="progress__empty">{{ t('stats.progress.empty') }}</p>
    <!-- Gli stessi dati del grafico in testo: i puntini non sono raggiungibili da tastiera o lettore di schermo. -->
    <details v-if="chart" class="progress__list">
      <summary>{{ t('stats.progress.list', { count: points.length }) }}</summary>
      <ol>
        <li v-for="(p, i) in points" :key="`${p.date}-${i}`">{{ shortDate(p.date, true) }} · {{ formatLapTime(p.ms) }}<template v-if="p.ms === chart.min"> · {{ t('stats.progress.recordLower') }}</template></li>
      </ol>
    </details>
  </section>
</template>

<style scoped lang="scss">
.progress { border: 1px solid rgba(255, 255, 255, 0.3960784314); padding: 14px 16px; min-width: 0; }
h2 { margin: 0; font: italic 700 18px/1.2 'Racer Display', sans-serif; text-transform: uppercase; }
.progress__head { display: flex; justify-content: space-between; align-items: center; gap: 12px; flex-wrap: wrap; }
select { background: #0b0b0b; color: #f5f5f5; border: 1px solid #ffffff55; padding: 5px 8px; font-size: 13px; max-width: 100%; }
.progress__sentence { margin: 10px 0; padding: 8px 12px; border-left: 3px solid #0076ff; background: linear-gradient(90deg, #0076ff1f, transparent 70%); font-size: 14px; }
.progress__sentence.is-good { border-left-color: #22c55e; background: linear-gradient(90deg, #22c55e24, transparent 70%); }
.progress__metrics { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 8px; }
.progress__metrics button { background: #ffffff10; border: 0; border-left: 3px solid var(--m); color: #d8d8d8; padding: 5px 10px; cursor: pointer; font: 500 12px/1.2 'Arial Narrow', 'Segoe UI', sans-serif; text-transform: uppercase; }
.progress__metrics button.active, .progress__metrics span.active { background: #ffffff26; color: #fff; }
.progress__metrics span { border-left: 3px solid var(--m); padding: 5px 10px; font: 500 12px/1.2 'Arial Narrow', 'Segoe UI', sans-serif; text-transform: uppercase; }
.progress__chart { width: 100%; height: auto; display: block; }
.progress__best { stroke: #ffffff33; stroke-dasharray: 4 4; }
.progress__label { fill: #fff; font: 600 12px 'Segoe UI', sans-serif; }
.progress__axis { fill: #a8a8a8; font: 11px 'Segoe UI', sans-serif; }
.progress__empty { color: #9a9a9a; font-size: 13px; }
.progress__record { filter: drop-shadow(0 0 4px currentColor); }
.progress__legend { display: flex; align-items: center; gap: 6px; margin: 4px 0 0; font-size: 11px; color: #a8a8a8; }
.progress__legend-line { display: inline-block; width: 18px; height: 3px; }
.progress__legend-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; opacity: .5; margin-left: 10px; }
.progress__list { margin-top: 8px; font-size: 12px; color: #c4c4c4; }
.progress__list summary { cursor: pointer; color: #a8a8a8; }
.progress__list ol { margin: 6px 0 0; padding-left: 20px; columns: 2; }
</style>
