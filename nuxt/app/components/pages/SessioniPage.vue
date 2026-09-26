<script setup lang="ts">
// ============================================
// SessioniPage - Sessions list with filters
// Uses server-side pagination + local offline fallback
// ============================================

import RacingSessionList from '~/components/sessions/RacingSessionList.vue'
import { ref, computed, onBeforeUnmount, onMounted, watch, nextTick } from 'vue'
import { 
  formatLapTime, 
  formatCarName, 
  formatTrackName,
  formatTime,
  getSessionTypeLabel,
  getCarCategory,
  CAR_CATEGORIES,
  type CarCategory
} from '~/utils/telemetryFormat'
import { usePilotContext } from '~/composables/usePilotContext'
import { useTelemetryGateway } from '~/composables/useTelemetryGateway'
import type { SessionPagerFilters } from '~/composables/useSessionPager'
import { ACC_CAR_OPTIONS, ACC_TRACK_OPTIONS } from '~/constants/accCatalog'

// Emit to parent for navigation
const emit = defineEmits<{
  'go-to-session': [sessionId: string]
}>()

// Types
type SessionType = 'practice' | 'qualify' | 'race'

interface DisplaySession {
  id: string
  date: string
  time: string
  type: SessionType
  track: string
  trackRaw: string
  car: string
  carRaw: string
  carCategory: CarCategory
  laps: number
  lapsValid: number
  stints: number
  bestQualy?: string
  bestRace?: string
  source?: 'cloud' | 'local'
  syncState?: 'synced' | 'pending_sync' | 'local_only' | 'sync_failed'
}

const ITEMS_PER_PAGE = 25

// Get pilot context (will be set when coach views a pilot)
const targetUserId = usePilotContext()

// === PAGED DATA SOURCE ===
const telemetryGateway = useTelemetryGateway()
const {
  pagerSessions: rawSessions,
  pagerState,
  pagerError,
  pagerIsOnline: isOnline
} = telemetryGateway

const isLoading = computed(() => pagerState.value.loading)
const currentPage = ref(1)

const filterTypeToNumeric: Record<SessionType, number> = {
  practice: 0,
  qualify: 1,
  race: 2
}

