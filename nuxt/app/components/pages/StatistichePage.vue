<script setup lang="ts">
// PIP-619: Statistiche di attivita' (solo ACC). Lista sessioni gia' proiettata + un riepilogo
// calcolato sul PC; per il coach gli stessi dati del pilota (contesto esplicito dalla pagina pilota).
import { useTargetUserId, usePilotContext } from '~/composables/usePilotContext'
import { useHeaderBack } from '~/composables/useHeaderBack'
import { loadStatsSessions, loadStatsSummary, refreshOwnStats } from '~/repositories/statsRepository'
import {
  AIR_BANDS, GRIP_ORDER, compareCars, filterCombos, filterSessions, idealLapMs, timeByCar, timeByWeek,
  type StatsFilter, type StatsSummary,
} from '~/services/telemetry/activityStats'
import { normalizeSessionListKey } from '~/services/sync/sessionListProjectionService'
import { formatCarName, formatDriveTime, formatLapTime, formatTrackName } from '~/utils/telemetryFormat'
import type { SessionDocument } from '~/types/telemetry'

const emit = defineEmits<{ back: [] }>()
const targetUserId = useTargetUserId()
const pilotContext = usePilotContext()
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
const totalMs = computed(() => cars.value.reduce((sum, c) => sum + c.timeMs, 0))
const weeks = computed(() => timeByWeek(filtered.value, Math.min(26, Math.max(4, Math.ceil((periodDays.value || 182) / 7))), Date.now()))
const weekMax = computed(() => Math.max(1, ...weeks.value.map(w => w.timeMs)))

const carA = ref('')
const carB = ref('')
watch(cars, (list) => {
  const keys = list.map(c => c.carKey)
  if (!keys.includes(carA.value)) carA.value = keys[0] ?? ''
  if (!keys.includes(carB.value) || carB.value === carA.value) carB.value = keys.find(k => k !== carA.value) ?? ''
}, { immediate: true })
const comparison = computed(() => carA.value && carB.value ? compareCars(filtered.value, carA.value, carB.value) : [])

