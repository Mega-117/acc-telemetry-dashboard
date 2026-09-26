<script setup lang="ts">
// ============================================
// TrackDetailPage - Track detail with projection-first data
// ============================================

import { ref, computed, onMounted, watch, nextTick } from 'vue'
import RacingSessionList from '~/components/sessions/RacingSessionList.vue'
import PaginationControls from '~/components/ui/PaginationControls.vue'
import TrackTimesChart from '~/components/charts/TrackTimesChart.vue'
import {
  CAR_CATEGORIES,
  type CarCategory
} from '~/utils/telemetryFormat'
import { usePilotContext } from '~/composables/usePilotContext'
import { usePublicPath } from '~/composables/usePublicPath'
import { useHeaderBack } from '~/composables/useHeaderBack'
import { useTelemetryGateway } from '~/composables/useTelemetryGateway'
import { RACE_FUEL_BUCKETS } from '~/services/telemetry/raceFuelClassification'
import type { TrackDetailProjection, TrackFuelBucketReference } from '~/types/trackProjections'

const { getPublicPath } = usePublicPath()

const props = defineProps<{
  trackId: string
  fromSession?: string
}>()

const emit = defineEmits<{
  back: []
  'go-to-session': [sessionId: string, routePath: string]
}>()

const telemetryGateway = useTelemetryGateway()
const headerBack = useHeaderBack(() => emit('back'), () => props.fromSession ? 'Torna alla sessione' : 'Torna alle piste')
const targetUserId = usePilotContext()

function formatShortDate(isoDate: string | null): string {
  if (!isoDate) return ''
  const dateStr = isoDate.split('T')[0] ?? isoDate
  const [year = '0', month = '0', day = '0'] = dateStr.split('-')
  const months = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']
  return `${parseInt(day, 10)} ${months[parseInt(month, 10) - 1] ?? ''} ${year}`
}

const gripConditions = ['Optimum', 'Fast', 'Green', 'Greasy', 'Damp', 'Wet', 'Flood']
const RACE_FUEL_BUCKET_FILTERS = RACE_FUEL_BUCKETS
const selectedGrip = ref('Optimum')
const selectedCategory = ref<CarCategory>('GT3')
const selectedRaceReferenceBucket = ref('100+')
const trackProjection = ref<TrackDetailProjection | null>(null)
const isProjectionLoading = ref(false)

async function loadTrackProjection() {
  isProjectionLoading.value = true
  try {
    trackProjection.value = await telemetryGateway.getTrackDetailProjection(
      props.trackId,
      targetUserId.value || undefined,
      {
        category: selectedCategory.value,
        grip: selectedGrip.value
      }
    )
  } finally {
    isProjectionLoading.value = false
  }
}

onMounted(loadTrackProjection)

watch(
  () => [props.trackId, targetUserId.value, selectedCategory.value, selectedGrip.value],
  async () => {
    await loadTrackProjection()
  }
)

const emptyTrack = {
  id: props.trackId,
  name: props.trackId.toUpperCase(),
  fullName: props.trackId,
  country: '-',
  countryCode: '??',
  length: '-',
  turns: 0,
  image: '/tracks/track_default.png',
  sessions: 0,
  lastSession: '-',
  bestQualy: null,
  bestRace: null,
  bestAvgRace: null,
  bestQualyConditions: null,
  bestRaceConditions: null,
  bestAvgRaceConditions: null,
  bestQualySessionId: null,
  bestRaceSessionId: null,
  bestAvgRaceSessionId: null,
  bestQualyDate: null,
  bestRaceDate: null,
  bestAvgRaceDate: null,
  bestQualyFuel: null,
  bestRaceFuel: null,
  bestAvgRaceFuel: null,
  bestRaceFuelBucket: null,
  bestAvgRaceFuelBucket: null,
  bestRaceSampleCount: null,
  bestAvgRaceSampleCount: null,
  bestRaceConfidence: null,
  bestAvgRaceConfidence: null,
  raceFuelBuckets: [],
  hasGripData: false
}

const track = computed(() => trackProjection.value?.track || emptyTrack)
const recentSessions = computed(() => (trackProjection.value?.recentSessions || [])
  .filter(session => session.laps > 0)
  .slice()
  .sort((a, b) => {
    const timestamp = (session: typeof a) => Date.parse(session.dateStart || `${session.date}T${session.time || '00:00'}`) || 0
    return timestamp(b) - timestamp(a)
  }))
