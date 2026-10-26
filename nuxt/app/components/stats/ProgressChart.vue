<script setup lang="ts">
// PIP-633: "stai migliorando?". Il tempo di ogni sessione nel tempo per una pista e un'auto, con la
// frase che confronta i tuoi inizi con le sessioni recenti (come le Tendenze di Apple Fitness).
import { personalRecords, progressDelta, progressSeries, type ProgressMetric } from '~/utils/statsJourney'
import type { SessionDocument } from '~/types/telemetry'
import { formatCarName, formatLapTime, formatTrackName } from '~/utils/telemetryFormat'

const props = defineProps<{ sessions: SessionDocument[], nowMs: number }>()
// Le combinazioni con piu' sessioni prima: e' li' che si vede un andamento.
const combos = computed(() => personalRecords(props.sessions, props.nowMs).slice().sort((a, b) => b.sessions - a.sessions))
const comboKey = ref('')
watch(combos, (list) => { if (!list.some(c => c.key === comboKey.value)) comboKey.value = list[0]?.key ?? '' }, { immediate: true })
const combo = computed(() => combos.value.find(c => c.key === comboKey.value) ?? null)

// Stessi nomi e colori del dettaglio pista: qualifica gialla, gara rossa, media gara azzurra.
const METRICS: { id: ProgressMetric, label: string, color: string }[] = [
  { id: 'qualy', label: 'Best qualifica', color: '#ffc400' },
  { id: 'race', label: 'Best gara', color: '#ff0024' },
  { id: 'avgRace', label: 'Best media gara', color: '#0076ff' },
]
const metric = ref<ProgressMetric>('race')
const available = computed(() => METRICS.filter(m => combo.value && progressSeries(props.sessions, combo.value.trackKey, combo.value.carKey, m.id).length))
// Si parte dal tempo con piu' sessioni: e' quello con l'andamento piu' leggibile.
watch(available, (list) => {
  if (list.some(m => m.id === metric.value) || !combo.value) return
  const c = combo.value
  metric.value = [...list].sort((a, b) => progressSeries(props.sessions, c.trackKey, c.carKey, b.id).length - progressSeries(props.sessions, c.trackKey, c.carKey, a.id).length)[0]?.id ?? 'race'
}, { immediate: true })
const color = computed(() => METRICS.find(m => m.id === metric.value)?.color ?? '#0076ff')
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
  if (n < 3) return `Servono almeno 3 sessioni con questo tempo per vedere un andamento (ora ${n}).`
  const d = delta.value!
  const since = `${d.fromDate.slice(8, 10)}/${d.fromDate.slice(5, 7)}`
  const s = (Math.abs(d.deltaMs) / 1000).toFixed(1).replace('.', ',')
  if (Math.abs(d.deltaMs) < 50) return `Stabile rispetto ai tuoi inizi del ${since}: stessi tempi.`
  return d.deltaMs < 0 ? `Stai migliorando: −${s} s rispetto ai tuoi inizi del ${since}.` : `Più lento di ${s} s rispetto ai tuoi inizi del ${since}: condizioni o setup diversi?`
})
const dateLabel = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
</script>

<template>
  <section class="progress" aria-labelledby="stats-progress">
    <div class="progress__head">
      <h2 id="stats-progress">Stai migliorando?</h2>
      <select v-model="comboKey" aria-label="Pista e auto">
        <option v-for="c in combos" :key="c.key" :value="c.key">{{ formatTrackName(c.track) }} · {{ formatCarName(c.car) }} ({{ c.sessions }})</option>
      </select>
    </div>
    <p v-if="sentence" class="progress__sentence" :class="{ 'is-good': delta && delta.deltaMs < -50 }">{{ sentence }}</p>
    <div v-if="available.length > 1" class="progress__metrics" role="group" aria-label="Quale tempo">
      <button v-for="m in available" :key="m.id" type="button" :class="{ active: m.id === metric }" :style="{ '--m': m.color }" @click="metric = m.id">{{ m.label }}</button>
    </div>
    <svg v-if="chart" class="progress__chart" :viewBox="`0 0 ${W} ${H}`" role="img" :aria-label="`Tempi per sessione, dal migliore ${formatLapTime(chart.min)} al peggiore ${formatLapTime(chart.max)}`">
      <line :x1="PAD" :x2="W - PAD" :y1="chart.best.y" :y2="chart.best.y" class="progress__best" />
      <g v-for="q in chart.pts" :key="q.v.date">
        <circle :cx="q.x" :cy="q.y" :r="q.outOfScale ? 3 : 4" :fill="color" :opacity="q.outOfScale ? 0.25 : 0.45"><title>{{ dateLabel(q.v.date) }} · {{ formatLapTime(q.v.ms) }}{{ q.outOfScale ? ' (fuori scala)' : '' }}</title></circle>
      </g>
      <polyline :points="chart.recordLine" fill="none" :stroke="color" stroke-width="3" stroke-linejoin="round" class="progress__record" />
      <circle :cx="chart.best.x" :cy="chart.best.y" r="6" fill="#fff" :stroke="color" stroke-width="3" />
      <text :x="Math.min(Math.max(chart.best.x, PAD + 30), W - PAD - 30)" :y="Math.max(14, chart.best.y - 12)" text-anchor="middle" class="progress__label">Record {{ formatLapTime(chart.min) }}</text>
      <text :x="PAD" :y="H - 4" class="progress__axis">{{ dateLabel(points[0]!.date) }}</text>
      <text :x="W - PAD" :y="H - 4" text-anchor="end" class="progress__axis">{{ dateLabel(points[points.length - 1]!.date) }}</text>
    </svg>
    <p v-if="chart" class="progress__legend"><span class="progress__legend-line" :style="{ background: color }" />il tuo record nel tempo <span class="progress__legend-dot" :style="{ background: color }" />ogni sessione</p>
    <p v-else class="progress__empty">Nessuna sessione con tempi per questa scelta.</p>
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
.progress__metrics button.active { background: #ffffff26; color: #fff; }
.progress__chart { width: 100%; height: auto; display: block; }
.progress__best { stroke: #ffffff33; stroke-dasharray: 4 4; }
.progress__label { fill: #fff; font: 600 12px 'Segoe UI', sans-serif; }
.progress__axis { fill: #a8a8a8; font: 11px 'Segoe UI', sans-serif; }
.progress__empty { color: #9a9a9a; font-size: 13px; }
.progress__record { filter: drop-shadow(0 0 4px currentColor); }
.progress__legend { display: flex; align-items: center; gap: 6px; margin: 4px 0 0; font-size: 11px; color: #a8a8a8; }
.progress__legend-line { display: inline-block; width: 18px; height: 3px; }
.progress__legend-dot { display: inline-block; width: 7px; height: 7px; border-radius: 50%; opacity: .5; margin-left: 10px; }
</style>
