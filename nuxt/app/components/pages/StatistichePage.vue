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
  airInsight, byIdealMargin, carInsight, compareInsight, gapBarPct, heatLevel, idealInsight, marginLevel, rowBest,
} from '~/utils/statsPresentation'
import { periodTotals, previousPeriodSessions } from '~/utils/statsJourney'
import type { SessionDocument } from '~/types/telemetry'
import { useI18n } from '~/i18n'

const emit = defineEmits<{ back: [] }>()
const targetUserId = useTargetUserId()
const pilotContext = usePilotContext()
const gateway = useTelemetryGateway('acc')
const { t } = useI18n()
useHeaderBack(() => emit('back'), () => t('stats.back'))

const sessions = shallowRef<SessionDocument[]>([])
const summary = shallowRef<StatsSummary | null>(null)
const status = ref<'loading' | 'ready' | 'error'>('loading')
const computing = ref(false)
const remaining = ref(0)

const PERIODS = computed(() => [
  { days: 7, label: t('stats.periods.d7') }, { days: 30, label: t('stats.periods.d30') }, { days: 90, label: t('stats.periods.m3') },
  { days: 365, label: t('stats.periods.m12') }, { days: 0, label: t('stats.periods.all') },
])
const TYPES = computed(() => [{ value: -1, label: t('stats.all') }, { value: 0, label: t('stats.types.practice') }, { value: 1, label: t('stats.types.qualify') }, { value: 2, label: t('stats.types.race') }])
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