const activityStats = computed(() => trackProjection.value?.activity || {
  totalLaps: 0,
  validLaps: 0,
  validPercent: 0,
  totalTimeMs: 0,
  totalTimeFormatted: '0m',
  sessionCount: 0
})
const historicalTimes = computed(() => trackProjection.value?.historicalTimes || [])
const raceFuelBuckets = computed<TrackFuelBucketReference[]>(() => {
  const buckets = track.value.raceFuelBuckets || []
  return RACE_FUEL_BUCKET_FILTERS.map((bucket) => (
    buckets.find((item) => item.bucket === bucket) || createEmptyRaceFuelBucket(bucket)
  ))
})
const hasRaceFuelBucketData = computed(() => raceFuelBuckets.value.some((bucket) => bucket.hasData))
const preferredRaceBucket = computed(() => {
  const buckets = [...raceFuelBuckets.value].reverse()
  return buckets.find((bucket) => bucket.bucket === '100+' && bucket.hasData)
    || buckets.find((bucket) => bucket.hasData)
    || raceFuelBuckets.value[raceFuelBuckets.value.length - 1]
    || createEmptyRaceFuelBucket('100+')
})
const selectedRaceReference = computed(() => {
  return raceFuelBuckets.value.find((bucket) => bucket.bucket === selectedRaceReferenceBucket.value)
    || preferredRaceBucket.value
})

const currentPage = ref(1)
const itemsPerPage = 25
const totalPages = computed(() => Math.max(1, Math.ceil(recentSessions.value.length / itemsPerPage)))
const paginatedSessions = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage
  return recentSessions.value.slice(start, start + itemsPerPage)
})

const sessionGroups = computed(() => {
  const groups = new Map<string, typeof paginatedSessions.value>()
  for (const session of paginatedSessions.value) {
    const rows = groups.get(session.date) || []
    rows.push(session)
    groups.set(session.date, rows)
  }
  return [...groups].map(([date, sessions]) => ({
    date, sessions: sessions.map(session => ({ ...session, track: track.value.name }))
  }))
})

watch(() => [props.trackId, targetUserId.value, selectedCategory.value], () => { currentPage.value = 1 })

watch(totalPages, (pages) => {
  if (currentPage.value > pages) {
    currentPage.value = 1
  }
})

watch(preferredRaceBucket, (bucket) => {
  selectedRaceReferenceBucket.value = bucket.bucket
}, { immediate: true })

function goToPage(page: number) {
  if (page >= 1 && page <= totalPages.value) {
    currentPage.value = page
  }
}

function createEmptyRaceFuelBucket(bucket: string): TrackFuelBucketReference {
  return {
    bucket,
    bestRace: null,
    bestRaceFuel: null,
    bestRaceAirTemp: null,
    bestRaceDate: null,
    bestRaceSessionId: null,
    bestRaceSampleCount: null,
    bestRaceConfidence: null,
    avgRace: null,
    avgRaceFuel: null,
    avgRaceAirTemp: null,
    avgRaceDate: null,
    avgRaceSessionId: null,
    avgRaceSampleCount: null,
    avgRaceConfidence: null,
    hasData: false
  }
}

const sessionsRef = ref<HTMLElement | null>(null)
async function onPageChange(page: number) {
  goToPage(page)
  await nextTick()
  const target = sessionsRef.value
  const container = target?.closest<HTMLElement>('[data-page-scroll]')
  if (target && container) {
    const top = container.scrollTop + target.getBoundingClientRect().top - container.getBoundingClientRect().top - 24
    container.scrollTo({ top: Math.max(0, top), behavior: 'smooth' })
  }
}

function sessionRoute(id: string) {
  return targetUserId.value
    ? `/sessioni/${id}?userId=${encodeURIComponent(targetUserId.value)}`
    : `/sessioni/${id}`
}

