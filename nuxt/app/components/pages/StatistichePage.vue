<script setup lang="ts">
// PIP-619: Statistiche di attivita' (solo ACC). Lista sessioni gia' proiettata + un riepilogo
// calcolato sul PC; per il coach gli stessi dati del pilota (contesto esplicito dalla pagina pilota).
import { useTargetUserId, usePilotContext } from '~/composables/usePilotContext'
import { useHeaderBack } from '~/composables/useHeaderBack'
import { loadStatsSummary, refreshOwnStats } from '~/repositories/statsRepository'
import { noteFeatureUse } from '~/services/usage/featureUseNote'
import { useTelemetryGateway } from '~/composables/useTelemetryGateway'
import {
  AIR_BANDS, GRIP_ORDER, compareCars, filterCombos, filterSessions, timeByCar, timeByWeek,
  type StatsFilter, type StatsSummary,
} from '~/services/telemetry/activityStats'
import { normalizeSessionListKey } from '~/services/sync/sessionListProjectionService'
import { formatCarName, formatDriveTime, formatLapTime, formatTrackName } from '~/utils/telemetryFormat'
import {
  airInsight, byIdealMargin, carInsight, compareInsight, gapBarPct, heatLevel, idealInsight, marginLevel, rowBest, statsTotals,
} from '~/utils/statsPresentation'
import type { SessionDocument } from '~/types/telemetry'

const emit = defineEmits<{ back: [] }>()
const targetUserId = useTargetUserId()
const pilotContext = usePilotContext()
const gateway = useTelemetryGateway('acc')
useHeaderBack(() => emit('back'), () => 'Torna alla Panoramica')

const sessions = shallowRef<SessionDocument[]>([])
const summary = shallowRef<StatsSummary | null>(null)
const status = ref<'loading' | 'ready' | 'error'>('loading')
const computing = ref(false)
const remaining = ref(0)

const PERIODS = [
  { days: 7, label: '7 giorni' }, { days: 30, label: '30 giorni' }, { days: 90, label: '3 mesi' },
  { days: 365, label: '12 mesi' }, { days: 0, label: 'Tutto' },
]
const TYPES = [{ value: -1, label: 'Tutte' }, { value: 0, label: 'Prove libere' }, { value: 1, label: 'Qualifica' }, { value: 2, label: 'Gara' }]
const periodDays = ref(90)
const trackKey = ref('')
const carKey = ref('')
const sessionType = ref(-1)
const filter = computed<StatsFilter>(() => ({
  periodDays: periodDays.value || null, trackKey: trackKey.value || null, carKey: carKey.value || null,
  sessionType: sessionType.value < 0 ? null : sessionType.value,
}))

const accSessions = computed(() => sessions.value.filter(s => (s.meta?.gameId ?? 'acc') === 'acc'))
const options = (pick: (s: SessionDocument) => string, label: (v: string) => string) => {
  const map = new Map<string, string>()
  for (const s of accSessions.value) { const raw = pick(s); if (raw) map.set(normalizeSessionListKey(raw), label(raw)) }
  return [...map.entries()].map(([key, name]) => ({ key, name })).sort((a, b) => a.name.localeCompare(b.name))
}
const trackOptions = computed(() => options(s => s.meta?.track || '', formatTrackName))
const carOptions = computed(() => options(s => s.meta?.car || '', formatCarName))