// Un solo "adesso" per periodo, periodo precedente, settimane e calendario: si aggiorna a ogni lettura.
const nowMs = ref(Date.now())
const filtered = computed(() => filterSessions(sessions.value, filter.value, nowMs.value))
const cars = computed(() => timeByCar(filtered.value))
// PIP-633: barre per auto e per settimana con le etichette.
// Tendenze: lo stesso conteggio sul periodo precedente della stessa durata (con "Tutto" non c'e').
const current = computed(() => periodTotals(filtered.value))
const previous = computed(() => {
  const prev = previousPeriodSessions(sessions.value, filter.value, nowMs.value)
  return prev ? periodTotals(prev) : null
})
const periodLabel = computed(() => PERIODS.value.find(p => p.days === periodDays.value)?.label ?? '')
const carMax = computed(() => Math.max(1, ...cars.value.map(c => c.timeMs)))
const weeks = computed(() => timeByWeek(filtered.value, Math.min(26, Math.max(4, Math.ceil((periodDays.value || 182) / 7))), nowMs.value))
const weekMax = computed(() => Math.max(1, ...weeks.value.map(w => w.timeMs)))
// Un colore per auto, diverso dal giallo qualifica e dal rosso gara (che hanno gia' un significato).
const CAR_COLORS = ['#00c2d6', '#8b5cf6', '#ff7a1a', '#14b8a6', '#ec4899', '#84cc16']
const weekLabel = (iso: string) => `${iso.slice(8, 10)}/${iso.slice(5, 7)}`
// "1h50", "2h", "15m": corto, come sopra le colonne del grafico Attivita'.
const compactHours = (ms: number) => {
  const minutes = Math.round(ms / 60_000)
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60), m = minutes % 60
  return m ? `${h}h${String(m).padStart(2, '0')}` : `${h}h`
}

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
  nowMs.value = Date.now()
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
        <h1>{{ t('overview.activity.stats') }}</h1>
        <div class="stats__filters" role="group" :aria-label="t('stats.filters')">
          <label>{{ t('stats.period') }}<select v-model.number="periodDays"><option v-for="p in PERIODS" :key="p.days" :value="p.days">{{ p.label }}</option></select></label>
          <label>{{ t('sessions.list.track') }}<select v-model="trackKey"><option value="">{{ t('stats.all') }}</option><option v-for="tk in trackOptions" :key="tk.key" :value="tk.key">{{ tk.name }}</option></select></label>
          <label>{{ t('sessions.list.car') }}<select v-model="carKey"><option value="">{{ t('stats.all') }}</option><option v-for="c in carOptions" :key="c.key" :value="c.key">{{ c.name }}</option></select></label>
          <label>{{ t('sessions.list.type') }}<select v-model.number="sessionType"><option v-for="ty in TYPES" :key="ty.value" :value="ty.value">{{ ty.label }}</option></select></label>
        </div>
      </header>

      <p v-if="status === 'loading'" class="stats__note" role="status">{{ t('sessions.picker.loading') }}</p>
      <p v-else-if="status === 'error'" class="stats__note" role="status">{{ t('overview.dataUnavailable') }} <button type="button" @click="load">{{ t('common.retry') }}</button></p>

      <template v-else>
      <!-- PIP-633: prima "come sto andando" (tendenze, calendario, record, progressi), poi i dettagli. -->
      <StatsTrendCards :current="current" :previous="previous" :period-label="periodLabel" />
      <StatsDrivingCalendar :sessions="sessions" :now-ms="nowMs" />
      <StatsPersonalRecords :sessions="sessions" :now-ms="nowMs" />

      <div class="stats__grid">
        <StatsProgressChart :sessions="sessions" :now-ms="nowMs" />
        <section class="stats-panel" aria-labelledby="stats-time">
          <h2 id="stats-time">{{ t('stats.time.title') }}</h2>
          <p v-if="insights.cars" class="insight">{{ insights.cars }}</p>
          <ul class="car-bars">
            <li v-for="(c, i) in cars" :key="c.carKey">
              <div class="car-bars__label"><span>{{ formatCarName(c.car) }}</span><strong>{{ hours(c.timeMs) }}</strong></div>
              <div class="car-bars__track"><span :style="{ width: `${Math.max(2, (c.timeMs / carMax) * 100)}%`, '--bar': CAR_COLORS[i % CAR_COLORS.length] }" /></div>
              <small>{{ c.sessions }} {{ c.sessions === 1 ? t('stats.session') : t('stats.sessions') }} · {{ c.laps }} {{ c.laps === 1 ? t('sessions.list.lap') : t('sessions.list.lapsUnit') }} · {{ c.laps ? t('stats.time.validPct', { pct: Math.round((c.lapsValid / c.laps) * 100) }) : t('stats.time.noLaps') }}</small>
            </li>
            <li v-if="!cars.length" class="empty">{{ t('stats.time.empty') }}</li>
          </ul>
          <h3 class="stats__h3">{{ t('stats.time.weekly') }}</h3>
          <!-- Come il grafico Attivita' della Panoramica: valore sopra la colonna, settimane vuote come slot leggeri. -->
          <div class="weeks" role="img" :aria-label="t('stats.time.weeklyAria', { max: hours(weekMax) })">
            <div v-for="(w, i) in weeks" :key="w.weekStart" class="weeks__col" :class="{ 'weeks__col--empty': !w.timeMs }" :title="t('stats.time.weekTitle', { week: weekLabel(w.weekStart), time: hours(w.timeMs) })">
              <div class="weeks__slot">
                <span v-if="w.timeMs" class="weeks__bar" :style="{ height: `${Math.max(8, (w.timeMs / weekMax) * 100)}%` }"><em>{{ compactHours(w.timeMs) }}</em></span>
              </div>
              <small :class="{ 'weeks__date--hidden': weeks.length > 9 && i % 2 === 1 && i !== weeks.length - 1 }">{{ weekLabel(w.weekStart) }}</small>
            </div>
          </div>
        </section>

        <h2 class="stats__section">{{ t('stats.deeper') }}</h2>
        <section class="stats-panel" aria-labelledby="stats-compare">
          <h2 id="stats-compare">{{ t('stats.compare.title') }}</h2>
          <p v-if="cars.length > 1" class="insight">{{ insights.compare }}</p>
          <div class="stats__pair">
            <select v-model="carA" :aria-label="t('stats.compare.first')"><option v-for="c in cars" :key="c.carKey" :value="c.carKey">{{ formatCarName(c.car) }}</option></select>
            <span>{{ t('telemetry.versus') }}</span>
            <select v-model="carB" :aria-label="t('stats.compare.second')"><option v-for="c in cars" :key="c.carKey" :value="c.carKey" :disabled="c.carKey === carA">{{ formatCarName(c.car) }}</option></select>
          </div>
          <table class="stats-table">
            <thead><tr><th>{{ t('sessions.list.track') }}</th><th>{{ t('stats.compare.firstShort') }}</th><th>{{ t('stats.compare.secondShort') }}</th><th :title="t('stats.compare.gapTitle')">{{ t('stats.compare.gap') }}</th><th>{{ t('stats.compare.hours') }}</th></tr></thead>
            <tbody>
              <tr v-for="r in comparison" :key="r.trackKey">
                <td>{{ formatTrackName(r.track) }}</td><td>{{ formatLapTime(r.bestA) }}</td><td>{{ formatLapTime(r.bestB) }}</td>
                <td class="gap-cell" :class="{ worse: (r.gapMs ?? 0) > 0, better: (r.gapMs ?? 0) < 0 }">
                  <span class="gap-cell__bar" :style="{ width: `${gapBarPct(r.gapMs, gapMax)}%` }" />{{ gap(r.gapMs) }}
                </td>
                <td>{{ hours(r.timeA) }} / {{ hours(r.timeB) }}</td>
              </tr>
              <tr v-if="!comparison.length"><td colspan="5" class="empty">{{ t('stats.compare.empty') }}</td></tr>
            </tbody>
          </table>
        </section>

        <section class="stats-panel" aria-labelledby="stats-sectors">
          <h2 id="stats-sectors">{{ t('stats.ideal.title') }}</h2>
          <p v-if="insights.ideal" class="insight">{{ insights.ideal }}</p>
          <p class="stats__sub">{{ t('stats.ideal.sub') }}</p>
          <table class="stats-table">
            <thead><tr><th>{{ t('stats.trackCar') }}</th><th>S1</th><th>S2</th><th>S3</th><th>{{ t('stats.ideal.ideal') }}</th><th>{{ t('sessions.common.best') }}</th><th :title="t('stats.ideal.marginTitle')">{{ t('sessionDetail.target.margin') }}</th></tr></thead>
            <tbody>
              <tr v-for="c in idealRows" :key="c.key">
                <td>{{ label(c) }}</td><td v-for="(s, i) in c.bestSectorsMs" :key="i">{{ sector(s) }}</td>
                <td>{{ formatLapTime(c.idealMs) }}</td><td>{{ formatLapTime(c.bestLapMs) }}</td>
                <td><span v-if="c.marginMs !== null" class="margin" :class="`margin--${marginLevel(c.marginMs)}`">{{ gap(c.marginMs) }}</span><template v-else>–</template></td>
              </tr>
              <tr v-if="!combos.length"><td colspan="7" class="empty">{{ summary ? t('stats.noData') : t('stats.fromApp') }}</td></tr>
            </tbody>
          </table>
        </section>

        <section class="stats-panel stats-panel--wide" aria-labelledby="stats-conditions">
          <h2 id="stats-conditions">{{ t('stats.conditions.title') }}</h2>
          <p v-if="insights.air" class="insight">{{ insights.air }}</p>
          <p class="stats__sub">{{ t('stats.conditions.sub') }}</p>
          <p class="heat-legend" aria-hidden="true"><span class="heat--0">{{ t('stats.conditions.best') }}</span><span class="heat--1">{{ t('stats.conditions.le03') }}</span><span class="heat--2">≤ 1 s</span><span class="heat--3">≤ 2 s</span><span class="heat--4">{{ t('stats.conditions.beyond') }}</span></p>
          <table class="stats-table">
            <thead><tr><th>{{ t('stats.trackCar') }}</th><th v-for="b in AIR_BANDS" :key="b.id">{{ b.label }}</th></tr></thead>
            <tbody>
              <tr v-for="c in combos" :key="c.key"><td>{{ label(c) }}</td><td v-for="b in AIR_BANDS" :key="b.id" :class="heatClass(c.byAir[b.id], airBest(c))">{{ formatLapTime(c.byAir[b.id] ?? null) }}</td></tr>
              <tr v-if="!combos.length"><td :colspan="AIR_BANDS.length + 1" class="empty">{{ summary ? t('stats.noData') : t('stats.fromApp') }}</td></tr>
            </tbody>
          </table>
          <table v-if="gripColumns.length" class="stats-table">
            <thead><tr><th>{{ t('stats.trackCar') }}</th><th v-for="g in gripColumns" :key="g">{{ g }}</th></tr></thead>
            <tbody>
              <tr v-for="c in combos" :key="c.key"><td>{{ label(c) }}</td><td v-for="g in gripColumns" :key="g" :class="heatClass(c.byGrip[g], gripBest(c))">{{ formatLapTime(c.byGrip[g] ?? null) }}</td></tr>
            </tbody>
          </table>
        </section>
      </div>
      </template>

      <p v-if="status === 'ready'" class="stats__note">
        <template v-if="computing">{{ t('stats.footer.computing') }}</template>
        <template v-else-if="summary">{{ t('stats.footer.counted', { count: Object.keys(summary.counted).length, total: accSessions.length }) }}<template v-if="remaining">; {{ t('stats.footer.remaining', { count: remaining }) }}</template><template v-else-if="Object.keys(summary.counted).length < accSessions.length"> ({{ t('stats.footer.noValid') }})</template>.</template>
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
.weeks { display: flex; gap: 6px; height: 150px; }
.weeks__col { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 6px; }
// Lo slot e' la colonna intera, leggera: anche le settimane vuote restano al loro posto, senza trattini.
.weeks__slot { position: relative; flex: 1; display: flex; align-items: flex-end; padding-top: 18px; border-bottom: 1px solid #ffffff40;
  background: repeating-linear-gradient(to top, #ffffff0a 0 1px, transparent 1px 33.33%); }
.weeks__bar { position: relative; display: block; width: 100%; border-radius: 3px 3px 0 0; background: linear-gradient(180deg, #4da3ff, #0076ff); box-shadow: 0 0 10px #0076ff55; }
.weeks__bar em { position: absolute; bottom: calc(100% + 3px); left: 50%; transform: translateX(-50%); font: 600 11px/1 'Arial Narrow', 'Segoe UI', sans-serif; font-style: normal; color: #fff; white-space: nowrap; }
.weeks__col small { text-align: center; font-size: 10px; color: #a8a8a8; white-space: nowrap; }
.weeks__date--hidden { visibility: hidden; }
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
.stats__section { grid-column: 1 / -1; margin: 12px 0 0; font: italic 700 22px/1.2 'Racer Display', sans-serif; text-transform: uppercase; color: #cfcfcf; }
.stats-panel--wide { grid-column: 1 / -1; }
@media (max-width: 1100px) { .stats__grid { grid-template-columns: 1fr; } }
</style>