const combos = computed(() => filterCombos(summary.value, filter.value))
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
    const [list, stats] = await Promise.all([loadStatsSessions(uid), loadStatsSummary(uid)])
    sessions.value = list ?? []
    summary.value = stats
    status.value = 'ready'
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

      <div v-else class="stats__grid">
        <section class="stats-panel" aria-labelledby="stats-time">
          <h2 id="stats-time">Tempo in pista per auto</h2>
          <p class="stats__sub">{{ hours(totalMs) }} in {{ filtered.length }} sessioni</p>
          <svg class="weeks" :viewBox="`0 0 ${weeks.length * 12} 40`" preserveAspectRatio="none" role="img" aria-label="Ore per settimana">
            <rect v-for="(w, i) in weeks" :key="w.weekStart" :x="i * 12 + 1" :y="40 - (w.timeMs / weekMax) * 38" width="10" :height="(w.timeMs / weekMax) * 38" rx="1"><title>{{ w.weekStart }} · {{ hours(w.timeMs) }}</title></rect>
          </svg>
          <table class="stats-table">
            <thead><tr><th>Auto</th><th>Ore</th><th>Sessioni</th><th>Giri</th><th>Validi</th></tr></thead>
            <tbody>
              <tr v-for="c in cars" :key="c.carKey"><td>{{ formatCarName(c.car) }}</td><td>{{ hours(c.timeMs) }}</td><td>{{ c.sessions }}</td><td>{{ c.laps }}</td><td>{{ c.laps ? Math.round((c.lapsValid / c.laps) * 100) + '%' : '–' }}</td></tr>
              <tr v-if="!cars.length"><td colspan="5" class="empty">Nessuna sessione nel periodo.</td></tr>
            </tbody>
          </table>
        </section>

        <section class="stats-panel" aria-labelledby="stats-compare">
          <h2 id="stats-compare">Confronto tra due auto</h2>
          <div class="stats__pair">
            <select v-model="carA" aria-label="Prima auto"><option v-for="c in cars" :key="c.carKey" :value="c.carKey">{{ formatCarName(c.car) }}</option></select>
            <span>contro</span>
            <select v-model="carB" aria-label="Seconda auto"><option v-for="c in cars" :key="c.carKey" :value="c.carKey" :disabled="c.carKey === carA">{{ formatCarName(c.car) }}</option></select>
          </div>
          <table class="stats-table">
            <thead><tr><th>Pista</th><th>Prima</th><th>Seconda</th><th title="Tempo della seconda meno quello della prima: verde se la seconda e' piu' veloce">Seconda vs prima</th><th>Ore</th></tr></thead>
            <tbody>
              <tr v-for="r in comparison" :key="r.trackKey"><td>{{ formatTrackName(r.track) }}</td><td>{{ formatLapTime(r.bestA) }}</td><td>{{ formatLapTime(r.bestB) }}</td><td :class="{ worse: (r.gapMs ?? 0) > 0, better: (r.gapMs ?? 0) < 0 }">{{ gap(r.gapMs) }}</td><td>{{ hours(r.timeA) }} / {{ hours(r.timeB) }}</td></tr>
              <tr v-if="!comparison.length"><td colspan="5" class="empty">Servono due auto con sessioni nel periodo.</td></tr>
            </tbody>
          </table>
        </section>

        <section class="stats-panel" aria-labelledby="stats-sectors">
          <h2 id="stats-sectors">Settori migliori e giro ideale</h2>
          <p class="stats__sub">Su tutto lo storico: il giro ideale somma i tuoi tre settori migliori.</p>
          <table class="stats-table">
            <thead><tr><th>Pista · auto</th><th>S1</th><th>S2</th><th>S3</th><th>Ideale</th><th>Migliore</th><th>Margine</th></tr></thead>
            <tbody>
              <tr v-for="c in combos" :key="c.key">
                <td>{{ label(c) }}</td><td v-for="(s, i) in c.bestSectorsMs" :key="i">{{ sector(s) }}</td>
                <td>{{ formatLapTime(idealLapMs(c.bestSectorsMs)) }}</td><td>{{ formatLapTime(c.bestLapMs) }}</td>
                <td>{{ idealLapMs(c.bestSectorsMs) !== null && c.bestLapMs !== null ? gap((idealLapMs(c.bestSectorsMs) as number) - c.bestLapMs) : '–' }}</td>
              </tr>
              <tr v-if="!combos.length"><td colspan="7" class="empty">{{ summary ? 'Nessun dato per questi filtri.' : 'Questi dati arrivano dal programma Racer Core sul PC del pilota.' }}</td></tr>
            </tbody>
          </table>
        </section>

        <section class="stats-panel" aria-labelledby="stats-conditions">
          <h2 id="stats-conditions">Tempi per temperatura dell'aria e grip</h2>
          <p class="stats__sub">Miglior giro valido in ogni condizione, su tutto lo storico.</p>
          <table class="stats-table">
            <thead><tr><th>Pista · auto</th><th v-for="b in AIR_BANDS" :key="b.id">{{ b.label }}</th></tr></thead>
            <tbody>
              <tr v-for="c in combos" :key="c.key"><td>{{ label(c) }}</td><td v-for="b in AIR_BANDS" :key="b.id">{{ formatLapTime(c.byAir[b.id] ?? null) }}</td></tr>
              <tr v-if="!combos.length"><td :colspan="AIR_BANDS.length + 1" class="empty">{{ summary ? 'Nessun dato per questi filtri.' : 'Questi dati arrivano dal programma Racer Core sul PC del pilota.' }}</td></tr>
            </tbody>
          </table>
          <table v-if="gripColumns.length" class="stats-table">
            <thead><tr><th>Pista · auto</th><th v-for="g in gripColumns" :key="g">{{ g }}</th></tr></thead>
            <tbody>
              <tr v-for="c in combos" :key="c.key"><td>{{ label(c) }}</td><td v-for="g in gripColumns" :key="g">{{ formatLapTime(c.byGrip[g] ?? null) }}</td></tr>
            </tbody>
          </table>
        </section>
      </div>

      <p v-if="status === 'ready'" class="stats__note">
        <template v-if="computing">Aggiornamento di settori, temperature e grip…</template>
        <template v-else-if="summary">Settori, temperature e grip: {{ summary.counted.length }} sessioni analizzate su {{ accSessions.length }} sessioni ACC<template v-if="remaining">; altre {{ remaining }} si aggiungono domani</template><template v-else-if="summary.counted.length < accSessions.length"> (le altre non hanno giri validi)</template>.</template>
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
.stats__pair { display: flex; align-items: center; gap: 8px; margin-bottom: 10px; font-size: 12px; color: #bdbdbd; }
.weeks { width: 100%; height: 48px; margin-bottom: 10px; }
.weeks rect { fill: #e10600; }
.stats-table { width: 100%; border-collapse: collapse; font-size: 13px; font-variant-numeric: tabular-nums; margin-bottom: 10px; }
.stats-table th { text-align: left; font: 400 11px/1.2 'Arial Narrow', 'Segoe UI', sans-serif; text-transform: uppercase; color: #cfcfcf; padding: 4px 6px; border-bottom: 1px solid #ffffff40; white-space: nowrap; }
.stats-table td { padding: 5px 6px; border-bottom: 1px solid #ffffff14; white-space: nowrap; }
.stats-table td:first-child { white-space: normal; }
.stats-table .empty { color: #9a9a9a; text-align: center; white-space: normal; }
.worse { color: #ff5b52; }
.better { color: #3fd07a; }
.stats__note { margin: 0; font-size: 12px; color: #bdbdbd; }
.stats__note button { background: none; border: 1px solid #ffffff55; color: inherit; padding: 2px 8px; cursor: pointer; }
@media (max-width: 1100px) { .stats__grid { grid-template-columns: 1fr; } }
</style>
