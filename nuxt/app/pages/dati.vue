<script setup lang="ts">
import { vRcSwitch } from '~/directives/rcSwitch'
import { computed, ref, onMounted, onBeforeUnmount, watch } from 'vue'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import { useTelemetryGateway } from '~/composables/useTelemetryGateway'
import { useSessionLoader } from '~/composables/useSessionLoader'
import { mergeSessionsDeterministic } from '~/services/telemetry/telemetryMergeService'
import { sessionGame } from '~/services/telemetry/gameIdentity'
import { sessionDataReferences, stintDataFacts, lapStatus } from '~/services/session-detail/sessionDataPresentation'
import { formatLapTime, formatTrackName, formatCarName, getSessionTypeLabel } from '~/utils/telemetryFormat'
import { deltaSeconds, recordedWheels } from '~/utils/datiWheels'
import type { FullSession, SectorTelemetry, SessionDocument } from '~/types/telemetry'
import { useI18n } from '~/i18n'

definePageMeta({ layout: 'dashboard' })
const { t, intlLocale } = useI18n()
const gateway = useTelemetryGateway('acc')
const loader = useSessionLoader()
const { profileUser, cloudSessionReady } = useFirebaseAuth()
const sessions = ref<SessionDocument[]>([])
const sessionId = ref(''), stintNumber = ref(0), lapNumber = ref(0)
const full = ref<FullSession | null>(null)
const busy = ref(false), error = ref(''), updatedAt = ref('')
let revision = 0, timer: ReturnType<typeof setInterval> | undefined
let refreshing = false
type Selection = { sessionId?: string; latestId?: string; stint?: number; lap?: number }
const storageKey = () => `rc:dati:${profileUser.value?.uid ?? ''}`
// PIP-616/663: two views, the recorded laps ('giro') and the car live while driving ('box'; stored keys unchanged).
type DataTab = 'giro' | 'box'
const TAB_KEY = 'rc:dati:tab'
function rememberedTab(): DataTab {
  try { return localStorage.getItem(TAB_KEY) === 'box' ? 'box' : 'giro' } catch { return 'giro' }
}
const tab = ref<DataTab>('giro')
function selectTab(value: DataTab) {
  tab.value = value
  try { localStorage.setItem(TAB_KEY, value) } catch { /* Storage can be disabled. */ }
}
function remembered(): Selection {
  try { return JSON.parse(localStorage.getItem(storageKey()) || '{}') } catch { return {} }
}
const latest = computed(() => sessions.value[0])
const stints = computed(() => full.value?.stints ?? [])
const stint = computed(() => stints.value.find(s => s.stint_number === stintNumber.value))
const laps = computed(() => stint.value?.laps ?? [])
const lap = computed(() => laps.value.find(l => l.lap_number === lapNumber.value))
const references = computed(() => sessionDataReferences(full.value))
const facts = computed(() => stintDataFacts(stint.value))
const bestLap = computed(() => references.value.best)
// Sim racing colours: fuchsia = best of the session, green = best of this stint, white = valid.
type LapLike = { lap_time_ms?: number, is_valid?: boolean, has_pit_stop?: boolean, pit_out_lap?: boolean }
const clean = (l?: LapLike): l is LapLike => !!l && !!l.is_valid && !l.has_pit_stop && !l.pit_out_lap && Number(l.lap_time_ms) > 0
const stintBest = computed(() => {
  const times = laps.value.filter(clean).map(l => l.lap_time_ms)
  return times.length ? Math.min(...times) : null
})
function isBestLap(l?: LapLike) { return clean(l) && !!bestLap.value && l.lap_time_ms === bestLap.value }
function isStintBest(l?: LapLike) { return clean(l) && !isBestLap(l) && l.lap_time_ms === stintBest.value }
const isLatest = computed(() => sessionId.value === latest.value?.sessionId)
// PIP-613/663: laps recorded before the per-lap summary (`lap.telemetry`) show "--" where the values would be.
const tel = computed(() => lap.value?.telemetry)
const wheels = computed(() => recordedWheels(tel.value))
// The lap and its sectors, each with its gap to the best of the session.
const lapColumns = computed(() => [
  { title: t('data.lap'), short: t('data.lap'), time: lap.value?.lap_time_ms ?? null, data: tel.value?.lap, lap: true, best: isBestLap(lap.value), stintBest: isStintBest(lap.value), unreliable: false,
    delta: isBestLap(lap.value) ? '' : deltaSeconds(lap.value?.lap_time_ms, bestLap.value) },
  // A sector counts as best only on a valid lap with reliable sectors (not the pit-out lap).
  ...sectors.value.map((time, i) => {
    const reliable = time !== null && sectorsReliable.value
    const best = reliable && !!lap.value?.is_valid && time === bestSectors.value[i]
    return { title: t('telemetry.sector', { n: i + 1 }), short: `S${i + 1}`, time, data: tel.value?.sectors?.[i], lap: false, best, stintBest: false, unreliable: time !== null && !sectorsReliable.value,
      delta: reliable && !best ? deltaSeconds(time, bestSectors.value[i]) : '' }
  }),
])
const sectorsReliable = computed(() => lap.value?.sectors_reliable !== false)
const lapRows = computed<{ label: string, hint: string, value: (data?: SectorTelemetry) => string }[]>(() => [
  { label: t('data.rows.top'), hint: t('data.rows.topHint'), value: d => kmh(d?.top_kmh) },
  { label: t('data.rows.avg'), hint: t('data.rows.avgHint'), value: d => kmh(d?.avg_kmh) },
  { label: t('data.rows.tc'), hint: t('data.rows.tcHint'), value: d => count(d?.tc) },
  { label: t('data.rows.abs'), hint: t('data.rows.absHint'), value: d => count(d?.abs) },
])
const assists = computed(() => {
  const a = tel.value?.assists
  return a ? `TC ${count(a.tc)} · TC2 ${count(a.tc2)} · ABS ${count(a.abs)}` : '--'
})
// ACC's compound string is "dry_compound"/"wet_compound": the wet flag says the same, readably.
const tyreType = computed(() => tel.value?.tyre ? (tel.value.tyre.wet ? t('data.wet') : t('data.dry')) : '--')
const brakeType = computed(() => {
  const b = tel.value?.brakes
  if (!b?.front_pad) return '--'
  return b.rear_pad && b.rear_pad !== b.front_pad ? `${b.front_pad} / ${b.rear_pad}` : b.front_pad
})
const sectors = computed(() => [0, 1, 2].map(i => lap.value?.sector_times_ms?.[i] ?? null))
// Best sectors of the session (valid laps with reliable sectors), in the best-of-session purple.
const bestSectors = computed(() => [0, 1, 2].map(i => {
  const values = stints.value.flatMap(s => s.laps).filter(l => l.is_valid && l.sectors_reliable).map(l => l.sector_times_ms?.[i]).filter((v): v is number => typeof v === 'number' && v > 0)
  return values.length ? Math.min(...values) : null
}))
// km/h in the row hint: the narrow columns keep only the number.
const kmh = (value?: number | null) => typeof value === 'number' ? value.toFixed(1) : '--'
const count = (value?: number | null) => typeof value === 'number' ? String(value) : '--'
// ↑ ↓ (buttons or keys) move to the previous or next lap of the stint.
function stepLap(direction: -1 | 1) {
  const index = laps.value.findIndex(l => l.lap_number === lapNumber.value)
  const next = laps.value[index + direction]
  if (next) lapNumber.value = next.lap_number
}
function onKey(event: KeyboardEvent) {
  if (tab.value !== 'giro' || (event.key !== 'ArrowUp' && event.key !== 'ArrowDown')) return
  if ((event.target as HTMLElement | null)?.closest?.('select, input, textarea')) return
  event.preventDefault()
  stepLap(event.key === 'ArrowUp' ? -1 : 1)
}
const startAir = computed(() => recordedTemp(full.value?.session_info?.start_air_temp))
const startTrack = computed(() => recordedTemp(full.value?.session_info?.start_road_temp))
function recordedTemp(value: unknown) { return typeof value === 'number' && Number.isFinite(value) ? value : null }
/** Change from the start of the session to the selected lap. */
function delta(start: number | null, now: unknown) {
  const value = recordedTemp(now)
  return start === null || value === null ? null : value - start
}
const signed = (value: number | null) => value === null ? '--' : `${value >= 0 ? '+' : ''}${value.toFixed(2)}°`
function saveSelection() {
  if (!profileUser.value || !sessionId.value) return
  try { localStorage.setItem(storageKey(), JSON.stringify({ sessionId: sessionId.value, latestId: latest.value?.sessionId, stint: stintNumber.value, lap: lapNumber.value })) } catch { /* Storage can be disabled. */ }
}
function reconcileSelection(saved?: Selection) {
  if (!stints.value.some(s => s.stint_number === stintNumber.value)) stintNumber.value = saved?.stint && stints.value.some(s => s.stint_number === saved.stint) ? saved.stint : stints.value.at(-1)?.stint_number ?? 0
  if (!laps.value.some(l => l.lap_number === lapNumber.value)) lapNumber.value = saved?.lap && laps.value.some(l => l.lap_number === saved.lap) ? saved.lap : laps.value.at(-1)?.lap_number ?? 0
}
async function selectSession(id: string, restore = false) {
  const request = ++revision, uid = profileUser.value?.uid
  sessionId.value = id; full.value = null; stintNumber.value = 0; lapNumber.value = 0
  error.value = ''; busy.value = true
  try {
    const result = await gateway.getSessionDetail(id, uid, { warmupSessions: false })
    if (request !== revision || uid !== profileUser.value?.uid) return
    full.value = result
    if (!result) error.value = t('data.errors.detail')
    reconcileSelection(restore ? remembered() : undefined); saveSelection()
    updatedAt.value = new Date().toLocaleTimeString(intlLocale.value)
  } catch { if (request === revision) error.value = t('data.errors.session') }
  finally { if (request === revision) busy.value = false }
}
function sorted(values: SessionDocument[]) {
  return values.filter(s => sessionGame(s) === 'acc').sort((a, b) => b.meta.date_start.localeCompare(a.meta.date_start))
}
async function load() {
  const request = ++revision, uid = profileUser.value?.uid
  full.value = null; sessions.value = []; sessionId.value = ''; error.value = ''
  if (!uid) { busy.value = false; return }
  busy.value = true
  try {
    const values = await gateway.loadSessions(uid, true, { sourceMode: 'local_first', context: 'dati' })
    if (request !== revision || uid !== profileUser.value?.uid) return
    sessions.value = sorted(values)
    const saved = remembered()
    // A newly driven session wins over an old historical selection.
    const id = saved.latestId === latest.value?.sessionId && sessions.value.some(s => s.sessionId === saved.sessionId) ? saved.sessionId! : latest.value?.sessionId
    if (id) await selectSession(id, id === saved.sessionId)
    else busy.value = false
    if (gateway.error.value) error.value = gateway.error.value
  } catch { if (request === revision) { error.value = t('sessions.loadError'); busy.value = false } }
}
async function refreshLocal() {
  if (refreshing || busy.value || !profileUser.value) return
  refreshing = true
  const request = revision, uid = profileUser.value.uid
  try {
    const local = await loader.loadFromLocalFiles(uid)
    if (request !== revision || uid !== profileUser.value?.uid) return
    const previousLatest = latest.value?.sessionId
    sessions.value = sorted(mergeSessionsDeterministic(local, sessions.value, { localWins: true, includeSyncedLocal: true }))
    if (latest.value && previousLatest !== latest.value.sessionId) { await selectSession(latest.value.sessionId); return }
    // Poll only the selected local file; historical cloud data is immutable here.
    if (local.some(s => s.sessionId === sessionId.value)) {
      // Watching the last lap: a new lap takes over, so the page follows the drive.
      const onLast = lapNumber.value === laps.value.at(-1)?.lap_number && stintNumber.value === stints.value.at(-1)?.stint_number
      const watched = { stint: stintNumber.value, lap: lapNumber.value }
      const result = await gateway.getSessionDetail(sessionId.value, uid, { warmupSessions: false })
      if (request !== revision || uid !== profileUser.value?.uid) return
      full.value = result
      // Only if the pilot did not pick another lap while the file was loading.
      if (onLast && stintNumber.value === watched.stint && lapNumber.value === watched.lap) { stintNumber.value = stints.value.at(-1)?.stint_number ?? 0; lapNumber.value = stints.value.at(-1)?.laps.at(-1)?.lap_number ?? 0 }
      reconcileSelection(); saveSelection()
      updatedAt.value = new Date().toLocaleTimeString(intlLocale.value)
    }
  } catch { if (request === revision) error.value = t('data.errors.refresh') }
  finally { refreshing = false }
}
watch(stintNumber, () => { reconcileSelection(); saveSelection() })
watch(lapNumber, saveSelection)
watch(() => profileUser.value?.uid, () => { void load() })
watch(cloudSessionReady, () => { void load() })
onMounted(() => { tab.value = rememberedTab(); void load(); timer = setInterval(() => { void refreshLocal() }, 10000); window.addEventListener('keydown', onKey) })
onBeforeUnmount(() => { revision++; clearInterval(timer); window.removeEventListener('keydown', onKey) })
const time = (value: number | null | undefined) => value && value > 0 ? formatLapTime(value) : '--'
const number = (value: number | null | undefined, digits = 1) => typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : '--'
// Damage is the repair time in the pit (ms), as the ACC menu shows it.
const repair = (value: number | null | undefined) => typeof value !== 'number' ? '--' : value > 0 ? formatLapTime(value) : t('data.none')
const repairTotal = computed(() => {
  const d = tel.value?.damage
  return typeof d?.body === 'number' && typeof d?.suspension === 'number' ? d.body + d.suspension : null
})
</script>