function formatDateKey(date: Date): string {
  const year = date.getFullYear()
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${year}-${month}-${day}`
}

function getRangeStartKey(range: 'today' | '7d' | '30d' | 'all'): string | null {
  if (range === 'all') return null
  const now = new Date()
  const start = new Date(now)
  if (range === 'today') {
    return formatDateKey(start)
  }
  const days = range === '7d' ? 7 : 30
  start.setDate(now.getDate() - days)
  return formatDateKey(start)
}

function getRangeStartIso(range: 'today' | '7d' | '30d' | 'all'): string | null {
  if (range === 'all') return null
  const now = new Date()
  const start = new Date(now)
  if (range === 'today') {
    start.setHours(0, 0, 0, 0)
    return start.toISOString()
  }
  const days = range === '7d' ? 7 : 30
  start.setDate(now.getDate() - days)
  start.setHours(0, 0, 0, 0)
  return start.toISOString()
}

function normalizeFilterToken(input?: string | null): string {
  return String(input || '')
    .trim()
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

function matchesFilterToken(filterValue: string, candidates: string[]): boolean {
  if (filterValue === 'all') return true
  const normalizedFilter = normalizeFilterToken(filterValue)
  return candidates.some(candidate => normalizeFilterToken(candidate) === normalizedFilter)
}

function normalizeCatalogCategory(category: string): CarCategory {
  const upper = category.toUpperCase()
  return upper === 'CUP' ? 'CUP' : upper as CarCategory
}

function buildServerFilters(): SessionPagerFilters {
  return {
    sessionTypes: filterType.value === 'all' ? [] : [filterTypeToNumeric[filterType.value]],
    fromDateIso: getRangeStartIso(filterTimeRange.value),
    toDateIso: filterTimeRange.value === 'all' ? null : new Date().toISOString(),
    track: filterTrack.value === 'all' ? null : filterTrack.value,
    car: filterCar.value === 'all' ? null : filterCar.value,
    carCategory: filterCarCategory.value === 'all' ? null : filterCarCategory.value,
    hideEmpty: true
  }
}

async function reloadFirstPage(forceReset = false) {
  await telemetryGateway.getSessionsPage(
    targetUserId.value || undefined,
    buildServerFilters(),
    1,
    ITEMS_PER_PAGE,
    forceReset
  )
  currentPage.value = pagerState.value.currentPage
}

onMounted(async () => {
  await reloadFirstPage()
})

function handleCacheInvalidated(event: Event) {
  const detail = (event as CustomEvent<{ uid?: string | null }>).detail || {}
  if (!targetUserId.value || !detail.uid || detail.uid === targetUserId.value) {
    void reloadFirstPage(true)
  }
}

onMounted(() => {
  window.addEventListener('acc:telemetry-cache-invalidated', handleCacheInvalidated)
})

onBeforeUnmount(() => {
  window.removeEventListener('acc:telemetry-cache-invalidated', handleCacheInvalidated)
  if (filterReloadTimer) clearTimeout(filterReloadTimer)
})

watch(
  () => targetUserId.value,
  async () => {
    await reloadFirstPage()
  }
)

// Transform Firebase sessions to display format
const sessions = computed<DisplaySession[]>(() => {
  return rawSessions.value.map(s => {
    const sessionType = getSessionTypeLabel(s.meta.session_type)
    const dateStr = s.meta.date_start?.split('T')[0] || ''
    const sessionRaceTime = s.summary.best_session_race_ms || s.summary.best_race_ms || null
    
    return {
      id: s.sessionId,
      date: dateStr,
      time: formatTime(s.meta.date_start),
      type: sessionType,
      track: formatTrackName(s.meta.track),
      trackRaw: s.meta.track || '',
      car: formatCarName(s.meta.car),
      carRaw: s.meta.car || '',
      carCategory: getCarCategory(s.meta.car || ''),
      laps: s.summary.laps || 0,
      lapsValid: s.summary.lapsValid || 0,
      stints: s.summary.stintCount ?? 0,
      // Use stint-based best times (fuel-band classified)
      bestQualy: s.summary.best_qualy_ms 
        ? formatLapTime(s.summary.best_qualy_ms) 
        : undefined,
      bestRace: sessionRaceTime 
        ? formatLapTime(sessionRaceTime) 
        : undefined,
      source: s.source as 'cloud' | 'local' | undefined,
      syncState: s.syncState as 'synced' | 'pending_sync' | 'local_only' | 'sync_failed' | undefined
    }
  })
})

// === FILTER STATE ===
const filterType = ref<'all' | SessionType>('all')
const filterTrack = ref('all')
const filterCarCategory = ref<'all' | CarCategory>('all')
const filterCar = ref('all')
const filterTimeRange = ref<'today' | '7d' | '30d' | 'all'>('all')
let filterReloadTimer: ReturnType<typeof setTimeout> | null = null

watch(
  [filterType, filterTrack, filterCarCategory, filterCar, filterTimeRange],
  () => {
    if (filterReloadTimer) clearTimeout(filterReloadTimer)
    filterReloadTimer = setTimeout(() => {
      void reloadFirstPage(true)
    }, 300)
  }
)

watch(filterCarCategory, () => {
  if (filterCar.value !== 'all' && !carOptions.value.some(car => car.id === filterCar.value)) {
    filterCar.value = 'all'
  }
})

const trackOptions = computed(() => ACC_TRACK_OPTIONS)
const carOptions = computed(() => {
  return ACC_CAR_OPTIONS
    .filter(car => filterCarCategory.value === 'all' || normalizeCatalogCategory(car.category) === filterCarCategory.value)
    .sort((a, b) => a.name.localeCompare(b.name))
})
const carAllLabel = computed(() => filterCarCategory.value === 'all'
  ? 'Tutte le auto'
  : `Tutte le auto ${filterCarCategory.value}`
)

// Filtered sessions
const filteredSessions = computed(() => {
  return sessions.value.filter(session => {
    // Hide empty sessions (0 total laps)
    if (session.laps === 0) return false
    
    // Type filter
    if (filterType.value !== 'all' && session.type !== filterType.value) return false
    
    // Track filter
    if (!matchesFilterToken(filterTrack.value, [session.trackRaw, session.track])) return false

    // Car category filter
    if (filterCarCategory.value !== 'all' && session.carCategory !== filterCarCategory.value) return false
    
    // Car filter
    if (!matchesFilterToken(filterCar.value, [session.carRaw, session.car])) return false
    
    // Time range filter
    if (filterTimeRange.value !== 'all') {
      const sessionDateKey = session.date
      const todayKey = formatDateKey(new Date())
      const fromKey = getRangeStartKey(filterTimeRange.value)

      if (filterTimeRange.value === 'today' && sessionDateKey !== todayKey) return false
      if (fromKey && sessionDateKey < fromKey) return false
      if (sessionDateKey > todayKey) return false
    }
    
    return true
  })
})

// === PAGINATION ===
// Total filtered sessions count
const totalFilteredSessions = computed(() => {
  if (pagerState.value.totalItems !== null) {
    return pagerState.value.totalItems
  }
  return filteredSessions.value.length
})

// Total pages
const totalPages = computed(() => {
  if (pagerState.value.totalItems !== null) {
    return Math.max(1, Math.ceil(pagerState.value.totalItems / ITEMS_PER_PAGE))
  }
  return Math.max(1, pagerState.value.currentPage + (pagerState.value.hasNext ? 1 : 0))
})

// Group sessions by day (server page already loaded)
const paginatedSessionsByDay = computed(() => {
  const groups: Record<string, DisplaySession[]> = {}
  for (const session of filteredSessions.value) {
    if (!groups[session.date]) {
      groups[session.date] = []
    }
    groups[session.date]!.push(session)
  }
  
  return Object.entries(groups)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, sessions]) => ({ date, sessions }))
})

// Smooth page change animation
const sessionsRef = ref<HTMLElement | null>(null)
const isChangingPage = ref(false)

async function onPageChange(page: number) {
  isChangingPage.value = true
  await telemetryGateway.getSessionsPage(
    targetUserId.value || undefined,
    buildServerFilters(),
    page,
    ITEMS_PER_PAGE,
    false
  )
  currentPage.value = pagerState.value.currentPage
  // Reset fading state after data load - don't rely only on transitionend
  await nextTick()
  isChangingPage.value = false
}

// Get session type label
function getTypeLabel(type: SessionType): string {
  const labels = { practice: 'PROVE LIBERE', qualify: 'QUALIFICA', race: 'GARA' }
  return labels[type]
}

// Navigate to session detail via emit
function goToSession(id: string) {
  emit('go-to-session', id)
}
</script>

<template>
  <LayoutPageContainer class="sessions-page racing-data">
    <h1 class="racing-sr-only">
      Sessioni
    </h1>
    <p
      v-if="!isOnline"
      class="sessions-notice"
      role="status"
    >
      Modalità offline: visualizzo dati locali. La sincronizzazione riprenderà quando torni online.
    </p>

    <section
      class="session-filters"
      aria-label="Filtri sessioni"
    >
      <div
        class="racing-filter-tabs"
        role="group"
        aria-label="Tipo di sessione"
      >
        <button
          v-for="type in (['all', 'practice', 'qualify', 'race'] as const)"
          :key="type"
          type="button"
          :aria-pressed="filterType === type"
          :class="{ 'is-active': filterType === type }"
          @click="filterType = type"
        >
          {{ type === 'all' ? 'Tutto' : getTypeLabel(type) }}
        </button>
      </div>
      <div class="racing-filter-selects">
        <select
          v-model="filterTrack"
          class="racing-select racing-select--compact"
          aria-label="Filtra pista"
        >
          <option value="all">
            Tutte le piste
          </option>
          <option
            v-for="track in trackOptions"
            :key="track.id"
            :value="track.id"
          >
            {{ track.name }}
          </option>
        </select>
        <select
          v-model="filterCarCategory"
          class="racing-select racing-select--compact"
          aria-label="Filtra categoria auto"
        >
          <option value="all">
            Tutte le categorie
          </option>
          <option
            v-for="category in CAR_CATEGORIES"
            :key="category"
            :value="category"
          >
            {{ category }}
          </option>
        </select>
        <select
          v-model="filterCar"
          class="racing-select racing-select--compact racing-select--car"
          aria-label="Filtra auto"
        >
          <option value="all">
            {{ carAllLabel }}
          </option>
          <option
            v-for="car in carOptions"
            :key="car.id"
            :value="car.id"
          >
            {{ car.name }}
          </option>
        </select>
        <select
          v-model="filterTimeRange"
          class="racing-select racing-select--compact"
          aria-label="Filtra periodo"
        >
          <option value="all">
            Ogni periodo
          </option>
          <option value="today">
            Oggi
          </option>
          <option value="7d">
            Ultimi 7 giorni
          </option>
          <option value="30d">
            Ultimi 30 giorni
          </option>
        </select>
      </div>
    </section>

    <UiScrollArea
      class="sessions-scroll"
      label="Elenco sessioni"
    >
      <p
        v-if="pagerError"
        class="sessions-notice sessions-notice--error"
        role="alert"
      >
        Impossibile caricare le sessioni.
        <button
          type="button"
          class="racing-text-action"
          :disabled="isLoading"
          @click="reloadFirstPage(true)"
        >
          Riprova
        </button>
      </p>
      <p
        v-if="isLoading && !paginatedSessionsByDay.length"
        class="sessions-status"
        role="status"
      >
        Caricamento sessioni…
      </p>
      <p
        v-else-if="!pagerError && !paginatedSessionsByDay.length"
        class="sessions-status"
        role="status"
      >
        Nessuna sessione trovata con i filtri selezionati.
      </p>

      <div
        ref="sessionsRef"
        class="session-days"
        :aria-busy="isLoading || isChangingPage"
      >
        <RacingSessionList :groups="paginatedSessionsByDay" @go-to-session="goToSession" />
      </div>
    </UiScrollArea>
    <UiPaginationControls
      v-model:current-page="currentPage"
      class="sessions-pagination"
      variant="racing"
      :disabled="isLoading || isChangingPage"
      :total-pages="totalPages"
      :total-items="totalFilteredSessions"
      :scroll-target="sessionsRef"
      item-label="sessioni"
      @page-change="onPageChange"
    />
  </LayoutPageContainer>
</template>

<style lang="scss" scoped>
@use '@/assets/scss/racing-settings' as controls;
.sessions-page { width: 100%; padding-top: var(--app-content-top-space); padding-bottom: 0; flex: 1; min-height: 0; display: flex; flex-direction: column; overflow: hidden; }
.session-filters { margin-bottom: 24px; flex: 0 0 auto; }
.sessions-scroll { flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden;
  overscroll-behavior-y: contain; scrollbar-gutter: stable;
  padding: var(--app-scroll-fade-size) 0 12px; mask-image: var(--app-scroll-fade-mask); }
.sessions-pagination { flex: 0 0 auto; margin-top: 16px; padding-bottom: 24px; }
.session-days { scroll-margin-top: 24px; }
.session-days[aria-busy="true"] { opacity: .55; pointer-events: none; }
.sessions-status { padding: 40px 0; color: var(--racing-data-muted); }
.sessions-notice { padding: 12px 0; color: var(--racing-qualify); font-size: var(--racing-data-text-size); }
.sessions-notice--error { color: #ff8999; }
@media (max-width: 700px) { .sessions-page { padding: var(--app-content-top-space) 16px 0; } }
.sessions-page { @include controls.tokens; }
</style>