function goToSession(id: string) {
  emit('go-to-session', id, sessionRoute(id))
}
</script>
<template>
  <LayoutPageContainer class="track-detail racing-data">
    <!-- Back button -->
    <button v-if="!headerBack" class="back-button" @click="emit('back')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M19 12H5M12 19l-7-7 7-7"/>
      </svg>
      {{ props.fromSession ? 'Torna alla sessione' : 'Torna alle piste' }}
    </button>

    <!-- Track Header -->
    <div class="track-header">
      <div class="track-header-image">
        <img :src="getPublicPath(track.image)" :alt="track.name" />
      </div>
      <div class="track-header-info">
        <div class="track-title-row">
          <h1 class="track-title">{{ track.name }}</h1>
          <span class="track-country-badge" :title="track.country">{{ track.countryCode }}</span>
        </div>
        <p class="track-fullname">{{ track.fullName }}</p>
        <div class="track-meta">
          <span class="meta-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2L2 7l10 5 10-5-10-5z"/>
              <path d="M2 17l10 5 10-5"/>
              <path d="M2 12l10 5 10-5"/>
            </svg>
            {{ track.length }}
          </span>
          <span class="meta-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
              <path d="M9 12l2 2 4-4"/>
            </svg>
            {{ track.turns }} curve
          </span>

        </div>
      </div>
    </div>
      <div class="track-filter track-filter--category">
        <label for="track-category">Categoria</label>
        <select id="track-category" v-model="selectedCategory">
          <option v-for="cat in CAR_CATEGORIES" :key="cat" :value="cat">{{ cat }}</option>
        </select>
      </div>
    <div class="track-header-activity" aria-label="Attivita pista">
        <div class="activity-summary-item">
          <span class="activity-summary-label">Sessioni</span>
          <span class="activity-summary-value">{{ activityStats.sessionCount }}</span>
        </div>
        <div class="activity-summary-item">
          <span class="activity-summary-label">Giri</span>
          <span class="activity-summary-value">{{ activityStats.totalLaps }}</span>
        </div>
        <div class="activity-summary-item">
          <span class="activity-summary-label">Validi {{ activityStats.validPercent }}%</span>
          <span class="activity-summary-value">{{ activityStats.validLaps }}</span>
        </div>
        <div class="activity-summary-item">
          <span class="activity-summary-label">Tempo in pista</span>
          <span class="activity-summary-value">{{ activityStats.totalTimeFormatted }}</span>
        </div>
      </div>

    <!-- 2-Column Layout -->
    <div class="page-layout">
      <div class="main-content">
        <TrackTimesChart :key="`${trackId}-${targetUserId}-${selectedCategory}`" :history="historicalTimes" :loading="isProjectionLoading" />
      </div>
      <!-- /main-content -->

      <!-- Sidebar (right - 35%) -->
      <aside class="sidebar">
        <!-- Best Times Section -->
        <div class="sidebar-section">
          <div class="section-header-row section-header-row--stacked">
            <div>
              <h2 class="section-title">Migliori tempi</h2>
            </div>
          </div>
          <div class="track-filter track-filter--grip">
            <label for="track-grip">Grip</label>
            <select id="track-grip" v-model="selectedGrip">
              <option v-for="grip in gripConditions" :key="grip" :value="grip">{{ grip }}</option>
            </select>
          </div>

          <div class="best-reference-stack">
            <button
              type="button"
              :class="['best-reference-card best-reference-card--qualy', { 'best-reference-card--clickable': track.bestQualySessionId }]"
              :disabled="!track.bestQualySessionId"
              title="Vai alla sessione qualifica"
              @click="track.bestQualySessionId && goToSession(track.bestQualySessionId)"
            >
              <span class="reference-card-title">Best qualifica</span>
              <span class="reference-card-time">{{ track.bestQualy || '--:--.---' }}</span>
              <span class="reference-card-meta">
                <template v-if="track.bestQualyDate">{{ formatShortDate(track.bestQualyDate) }}</template>
                <template v-if="track.bestQualyFuel != null"> • {{ Math.round(track.bestQualyFuel) }}L</template>
                <template v-if="track.bestQualyConditions"> • {{ track.bestQualyConditions.airTemp }}°C</template>
              </span>
              <span v-if="track.bestQualySessionId" class="fuel-cell-action" aria-hidden="true">↗</span>
            </button>

            <div :class="['race-reference-card', { 'race-reference-card--empty': !selectedRaceReference.hasData }]">
              <div class="race-reference-card__head">
                <div>
                  <span class="reference-card-kicker">Carburante iniziale</span>
                </div>
                <select v-model="selectedRaceReferenceBucket" class="race-reference-card__select" aria-label="Scegli bucket fuel gara">
                  <option v-for="bucket in raceFuelBuckets" :key="bucket.bucket" :value="bucket.bucket">
                    {{ bucket.bucket }}L
                  </option>
                </select>
              </div>
              <div class="race-reference-card__metrics">
                <button
                  type="button"
                  :class="['race-reference-metric race-reference-metric--best', { 'race-reference-metric--clickable': selectedRaceReference.bestRaceSessionId }]"
                  :disabled="!selectedRaceReference.bestRaceSessionId"
                  title="Vai alla sessione best gara"
                  @click="selectedRaceReference.bestRaceSessionId && goToSession(selectedRaceReference.bestRaceSessionId)"
                >
                  <span class="reference-card-title">Best gara</span>
                  <span class="reference-card-time">{{ selectedRaceReference.bestRace || '--:--.---' }}</span>
                  <span class="reference-card-meta">
                    <template v-if="selectedRaceReference.bestRaceDate">{{ formatShortDate(selectedRaceReference.bestRaceDate) }}</template>
                    <template v-if="selectedRaceReference.bestRaceFuel != null"> • {{ Math.round(selectedRaceReference.bestRaceFuel) }}L</template>
                    <template v-if="selectedRaceReference.bestRaceAirTemp != null"> • {{ selectedRaceReference.bestRaceAirTemp }}°C</template>
                  </span>
                  <span v-if="selectedRaceReference.bestRaceSessionId" class="fuel-cell-action" aria-hidden="true">↗</span>
                </button>
                <button
                  type="button"
                  :class="['race-reference-metric race-reference-metric--avg', { 'race-reference-metric--clickable': selectedRaceReference.avgRaceSessionId }]"
                  :disabled="!selectedRaceReference.avgRaceSessionId"
                  title="Vai alla sessione della best media gara"
                  @click="selectedRaceReference.avgRaceSessionId && goToSession(selectedRaceReference.avgRaceSessionId)"
                >
                  <span class="reference-card-title">Best media gara</span>
                  <span class="reference-card-time">{{ selectedRaceReference.avgRace || '--:--.---' }}</span>
                  <span class="reference-card-meta">
                    <template v-if="selectedRaceReference.avgRaceDate">{{ formatShortDate(selectedRaceReference.avgRaceDate) }}</template>
                    <template v-if="selectedRaceReference.avgRaceFuel != null"> • {{ Math.round(selectedRaceReference.avgRaceFuel) }}L</template>
                    <template v-if="selectedRaceReference.avgRaceAirTemp != null"> • {{ selectedRaceReference.avgRaceAirTemp }}°C</template>
                  </span>
                  <span v-if="selectedRaceReference.avgRaceSessionId" class="fuel-cell-action" aria-hidden="true">↗</span>
                </button>
              </div>
            </div>
          </div>
          <p v-if="!hasRaceFuelBucketData" class="no-data-hint no-data-hint--block">
            Nessun riferimento gara per {{ selectedCategory }} / {{ selectedGrip }}.
          </p>
        </div>

      </aside>
    <section ref="sessionsRef" class="track-sessions" aria-label="Sessioni recenti">
      <h2 class="section-title">Sessioni recenti</h2>
      <p v-if="isProjectionLoading" class="sessions-status" role="status">Caricamento sessioni…</p>
      <p v-else-if="!recentSessions.length" class="sessions-status" role="status">Nessuna sessione disponibile per questa categoria.</p>
      <RacingSessionList v-else class="sessions-list" hide-track :groups="sessionGroups" :session-href="sessionRoute" @go-to-session="goToSession" />
      <PaginationControls
        v-model:current-page="currentPage"
        variant="racing"
        :disabled="isProjectionLoading"
        :total-pages="totalPages"
        :total-items="recentSessions.length"
        item-label="sessioni"
        @page-change="onPageChange"
      />
    </section>
    </div>
  </LayoutPageContainer>