<template>
  <LayoutPageContainer class="data-page">
    <div v-rc-switch class="data-tabs rc-switch" role="tablist" :aria-label="t('data.viewAria')">
      <button type="button" role="tab" :aria-selected="tab === 'giro'" :class="{ active: tab === 'giro' }" :title="t('data.tabLapsTitle')" @click="selectTab('giro')">{{ t('data.tabLaps') }}</button>
      <button type="button" role="tab" :aria-selected="tab === 'box'" :class="{ active: tab === 'box' }" :title="t('data.tabLiveTitle')" @click="selectTab('box')">{{ t('data.tabLive') }}</button>
    </div>
    <DatiBoxPanel v-if="tab === 'box'" />
    <template v-else>
    <!-- One bar: session, latest, stint, refresh; the context line under it. -->
    <div class="data-bar">
      <select class="data-session" :value="sessionId" :disabled="busy || !sessions.length" :aria-label="t('data.session')" @change="selectSession(($event.target as HTMLSelectElement).value)">
        <option v-if="!sessions.length" value="">{{ t('tracks.noSession') }}</option>
        <option v-for="s in sessions" :key="s.sessionId" :value="s.sessionId">{{ new Date(s.meta.date_start).toLocaleString(intlLocale, { dateStyle: 'short', timeStyle: 'short' }) }} · {{ formatTrackName(s.meta.track) }} · {{ formatCarName(s.meta.car) }} · {{ getSessionTypeLabel(s.meta.session_type) }}</option>
      </select>
      <select v-model.number="stintNumber" class="data-stint" :disabled="busy || !stints.length" aria-label="Stint">
        <option v-for="s in stints" :key="s.stint_number" :value="s.stint_number">Stint {{ s.stint_number }} · {{ s.laps.length }} {{ t('sessions.list.lapsUnit') }}</option>
      </select>
      <button type="button" class="rc-btn" :disabled="!latest || busy || isLatest" @click="latest && selectSession(latest.sessionId)">{{ t('overview.lastSession') }}</button>
      <button type="button" class="data-refresh" :disabled="busy" :aria-label="t('data.refresh')" :title="t('data.refresh')" @click="load">↻</button>
    </div>
    <p class="data-meta">{{ isLatest ? t('data.latest') : t('data.historic') }}<template v-if="updatedAt"> · {{ t('data.updated', { time: updatedAt }) }}</template></p>
    <p v-if="error" class="data-error" role="alert">{{ error }}</p>
    <p v-if="busy && !full" role="status" class="data-empty">{{ t('common.loadingData') }}</p>
    <p v-else-if="!sessions.length" class="data-empty">{{ t('data.empty') }}</p>

    <div v-else class="tele" :aria-busy="busy">
      <!-- Laps of the stint -->
      <aside class="tele-laps">
        <div class="tele-laps-head">
          <h2>{{ t('stats.trend.laps') }}</h2>
          <span class="tele-steps">
            <button type="button" :aria-label="t('data.prevLap')" :title="`${t('data.prevLap')} (↑)`" :disabled="!laps.length || lapNumber === laps[0]?.lap_number" @click="stepLap(-1)">↑</button>
            <button type="button" :aria-label="t('data.nextLap')" :title="`${t('data.nextLap')} (↓)`" :disabled="!laps.length || lapNumber === laps.at(-1)?.lap_number" @click="stepLap(1)">↓</button>
          </span>
        </div>
        <div class="tele-lap-list">
          <button v-for="l in laps" :key="l.lap_number" type="button" class="tele-lap"
            :class="{ selected: l.lap_number === lapNumber, invalid: l.is_valid === false, best: isBestLap(l), 'stint-best': isStintBest(l) }"
            :aria-pressed="l.lap_number === lapNumber" :title="lapStatus(l)" @click="lapNumber = l.lap_number">
            <span>{{ l.lap_number }}</span><strong>{{ time(l.lap_time_ms) }}</strong>
          </button>
        </div>
        <p v-if="!laps.length" class="tele-note">{{ t('data.noLaps') }}</p>
      </aside>

      <div class="tele-main">
        <!-- The lap and its sectors, each with the gap to the best of the session. -->
        <section class="lap-head" :aria-label="t('data.lapAria')">
          <div v-for="col in lapColumns" :key="col.title" class="lap-split" :class="{ 'lap-split--lap': col.lap, best: col.best, 'stint-best': col.stintBest, invalid: col.lap && lap?.is_valid === false, unreliable: col.unreliable }"
            :title="col.unreliable ? t('data.unreliable') : col.lap && lap ? lapStatus(lap) : undefined">
            <span class="lap-split-title">{{ col.lap ? t('sessionDetail.chart.lap', { lap: lap?.lap_number ?? '' }) : col.title }}</span>
            <strong>{{ time(col.time) }}<small v-if="col.unreliable"> *</small></strong>
            <em v-if="col.best">{{ t('data.sessionBest') }}</em><em v-else-if="col.delta">{{ col.delta }}</em>
          </div>
        </section>

        <div class="tele-body">
          <section class="tele-block">
            <h2 class="tele-section">{{ t('data.wheels') }} <small>{{ t('data.wheelsHint') }}</small></h2>
            <DatiWheelBoard :wheels="wheels" />
          </section>
          <div class="tele-side">
            <section class="tele-block">
              <h2 class="tele-section">{{ t('data.speedAids') }} <small>{{ t('data.speedAidsHint') }}</small></h2>
              <div class="tele-table" role="table" :aria-label="t('data.speedAidsAria')">
                <!-- Rows are display: contents (the grid keeps its columns); they give readers the table's rows. -->
                <div class="tele-tr" role="row">
                  <span class="tele-th" role="columnheader" />
                  <span v-for="col in lapColumns" :key="col.title" class="tele-th" role="columnheader">{{ col.short }}</span>
                </div>
                <div v-for="row in lapRows" :key="row.label" class="tele-tr" role="row">
                  <span class="tele-rh" role="rowheader" :title="row.hint">{{ row.label }}</span>
                  <span v-for="col in lapColumns" :key="`${row.label}-${col.title}`" class="tele-td" role="cell">{{ row.value(col.data) }}</span>
                </div>
              </div>
            </section>
            <section class="tele-block">
              <h2 class="tele-section">{{ t('data.setup') }}</h2>
              <dl class="tele-facts">
                <div><dt>{{ t('data.tyres') }}</dt><dd>{{ tyreType }} · set {{ count(tel?.tyre?.set) }}</dd></div>
                <div><dt>{{ t('data.pads') }}</dt><dd>{{ brakeType }}</dd></div>
                <div :title="t('data.aidsHint')"><dt>{{ t('data.aids') }}</dt><dd>{{ assists }}</dd></div>
                <div :title="t('data.damageHint')"><dt>{{ t('data.damage') }}</dt><dd>{{ repair(repairTotal) }}<small v-if="(tel?.damage?.body ?? 0) > 0 || (tel?.damage?.suspension ?? 0) > 0"> ({{ t('data.body') }} {{ repair(tel?.damage?.body) }} · {{ t('data.suspension') }} {{ repair(tel?.damage?.suspension) }})</small></dd></div>
              </dl>
            </section>
          </div>
        </div>

        <!-- Session, stint and conditions in one strip. -->
        <section class="tele-strip" :aria-label="t('data.stripAria')">
          <div><span>{{ t('sessions.common.best') }}</span><strong class="best-lap">{{ time(references.best) }}</strong></div>
          <div :title="t('data.optimalHint')"><span>{{ t('data.optimal') }}</span><strong>{{ time(references.optimal) }}</strong></div>
          <div><span>{{ t('sessions.common.average') }}</span><strong>{{ time(references.average) }}</strong></div>
          <div :title="t('data.stintHint')"><span>Stint</span><strong>{{ time(facts.duration) }}</strong></div>
          <div :title="t('data.fuelHint')"><span>{{ t('data.fuel') }}</span><strong>{{ number(facts.consumed, 2) }} L <small>· {{ number(facts.perLap, 2) }} {{ t('data.perLap') }}</small></strong></div>
          <div :title="t('data.airHint')"><span>{{ t('sessionDetail.conditions.air') }}</span><strong>{{ number(startAir, 1) }}° <small :class="{ warm: (delta(startAir, lap?.air_temp) ?? 0) > 0 }">{{ signed(delta(startAir, lap?.air_temp)) }}</small></strong></div>
          <div :title="t('data.trackHint')"><span>{{ t('sessionDetail.conditions.track') }}</span><strong>{{ number(startTrack, 1) }}° <small :class="{ warm: (delta(startTrack, lap?.road_temp) ?? 0) > 0 }">{{ signed(delta(startTrack, lap?.road_temp)) }}</small></strong></div>
        </section>
        <p v-if="lapColumns.some(c => c.unreliable)" class="tele-note">* {{ t('data.unreliableNote') }}</p>
        <p v-if="lap && !tel" class="tele-note">-- = {{ t('data.oldLapNote') }}</p>
      </div>
    </div>
    </template>
  </LayoutPageContainer>