const filtered = computed(() => filterSessions(sessions.value, filter.value, Date.now()))
const cars = computed(() => timeByCar(filtered.value))
// PIP-633: numeri in testa, barre per auto e per settimana con le etichette.
const totals = computed(() => statsTotals(cars.value))
const carMax = computed(() => Math.max(1, ...cars.value.map(c => c.timeMs)))
const weeks = computed(() => timeByWeek(filtered.value, Math.min(26, Math.max(4, Math.ceil((periodDays.value || 182) / 7))), Date.now()))
const weekMax = computed(() => Math.max(1, ...weeks.value.map(w => w.timeMs)))
// Colori del sito (azzurro prove, giallo qualifica, rosso gara) piu' ciano e viola: un colore per auto.
const CAR_COLORS = ['#0076ff', '#ffc400', '#00c2d6', '#8b5cf6', '#ff7a1a', '#ff0024']
const weekLabel =(iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`

const carA = ref('')
const carB = ref('')
watch(cars, (list) => {
  const keys = list.map(c => c.carKey)
  if (!keys.includes(carA.value)) carA.value = keys[0] ?? ''
  if (!keys.includes(carB.value) || carB.value === carA.value) carB.value = keys.find(k => k !== carA.value) ?? ''
}, { immediate: true })
const comparison = computed(() => carA.value && carB.value ? compareCars(filtered.value, carA.value, carB.value) : [])
const gapMax = computed(() => Math.max(0, ...comparison.value.map(r => Math.abs(r.gapMs ?? 0))))

const combos = computed(() => filterCombos(summary.value, filter.value))
// Prima le piste dove il giro ideale lascia piu' tempo da guadagnare.
const idealRows = computed(() => byIdealMargin(combos.value))
// Una frase per riquadro, in parole semplici.
const carName = (key: string) => formatCarName(cars.value.find(c => c.carKey === key)?.car ?? key)
const insights = computed(() => ({
  cars: carInsight(cars.value, formatCarName),
  compare: compareInsight(comparison.value, carName(carA.value), carName(carB.value), formatTrackName),
  ideal: idealInsight(idealRows.value, formatTrackName, formatCarName),
  air: airInsight(combos.value, AIR_BANDS),
}))
const heatClass =(value: number | null | undefined, best: number | null) => {
  const level = heatLevel(value, best)
  return level === null ? null : `heat--${level}`
}
const airBest =(c: { byAir: Record<string, number | undefined> }) => rowBest(AIR_BANDS.map(b => c.byAir[b.id]))
const gripBest = (c: { byGrip: Record<string, number> }) => rowBest(gripColumns.value.map(g => c.byGrip[g]))
const gripColumns = computed(() => {
  const seen = new Set(combos.value.flatMap(c => Object.keys(c.byGrip)))
  return [...GRIP_ORDER.filter(g => seen.has(g)), ...[...seen].filter(g => !(GRIP_ORDER as readonly string[]).includes(g))]
})
const label = (c: { track: string, car: string }) => `${formatTrackName(c.track)} · ${formatCarName(c.car)}`
const gap = (ms: number | null) => ms === null ? '–' : `${ms > 0 ? '+' : ms < 0 ? '−' : ''}${(Math.abs(ms) / 1000).toFixed(3)}`
const sector = (ms: number | null) => ms === null ? '–' : (ms / 1000).toFixed(3)
const hours = (ms: number) => ms > 0 ? formatDriveTime(ms) : '–'

async function load() {
  const uid = targetUserId.value
  if (!uid) { status.value = 'error'; return }
  status.value = 'loading'
  try {
    // Lista dal gateway (cache della proiezione + sessioni del PC non ancora caricate), come le altre pagine.
    const [list, stats] = await Promise.all([gateway.getVehicleHistory(uid), loadStatsSummary(uid)])
    sessions.value = list ?? []
    summary.value = stats
    status.value = 'ready'
    noteFeatureUse({ event: 'stats.opened', sessions: sessions.value.length })
  } catch {
    status.value = 'error'
    return
  }
  // Il proprietario completa il riepilogo: file sul PC, poi lo storico online (tetto giornaliero).
  // Il coach legge soltanto.
  if (pilotContext.value) return
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- bridge Electron, assente nel browser
  const electronAPI = typeof window === 'undefined' ? null : (window as any).electronAPI
  computing.value = true
  try {
    const result = await refreshOwnStats({ uid, electronAPI, sessions: sessions.value, existing: summary.value })
    if (result?.summary && uid === targetUserId.value) { summary.value = result.summary; remaining.value = result.remaining }
  } catch { /* resta il riepilogo letto */ } finally { computing.value = false }
}
onMounted(load)
watch(targetUserId, (uid, previous) => { if (uid && uid !== previous) void load() })
</script>

<template>
  <LayoutPageContainer>
    <div class="stats">
      <header class="stats__head">
        <h1>Statistiche</h1>
        <div class="stats__filters" role="group" aria-label="Filtri">
          <label>Periodo<select v-model.number="periodDays"><option v-for="p in PERIODS" :key="p.days" :value="p.days">{{ p.label }}</option></select></label>
          <label>Pista<select v-model="trackKey"><option value="">Tutte</option><option v-for="t in trackOptions" :key="t.key" :value="t.key">{{ t.name }}</option></select></label>
          <label>Auto<select v-model="carKey"><option value="">Tutte</option><option v-for="c in carOptions" :key="c.key" :value="c.key">{{ c.name }}</option></select></label>
          <label>Tipo<select v-model.number="sessionType"><option v-for="t in TYPES" :key="t.value" :value="t.value">{{ t.label }}</option></select></label>
        </div>
      </header>

      <p v-if="status === 'loading'" class="stats__note" role="status">Caricamento…</p>
      <p v-else-if="status === 'error'" class="stats__note" role="status">Dati non disponibili. <button type="button" @click="load">Riprova</button></p>

      <template v-else>
      <dl class="stats-kpis" aria-label="Riepilogo del periodo">
        <div><dt>Tempo in pista</dt><dd>{{ hours(totals.timeMs) }}</dd></div>
        <div><dt>Sessioni</dt><dd>{{ totals.sessions }}</dd></div>
        <div><dt>Giri</dt><dd>{{ totals.laps }}</dd></div>
        <div><dt>Giri validi</dt><dd>{{ totals.validPct === null ? '–' : `${totals.validPct}%` }}</dd></div>
      </dl>

      <div class="stats__grid">
        <section class="stats-panel" aria-labelledby="stats-time">
          <h2 id="stats-time">Tempo in pista per auto</h2>
          <p v-if="insights.cars" class="insight">{{ insights.cars }}</p>
          <ul class="car-bars">
            <li v-for="(c, i) in cars" :key="c.carKey">
              <div class="car-bars__label"><span>{{ formatCarName(c.car) }}</span><strong>{{ hours(c.timeMs) }}</strong></div>
              <div class="car-bars__track"><span :style="{ width: `${Math.max(2, (c.timeMs / carMax) * 100)}%`, '--bar': CAR_COLORS[i % CAR_COLORS.length] }" /></div>
              <small>{{ c.sessions }} {{ c.sessions === 1 ? 'sessione' : 'sessioni' }} · {{ c.laps }} {{ c.laps === 1 ? 'giro' : 'giri' }} · {{ c.laps ? Math.round((c.lapsValid / c.laps) * 100) + '% validi' : 'nessun giro' }}</small>
            </li>
            <li v-if="!cars.length" class="empty">Nessuna sessione nel periodo.</li>
          </ul>
          <h3 class="stats__h3">Ore per settimana</h3>
          <div class="weeks" role="img" :aria-label="`Ore per settimana, massimo ${hours(weekMax)}`">
            <div v-for="(w, i) in weeks" :key="w.weekStart" class="weeks__col" :title="`Settimana dal ${weekLabel(w.weekStart)} · ${hours(w.timeMs)}`">
              <span class="weeks__bar" :style="{ height: `${(w.timeMs / weekMax) * 100}%` }" />
              <small v-if="i === 0 || i === weeks.length - 1 || i % 4 === 0">{{ weekLabel(w.weekStart) }}</small>
            </div>
          </div>
        </section>

        <section class="stats-panel" aria-labelledby="stats-compare">
          <h2 id="stats-compare">Confronto tra due auto</h2>
          <p v-if="cars.length > 1" class="insight">{{ insights.compare }}</p>
          <div class="stats__pair">
            <select v-model="carA" aria-label="Prima auto"><option v-for="c in cars" :key="c.carKey" :value="c.carKey">{{ formatCarName(c.car) }}</option></select>
            <span>contro</span>
            <select v-model="carB" aria-label="Seconda auto"><option v-for="c in cars" :key="c.carKey" :value="c.carKey" :disabled="c.carKey === carA">{{ formatCarName(c.car) }}</option></select>
          </div>
          <table class="stats-table">
            <thead><tr><th>Pista</th><th>Prima</th><th>Seconda</th><th title="Tempo della seconda meno quello della prima: verde se la seconda e' piu' veloce">Seconda vs prima</th><th>Ore</th></tr></thead>
            <tbody>
              <tr v-for="r in comparison" :key="r.trackKey">
                <td>{{ formatTrackName(r.track) }}</td><td>{{ formatLapTime(r.bestA) }}</td><td>{{ formatLapTime(r.bestB) }}</td>
                <td class="gap-cell" :class="{ worse: (r.gapMs ?? 0) > 0, better: (r.gapMs ?? 0) < 0 }">
                  <span class="gap-cell__bar" :style="{ width: `${gapBarPct(r.gapMs, gapMax)}%` }" />{{ gap(r.gapMs) }}
                </td>
                <td>{{ hours(r.timeA) }} / {{ hours(r.timeB) }}</td>
              </tr>
              <tr v-if="!comparison.length"><td colspan="5" class="empty">Servono due auto con sessioni nel periodo.</td></tr>
            </tbody>
          </table>
        </section>

        <section class="stats-panel" aria-labelledby="stats-sectors">
          <h2 id="stats-sectors">Settori migliori e giro ideale</h2>
          <p v-if="insights.ideal" class="insight">{{ insights.ideal }}</p>
          <p class="stats__sub">Il giro ideale mette insieme i tuoi tre settori migliori: il margine è quanto potresti guadagnare. In alto le piste con più margine.</p>
          <table class="stats-table">
            <thead><tr><th>Pista · auto</th><th>S1</th><th>S2</th><th>S3</th><th>Ideale</th><th>Migliore</th><th title="Ideale meno migliore: quanto puoi guadagnare mettendo insieme i settori migliori">Margine</th></tr></thead>
            <tbody>
              <tr v-for="c in idealRows" :key="c.key">
                <td>{{ label(c) }}</td><td v-for="(s, i) in c.bestSectorsMs" :key="i">{{ sector(s) }}</td>
                <td>{{ formatLapTime(c.idealMs) }}</td><td>{{ formatLapTime(c.bestLapMs) }}</td>
                <td><span v-if="c.marginMs !== null" class="margin" :class="`margin--${marginLevel(c.marginMs)}`">{{ gap(c.marginMs) }}</span><template v-else>–</template></td>
              </tr>
              <tr v-if="!combos.length"><td colspan="7" class="empty">{{ summary ? 'Nessun dato per questi filtri.' : 'Questi dati arrivano dal programma Racer Core sul PC del pilota.' }}</td></tr>
            </tbody>
          </table>
        </section>

        <section class="stats-panel" aria-labelledby="stats-conditions">
          <h2 id="stats-conditions">Tempi per temperatura dell'aria e grip</h2>
          <p v-if="insights.air" class="insight">{{ insights.air }}</p>
          <p class="stats__sub">Il tuo miglior giro valido in ogni condizione. Verde dove vai più forte, rosso dove perdi di più.</p>
          <p class="heat-legend" aria-hidden="true"><span class="heat--0">migliore</span><span class="heat--1">≤ 0,3 s</span><span class="heat--2">≤ 1 s</span><span class="heat--3">≤ 2 s</span><span class="heat--4">oltre</span></p>
          <table class="stats-table">
            <thead><tr><th>Pista · auto</th><th v-for="b in AIR_BANDS" :key="b.id">{{ b.label }}</th></tr></thead>
            <tbody>
              <tr v-for="c in combos" :key="c.key"><td>{{ label(c) }}</td><td v-for="b in AIR_BANDS" :key="b.id" :class="heatClass(c.byAir[b.id], airBest(c))">{{ formatLapTime(c.byAir[b.id] ?? null) }}</td></tr>
              <tr v-if="!combos.length"><td :colspan="AIR_BANDS.length + 1" class="empty">{{ summary ? 'Nessun dato per questi filtri.' : 'Questi dati arrivano dal programma Racer Core sul PC del pilota.' }}</td></tr>
            </tbody>
          </table>
          <table v-if="gripColumns.length" class="stats-table">
            <thead><tr><th>Pista · auto</th><th v-for="g in gripColumns" :key="g">{{ g }}</th></tr></thead>
            <tbody>
              <tr v-for="c in combos" :key="c.key"><td>{{ label(c) }}</td><td v-for="g in gripColumns" :key="g" :class="heatClass(c.byGrip[g], gripBest(c))">{{ formatLapTime(c.byGrip[g] ?? null) }}</td></tr>
            </tbody>
          </table>
        </section>
      </div>
      </template>

      <p v-if="status === 'ready'" class="stats__note">
        <template v-if="computing">Aggiornamento di settori, temperature e grip…</template>
        <template v-else-if="summary">Settori, temperature e grip: {{ Object.keys(summary.counted).length }} sessioni analizzate su {{ accSessions.length }} sessioni ACC<template v-if="remaining">; altre {{ remaining }} si aggiungono domani</template><template v-else-if="Object.keys(summary.counted).length < accSessions.length"> (le altre non hanno giri validi)</template>.</template>
      </p>
    </div>
  </LayoutPageContainer>
</template>

<style scoped lang="scss">
.stats { color: #f5f5f5; display: flex; flex-direction: column; gap: 16px; }
.stats__head { display: flex; flex-wrap: wrap; align-items: flex-end; justify-content: space-between; gap: 12px; }
.stats__head h1 { margin: 0; font: italic 700 clamp(26px, 2.6vw, 40px)/1.1 'Racer Display', sans-serif; text-transform: uppercase; }
.stats__filters { display: flex; flex-wrap: wrap; gap: 10px; }
.stats__filters label { display: flex; flex-direction: column; gap: 3px; font: 400 11px/1.2 'Arial Narrow', 'Segoe UI', sans-serif; text-transform: uppercase; color: #cfcfcf; }
select { background: #0b0b0b; color: #f5f5f5; border: 1px solid #ffffff55; padding: 5px 8px; font-size: 13px; min-width: 130px; }
.stats__grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 16px; }
.stats-panel { border: 1px solid rgba(255, 255, 255, 0.3960784314); padding: 14px 16px; min-width: 0; overflow-x: auto; }
.stats-panel h2 { margin: 0 0 4px; font: italic 700 18px/1.2 'Racer Display', sans-serif; text-transform: uppercase; }
.stats__sub { margin: 0 0 10px; font-size: 12px; color: #bdbdbd; }
// La frase-sintesi: si legge prima di tutto il resto.
.insight { margin: 6px 0 10px; padding: 8px 12px; border-left: 3px solid #0076ff; background: linear-gradient(90deg, #0076ff1f, transparent 70%); font-size: 14px; line-height: 1.4; color: #f5f5f5; }
.stats__pair { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; font-size: 12px; color: #bdbdbd; }
// PIP-633: numeri grandi in testa.
.stats-kpis { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; margin: 0; }
.stats-kpis div { border: 1px solid rgba(255, 255, 255, 0.3960784314); border-left: 3px solid var(--kpi, #3b82f6); padding: 12px 16px; background: linear-gradient(90deg, color-mix(in srgb, var(--kpi, #3b82f6) 14%, transparent), transparent 60%); }
.stats-kpis div:nth-child(1) { --kpi: #0076ff; }
.stats-kpis div:nth-child(2) { --kpi: #00c2d6; }
.stats-kpis div:nth-child(3) { --kpi: #ffc400; }
.stats-kpis div:nth-child(4) { --kpi: #22c55e; }
.stats-kpis dt { font: 400 12px/1.2 'Arial Narrow', 'Segoe UI', sans-serif; text-transform: uppercase; color: #cfcfcf; }
.stats-kpis dd { margin: 4px 0 0; font: italic 700 clamp(24px, 2.2vw, 34px)/1.1 'Racer Display', sans-serif; font-variant-numeric: tabular-nums; }
// Ore per auto: barra con nome e ore sopra, dettagli sotto.
.car-bars { list-style: none; margin: 8px 0 14px; padding: 0; display: flex; flex-direction: column; gap: 12px; }
.car-bars__label { display: flex; justify-content: space-between; gap: 12px; font-size: 14px; }
.car-bars__label strong { font-variant-numeric: tabular-nums; }
.car-bars__track { height: 8px; background: #ffffff14; margin: 5px 0 4px; }
.car-bars__track span { display: block; height: 100%; border-radius: 4px; background: linear-gradient(90deg, var(--bar), color-mix(in srgb, var(--bar) 75%, #fff)); box-shadow: 0 0 10px color-mix(in srgb, var(--bar) 45%, transparent); }
.car-bars__track { border-radius: 4px; }
.car-bars small { font-size: 12px; color: #a8a8a8; }
.car-bars .empty { color: #9a9a9a; font-size: 13px; }
.stats__h3 { margin: 4px 0 8px; font: 400 12px/1.2 'Arial Narrow', 'Segoe UI', sans-serif; text-transform: uppercase; color: #cfcfcf; }
.weeks { display: flex; align-items: flex-end; gap: 4px; height: 84px; padding-bottom: 18px; border-bottom: 1px solid #ffffff30; }
.weeks__col { position: relative; flex: 1; height: 100%; display: flex; align-items: flex-end; }
.weeks__bar { display: block; width: 100%; min-height: 1px; border-radius: 3px 3px 0 0; background: linear-gradient(180deg, #4da3ff, #0076ff); }
.weeks__col small { position: absolute; top: calc(100% + 4px); left: 0; font-size: 10px; color: #a8a8a8; white-space: nowrap; }
// Barra del distacco nel confronto tra auto.
.gap-cell { position: relative; min-width: 110px; }
.gap-cell__bar { display: inline-block; vertical-align: middle; height: 6px; max-width: 60px; margin-right: 8px; background: currentColor; opacity: .7; }
// Margine del giro ideale: piu' tempo da guadagnare, colore piu' acceso.
.margin { padding: 1px 6px; font-variant-numeric: tabular-nums; }
.margin--big { background: #ef444433; color: #f87171; font-weight: 700; }
.margin--mid { background: #f9731626; color: #fb923c; }
.margin--small { color: #bdbdbd; }
// Distacco dal migliore della riga, dal verde al rosso.
.heat-legend { display: flex; flex-wrap: wrap; gap: 6px; margin: 0 0 8px; font-size: 11px; }
.heat-legend span { padding: 2px 8px; }
.heat--0 { background: #22c55e38; color: #4ade80; font-weight: 700; }
.heat--1 { background: #84cc1626; color: #a3e635; }
.heat--2 { background: #facc1526; color: #fde047; }
.heat--3 { background: #f9731630; color: #fb923c; }
.heat--4 { background: #ef444433; color: #f87171; }
.stats-table { width: 100%; border-collapse: collapse; font-size: 13px; font-variant-numeric: tabular-nums; margin-bottom: 10px; }
.stats-table th { text-align: left; font: 400 11px/1.2 'Arial Narrow', 'Segoe UI', sans-serif; text-transform: uppercase; color: #cfcfcf; padding: 4px 6px; border-bottom: 1px solid #ffffff40; white-space: nowrap; }
.stats-table td { padding: 5px 6px; border-bottom: 1px solid #ffffff14; white-space: nowrap; }
.stats-table td:first-child { white-space: normal; }
.stats-table .empty { color: #9a9a9a; text-align: center; white-space: normal; }
.worse { color: #f87171; }
.better { color: #4ade80; }
.stats__note { margin: 0; font-size: 12px; color: #bdbdbd; }
.stats__note button { background: none; border: 1px solid #ffffff55; color: inherit; padding: 2px 8px; cursor: pointer; }
@media (max-width: 1100px) { .stats__grid { grid-template-columns: 1fr; } .stats-kpis { grid-template-columns: repeat(2, minmax(0, 1fr)); } }
</style>