</template>

<style lang="scss" scoped>
@use '@/assets/scss/racing-settings' as controls;

.track-detail { @include controls.tokens; --rc-control-height: 34px; }
.back-button { @include controls.action; display: inline-flex; align-items: center; gap: 8px; margin-bottom: 24px; }
.back-button svg { width: 16px; height: 16px; }
.track-header { display: flex; align-items: center; gap: 24px; margin-bottom: 28px; }
.track-header-image { width: 104px; flex: 0 0 104px; aspect-ratio: 1; }
.track-header-image img { width: 100%; height: 100%; display: block; object-fit: cover; }
.track-header-info { flex: 1; min-width: 0; }
.track-title-row { display: flex; align-items: center; gap: 12px; }
.track-title { @include controls.title; margin: 0; }
.track-country-badge { border: 1px solid var(--rc-line); padding: 4px 8px; color: var(--rc-muted); font-size: 11px; }
.track-fullname { margin: 8px 0 18px; color: var(--rc-muted); font-size: 13px; }
.track-meta { display: flex; gap: 20px; flex-wrap: wrap; }
.meta-item { display: inline-flex; align-items: center; gap: 8px; color: var(--rc-muted); font-size: 12px; }
.meta-item svg { width: 14px; height: 14px; }
.track-header-activity { display: flex; flex-wrap: wrap; gap: 16px 32px; padding: 0 0 24px; margin-bottom: 28px; border-bottom: 1px solid var(--rc-line); }
.activity-summary-item + .activity-summary-item { border-left: 1px solid var(--rc-line); padding-left: 32px; }
.activity-summary-item { display: flex; flex-direction: row-reverse; align-items: baseline; gap: 8px; }
.activity-summary-label { color: var(--rc-muted); font-size: 11px; }
.activity-summary-value { font-size: 18px; font-weight: 600; font-variant-numeric: tabular-nums; }
.track-filter { display: flex; flex-direction: column; gap: 8px; }
.track-filter label { font-size: 11px; color: var(--rc-muted); }
.track-filter select, .race-reference-card__select { @include controls.select; background-color: transparent; width: 148px; }
.track-filter--category { flex-direction: row; align-items: center; gap: 12px; margin-bottom: 24px; }
.track-filter--category select { width: 112px; }
.track-filter--grip { flex-direction: row; align-items: center; justify-content: space-between; margin-bottom: 16px; }
.page-layout { display: grid; grid-template-columns: minmax(0, 1fr) 290px; gap: 28px; align-items: start; grid-template-areas: "chart references" "sessions references"; }
.main-content, .sidebar { min-width: 0; }
.main-content { grid-area: chart; }
.sidebar { grid-area: references; }
@media (min-width: 1201px) and (min-height: 850px) {
  .sidebar { position: sticky; top: 24px; }
}
.section-title { font-size: 18px; font-weight: 600; margin: 0 0 20px; }
.sidebar .section-title { margin-bottom: 16px; }
.best-reference-stack { display: flex; flex-direction: column; gap: 16px; }
.race-reference-card { border-top: 1px solid var(--rc-line); padding-top: 20px; margin-top: 4px; }
.best-reference-card, .race-reference-metric { position: relative; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 7px; width: 100%; padding: 14px 18px; border: 1px solid color-mix(in srgb, var(--reference-color) 36%, transparent); background: color-mix(in srgb, var(--reference-color) 8%, transparent); color: inherit; font: inherit; text-align: center; }
.best-reference-card--qualy { --reference-color: var(--racing-qualify); }
.race-reference-metric--best { --reference-color: var(--racing-race); }
.race-reference-metric--avg { --reference-color: var(--racing-practice); }
.best-reference-card:not(:disabled), .race-reference-metric:not(:disabled) { cursor: pointer; }
.best-reference-card:hover:not(:disabled), .race-reference-metric:hover:not(:disabled) { background: color-mix(in srgb, var(--reference-color) 12%, transparent); border-color: color-mix(in srgb, var(--reference-color) 60%, transparent); }
.best-reference-card:focus-visible, .race-reference-metric:focus-visible { outline: 2px solid white; outline-offset: 3px; }
.reference-card-title { font-size: 11px; color: var(--rc-muted); }
.reference-card-time { font-size: 23px; font-weight: 600; font-variant-numeric: tabular-nums; color: var(--reference-color); }
.reference-card-meta { min-height: 15px; font-size: 11px; line-height: 1.4; color: var(--rc-muted); }
.race-reference-card__head { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
.reference-card-kicker { font-size: 11px; color: var(--rc-muted); }
.race-reference-card__select { width: 112px; }
.race-reference-card__metrics { display: grid; gap: 12px; }
.fuel-cell-action { position: absolute; right: 12px; top: 12px; color: var(--rc-muted); font-size: 13px; }
.no-data-hint, .sessions-status { color: var(--rc-muted); font-size: 12px; line-height: 1.6; }
.track-sessions { grid-area: sessions; min-width: 0; margin-top: 12px; scroll-margin-top: 24px; }
.track-sessions > .section-title { margin-bottom: 28px; }
.track-sessions :deep(.pagination) { margin-top: 28px; }
@media (max-width: 1200px) {
  .track-header { flex-wrap: wrap; }
  .page-layout { grid-template-columns: 1fr; grid-template-areas: "chart" "references" "sessions"; }
  .best-reference-stack { display: grid; grid-template-columns: 1fr 2fr; align-items: start; }
  .race-reference-card__metrics { grid-template-columns: 1fr 1fr; }
}
@media (max-width: 600px) {
  .track-header-image { width: 88px; flex-basis: 88px; }
  .track-header { gap: 16px; }
  .track-header-activity { display: grid; grid-template-columns: repeat(2, max-content); gap: 16px 24px; }
  .activity-summary-item { justify-content: flex-end; }
  .activity-summary-item + .activity-summary-item { border: 0; padding: 0; }
  .track-filter--category { flex-basis: 100%; margin-left: 0; }
  .best-reference-stack, .race-reference-card__metrics { grid-template-columns: 1fr; }
}
</style>