</template>

<style scoped lang="scss">
// PIP-663: Racer Core reading order: the lap first (time and gaps), then the car wheel by wheel,
// then speed/aids and the session strip. Dark cells, thin borders, tabular numbers.
@use '@/assets/scss/racing-settings' as controls;
$line: #ffffff24;
$cell: #ffffff08;
$best: #e14bff;
$stint-best: #3ddc5a;
$invalid: #ff5a6e;
.data-page { @include controls.tokens; }
h2, h3 { margin: 0; font-family: 'Racer Display', 'Arial Narrow', sans-serif; font-style: italic; font-weight: 700; text-transform: uppercase; }
// I bottoni d'azione usano il comune .rc-btn: il vecchio stile resta solo ai controlli a icona.
// :where() tiene l'esclusione degli switcher a specificita' zero: i controlli compatti (.tele-steps, .tele-lap) devono continuare a vincere come prima.
button:not(.rc-btn):where(:not(.rc-switch button)) { @include controls.action; }
select { @include controls.select; }

.data-tabs { margin-bottom: 12px; }
.data-bar { display: flex; gap: 10px; align-items: center; }
.data-session { flex: 1; min-width: 0; }
.data-stint { flex: 0 0 170px; }
.data-refresh { min-width: 44px; font-size: 18px; }
.data-meta { margin: 8px 0 14px; color: #8a8a90; font-size: 11px; }
.data-error { color: #ff899a; font-size: 12px; }
.data-empty { padding: 40px 0; color: #aaa; }

.tele { display: grid; grid-template-columns: 150px minmax(0, 1fr); gap: 12px; > * { min-width: 0; } }
.tele-laps { display: flex; flex-direction: column; min-height: 0; border: 1px solid $line; background: $cell; padding: 10px 0;
  h2 { font-size: 14px; } }
.tele-lap-list { flex: 1; overflow: auto; max-height: 620px; }
.tele-lap { display: flex; align-items: baseline; gap: 10px; width: 100%; padding: 5px 12px; border: 0; background: none; clip-path: none; color: #e6e6ea; text-align: left; font-variant-numeric: tabular-nums; cursor: pointer;
  &::after { display: none; }
  span { width: 18px; color: #8a8a90; font-size: 12px; text-align: right; }
  strong { font: 600 14px/1.3 'Inter', sans-serif; }
  &:hover { background: #ffffff0d; }
  &.invalid strong { color: $invalid; }
  &.best strong { color: $best; }
  &.stint-best strong { color: $stint-best; }
  &.selected { box-shadow: inset 3px 0 var(--racing-race); background: #ff002426; strong { color: #fff; } }
  &.best.selected strong { color: $best; }
  &.stint-best.selected strong { color: $stint-best; }
  &.invalid.selected strong { color: $invalid; } }
.tele-laps-head { display: flex; align-items: center; justify-content: space-between; padding: 0 8px 8px 12px; }
.tele-steps { display: flex; gap: 4px;
  button { min-width: 26px; min-height: 26px; padding: 0; clip-path: none; font-size: 13px; } }
.tele-note { margin: 8px 0 0; padding: 0 12px; color: #77777d; font-size: 11px; }
.tele-main .tele-note { padding: 0; margin: 0; }
[title] { cursor: help; }

.tele-main { display: grid; gap: 12px; min-width: 0; align-content: start; }
// Lap head: the lap wide on the left, the three sectors after it, each with its gap.
.lap-head { display: grid; grid-template-columns: 1.4fr repeat(3, minmax(0, 1fr)); border: 1px solid $line; background: $cell; }
.lap-split { display: grid; gap: 2px; align-content: center; padding: 10px 14px; border-left: 1px solid $line; font-variant-numeric: tabular-nums;
  &:first-child { border-left: 0; }
  strong { font: 600 20px/1.2 'Inter', sans-serif; color: #f2f2f5; }
  em { color: #b3b3b8; font-size: 12px; font-style: normal; }
  &.best strong, &.best em { color: $best; }
  &.stint-best strong { color: $stint-best; }
  &.invalid strong { color: $invalid; }
  &.unreliable strong { color: #8a8a90; font-style: italic; } }
.lap-split--lap { box-shadow: inset 0 3px var(--racing-race); strong { font: italic 700 28px/1.1 'Racer Display', sans-serif; } }
.lap-split-title { color: #b3b3b8; font-size: 11px; font-weight: 700; letter-spacing: .06em; text-transform: uppercase; }

.tele-body { display: grid; grid-template-columns: minmax(0, 1.6fr) minmax(280px, 1fr); gap: 12px; align-items: start; }
.tele-side { display: grid; gap: 12px; }
.tele-block { display: grid; gap: 8px; }
.tele-section { display: flex; align-items: baseline; gap: 10px; color: #b3b3b8; font: 700 11px 'Inter', sans-serif; letter-spacing: .08em;
  small { color: #77777d; font-weight: 500; letter-spacing: 0; text-transform: none; } }
.tele-tr { display: contents; }
.tele-table { display: grid; grid-template-columns: auto repeat(4, minmax(0, 1fr)); column-gap: 8px; row-gap: 2px; border: 1px solid $line; background: $cell; padding: 8px 4px; font-variant-numeric: tabular-nums;
  .tele-tr > span { padding: 2px 6px; font-size: 13px; }
  .tele-th { color: #8a8a90; font-size: 11px; font-weight: 700; text-align: right; text-transform: uppercase; }
  .tele-rh { color: #b3b3b8; font-weight: 600; }
  .tele-td { color: #e6e6ea; font-weight: 600; text-align: right; } }
.tele-facts { display: grid; gap: 6px; margin: 0; padding: 10px 12px; border: 1px solid $line; background: $cell;
  > div { display: grid; grid-template-columns: 82px minmax(0, 1fr); gap: 8px; font-size: 13px; }
  dt { color: #b3b3b8; font-weight: 700; }
  dd { margin: 0; color: #e6e6ea; font-weight: 600; small { color: #8a8a90; font-weight: 500; } } }
// Session strip: seven short facts in one line, wrapping on narrow windows.
.tele-strip { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); border: 1px solid $line; background: $cell;
  > div { display: grid; gap: 3px; padding: 8px 12px; border-left: 1px solid $line; &:first-child { border-left: 0; } }
  span { color: #b3b3b8; font-size: 11px; font-weight: 700; letter-spacing: .04em; text-transform: uppercase; }
  strong { font: 600 14px/1.25 'Inter', sans-serif; color: #e6e6ea; font-variant-numeric: tabular-nums; small { color: #8a8a90; font-weight: 500; } }
  .best-lap { color: $best; }
  .warm { color: $invalid; } }

@media (max-width: 1250px) {
  .tele-body { grid-template-columns: 1fr; }
  .tele-strip { grid-template-columns: repeat(4, minmax(0, 1fr)); > div:nth-child(5) { border-left: 0; } > div:nth-child(n+5) { border-top: 1px solid $line; } }
}
@media (max-width: 720px) {
  .tele { grid-template-columns: 1fr; }
  .tele-lap-list { display: flex; max-height: none; overflow-x: auto; }
  .tele-lap { flex: 0 0 auto; }
  .lap-head { grid-template-columns: repeat(3, minmax(0, 1fr)); .lap-split--lap { grid-column: 1 / -1; border-bottom: 1px solid $line; } .lap-split:nth-child(2) { border-left: 0; } }
  .lap-split { padding: 8px 10px; strong { font-size: 15px; } }
  .tele-strip { grid-template-columns: repeat(2, minmax(0, 1fr)); > div { border-left: 0; border-top: 1px solid $line; } > div:nth-child(even) { border-left: 1px solid $line; } > div:nth-child(-n+2) { border-top: 0; } }
  .data-bar { flex-wrap: wrap; .data-session { flex-basis: 100%; } }
}
</style>
