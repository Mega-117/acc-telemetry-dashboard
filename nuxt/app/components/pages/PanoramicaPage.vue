<script setup lang="ts">
// ============================================
// PanoramicaPage - Overview with Virtual Coach
// ============================================

import { ref, computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useTelemetryGateway, type OverviewSnapshot } from '~/composables/useTelemetryGateway'
import { useCoachInsights } from '~/composables/useCoachInsights'
import { usePilotContext, useTargetUserId } from '~/composables/usePilotContext'
import { usePublicPath } from '~/composables/usePublicPath'
import type { OverviewProjection } from '~/types/overviewProjections'
import type { CoachBriefingScenario } from '~/composables/useCoachInsights'
import { loadRaceCalendarEvents, type RaceCalendarEvent } from '~/repositories/raceCalendarRepository'
import { normalizeTrackId as normalizeProjectionTrackId } from '~/services/projections/trackMetadata'

type DriverReminderSlide = 'recent' | 'race'

const SCENARIO_FOCUS_MAP: Record<CoachBriefingScenario, string[]> = {
  tracktitan_input: ['Input precisione', 'Correzione errori'],
  clean_laps: ['Validita giro', 'Ripetibilita ritmo'],
  qualifying: ['Giro secco', 'Preparazione push lap'],
  consistency: ['Costanza passo', 'Fuel gara stabile'],
  race_real: ['Partenza', 'Traffico e sorpassi']
}

// Car images
import mustangImg from '@/assets/images/cars/mustang_gt3.png'
import astonMartinImg from '@/assets/images/cars/aston_martin_gt3.png'
import ferrariImg from '@/assets/images/cars/ferrari_296_gt3.png'
import ferrari488Img from '@/assets/images/cars/ferrari_488_gt3.png'
import bmwImg from '@/assets/images/cars/bmw_m4_gt3.png'
import mclarenImg from '@/assets/images/cars/mclaren_720s_gt3.png'
import audiImg from '@/assets/images/cars/audi_r8_gt3.png'
import bentleyImg from '@/assets/images/cars/bentley_continental_gt3.png'
import hondaImg from '@/assets/images/cars/honda_nsx_gt3.png'
import lamborghiniImg from '@/assets/images/cars/lamborghini_huracan_gt3.png'
import mercedesImg from '@/assets/images/cars/mercedes_amg_gt3.png'
import porscheImg from '@/assets/images/cars/porsche_911_gt3.png'
import nissanImg from '@/assets/images/cars/nissan_gtr_gt3.png'
import lexusImg from '@/assets/images/cars/lexus_rcf_gt3.png'
import jaguarImg from '@/assets/images/cars/jaguar_gt3.png'
import defaultCarImg from '@/assets/images/cars/default_gt3.png'

// Car image mapping (key patterns from session data)
const carImages: Record<string, string> = {
  mustang: mustangImg,
  ford_mustang: mustangImg,
  amr: astonMartinImg,
  aston: astonMartinImg,
  aston_martin: astonMartinImg,
  v8_vantage: astonMartinImg,
  v12_vantage: astonMartinImg,
  ferrari_296: ferrariImg,
  '296_gt3': ferrariImg,
  ferrari_488: ferrari488Img,
  '488_gt3': ferrari488Img,
  '488': ferrari488Img,
  bmw: bmwImg,
  m4: bmwImg,
  m4_gt3: bmwImg,
  m6: bmwImg,
  m6_gt3: bmwImg,
  mclaren: mclarenImg,
  '720s': mclarenImg,
  '650s': mclarenImg,
  audi: audiImg,
  r8: audiImg,
  r8_lms: audiImg,
  bentley: bentleyImg,
  continental: bentleyImg,
  honda: hondaImg,
  nsx: hondaImg,
  lamborghini: lamborghiniImg,
  huracan: lamborghiniImg,
  'huracán': lamborghiniImg,
  mercedes: mercedesImg,
  amg: mercedesImg,
  amg_gt: mercedesImg,
  porsche: porscheImg,
  '911': porscheImg,
  '991': porscheImg,
  '992': porscheImg,
  nissan: nissanImg,
  gtr: nissanImg,
  'gt-r': nissanImg,
  nismo: nissanImg,
  lexus: lexusImg,
  rcf: lexusImg,
  rc_f: lexusImg,
  jaguar: jaguarImg,
  emil_frey: jaguarImg,
}

const { getPublicPath } = usePublicPath()
const pilotContext = usePilotContext()
const targetUserId = useTargetUserId()
const telemetryGateway = useTelemetryGateway()
const { isLoading } = telemetryGateway

const overviewProjection = ref<OverviewProjection | null>(null)
const overviewSnapshot = ref<OverviewSnapshot | null>(null)
const raceCalendarEvents = ref<RaceCalendarEvent[]>([])
const emptyActivityTotals = {
  practice: { minutes: 0, sessions: 0 },
  qualify: { minutes: 0, sessions: 0 },
  race: { minutes: 0, sessions: 0 }
}

const SESSION_TYPE_PRACTICE = 0
const SESSION_TYPE_QUALIFY = 1
const SESSION_TYPE_RACE = 2
const DEFAULT_RACE_PREP_LOOKBACK_DAYS = 28
const MS_PER_DAY = 24 * 60 * 60 * 1000

function parseIsoTimestamp(value: string | null | undefined): number | null {
  if (!value) return null
  const ts = Date.parse(value)
  return Number.isFinite(ts) ? ts : null
}

function normalizeTrackToken(value: string | null | undefined): string {
  return normalizeProjectionTrackId(value).replace(/^_+|_+$/g, '')
}

function tracksMatch(left: string | null | undefined, right: string | null | undefined): boolean {
  const a = normalizeTrackToken(left)
  const b = normalizeTrackToken(right)
  if (!a || !b) return false
  return a === b || a.includes(b) || b.includes(a)
}

async function loadOverview() {
  const [projection, snapshot] = await Promise.all([
    telemetryGateway.getOverviewProjection(targetUserId.value || undefined),
    telemetryGateway.getOverviewSnapshot(targetUserId.value || undefined)
  ])
  overviewProjection.value = projection
  overviewSnapshot.value = snapshot
}

async function loadRaceCalendar() {
  if (!targetUserId.value) {
    raceCalendarEvents.value = []
    return
  }
  try {
    raceCalendarEvents.value = await loadRaceCalendarEvents(targetUserId.value, 12)
  } catch {
    raceCalendarEvents.value = []
  }
}

function handleCacheInvalidated(event: Event) {
  const detail = (event as CustomEvent<{ uid?: string | null; scope?: string }>).detail || {}
  if (!targetUserId.value) return
  if (detail.uid && detail.uid !== targetUserId.value) return

  void loadOverview()

  if (!detail.scope || ['all', 'calendar', 'manual-refresh'].includes(detail.scope)) {
    void loadRaceCalendar()
  }
}

watch(
  () => targetUserId.value,
  async () => {
    await Promise.all([loadOverview(), loadRaceCalendar()])
  },
  { immediate: true }
)

onMounted(() => {
  loadDriverReminderState()
  window.addEventListener('acc:telemetry-cache-invalidated', handleCacheInvalidated)
})

onBeforeUnmount(() => {
  window.removeEventListener('acc:telemetry-cache-invalidated', handleCacheInvalidated)
})

const activityData = computed(() => overviewProjection.value?.activity7d || [])
const activityTotals = computed(() => overviewProjection.value?.activityTotals || emptyActivityTotals)

const lastCarImage = computed(() => {
  const rawName = overviewProjection.value?.lastCar.rawName
  if (!rawName) return defaultCarImg
  const carName = rawName.toLowerCase()
  for (const [key, img] of Object.entries(carImages)) {
    if (carName.includes(key)) {
      return img
    }
  }
  return defaultCarImg
})

const lastCarName = computed(() => overviewProjection.value?.lastCar.displayName || 'NESSUNA AUTO')
const lastCarDate = computed(() => overviewProjection.value?.lastCar.lastUsedDate || '-')

const lastTrack = computed(() => overviewProjection.value?.lastTrack || null)
const prevTrack = computed(() => overviewProjection.value?.previousTrack || null)

const lastTrackName = computed(() => lastTrack.value?.name?.toUpperCase() || 'NESSUNA PISTA')
const prevTrackName = computed(() => prevTrack.value?.name?.toUpperCase() || 'NESSUNA PISTA')
const lastTrackBestQualy = computed(() => lastTrack.value?.bestQualy || '--:--.---')
const lastTrackBestQualyGrip = computed(() => lastTrack.value?.bestQualyGrip || null)
const lastTrackBestRace = computed(() => lastTrack.value?.bestRace || '--:--.---')
const lastTrackBestRaceGrip = computed(() => lastTrack.value?.bestRaceGrip || null)
const lastTrackAvgTime = computed(() => lastTrack.value?.bestAvgRace || '--:--.---')
const lastTrackAvgTimeGrip = computed(() => lastTrack.value?.bestAvgRaceGrip || null)
const prevTrackBestQualy = computed(() => prevTrack.value?.bestQualy || '--:--.---')
const prevTrackBestQualyGrip = computed(() => prevTrack.value?.bestQualyGrip || null)
const prevTrackBestRace = computed(() => prevTrack.value?.bestRace || '--:--.---')
const prevTrackBestRaceGrip = computed(() => prevTrack.value?.bestRaceGrip || null)
const prevTrackAvgTime = computed(() => prevTrack.value?.bestAvgRace || '--:--.---')
const prevTrackAvgTimeGrip = computed(() => prevTrack.value?.bestAvgRaceGrip || null)
const lastTrackImage = computed(() => getPublicPath(lastTrack.value?.image || '/tracks/track_default.png'))
const prevTrackImage = computed(() => getPublicPath(prevTrack.value?.image || '/tracks/track_default.png'))

const nextRaceEvent = computed(() => {
  if (!raceCalendarEvents.value.length) return null
  const nowTs = Date.now()
  const parsed = raceCalendarEvents.value
    .map((event) => ({ event, ts: Date.parse(event.startsAt || '') }))
    .filter((entry) => Number.isFinite(entry.ts))

  if (!parsed.length) return null

  const upcoming = parsed.find((entry) => entry.ts >= nowTs)
  return (upcoming || parsed[0] || null)?.event || null
})

const emit = defineEmits<{
  'go-to-track': [trackId: string]
}>()

const router = useRouter()

const { getDailySuggestionScenarios, generateDailySuggestion, generateDriverState } = useCoachInsights()
const briefingSelection = ref<'auto' | CoachBriefingScenario>('auto')
const briefingScenarioOptions = getDailySuggestionScenarios()

const recommendedBriefingScenario = computed<CoachBriefingScenario>(() => {
  return generateDailySuggestion(activityData.value, null).scenario || 'clean_laps'
})

const selectedBriefingScenario = computed<CoachBriefingScenario>(() => {
  return briefingSelection.value === 'auto' ? recommendedBriefingScenario.value : briefingSelection.value
})

const dailySuggestion = computed(() => {
  return generateDailySuggestion(activityData.value, selectedBriefingScenario.value)
})

const briefingToneClass = computed(() => `tone-${dailySuggestion.value.tone || 'race'}`)
const selectedTrainingLabel = computed(() => {
  return briefingScenarioOptions.find((scenario) => scenario.id === selectedBriefingScenario.value)?.label || 'Pulizia'
})
const briefingModeLabel = computed(() => briefingSelection.value === 'auto' ? 'Beta / 7 giorni' : 'Scelta manuale')

const driverState = computed(() => {
  return generateDriverState(activityData.value)
})

const prepSessionTarget = computed(() => ({
  path: '/preparazione',
  query: {
    scenario: dailySuggestion.value.scenario || 'race_real'
  }
}))

const recentMinutes = computed(() => {
  return activityTotals.value.practice.minutes + activityTotals.value.qualify.minutes + activityTotals.value.race.minutes
})

const recentSessions = computed(() => {
  return activityTotals.value.practice.sessions + activityTotals.value.qualify.sessions + activityTotals.value.race.sessions
})

const DRIVER_REMINDER_STORAGE_KEY = 'acc:overview:driver-reminder:v2'
const reminderSlide = ref<DriverReminderSlide>('recent')
const nextRaceName = computed(() => {
  if (!nextRaceEvent.value) return 'Nessuna gara pianificata'
  const track = nextRaceEvent.value.trackName?.trim() || ''
  if (track) return track
  return nextRaceEvent.value.title?.trim() || 'Gara pianificata'
})
const nextRaceSubtitle = computed(() => {
  if (!nextRaceEvent.value) return ''
  const title = nextRaceEvent.value.title?.trim() || ''
  if (!title) return ''
  const track = nextRaceEvent.value.trackName?.trim() || ''
  if (track && title.toLowerCase() === track.toLowerCase()) return ''
  return title.length > 44 ? `${title.slice(0, 44)}...` : title
})
const nextRaceDateLabel = computed(() => {
  const value = nextRaceEvent.value?.startsAt || ''
  if (!value) return 'Definisci la prossima gara in Area Pilota'
  const parsed = Date.parse(value)
  if (!Number.isFinite(parsed)) return value
  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(new Date(parsed))
})
const nextRaceDaysLeft = computed(() => {
  const startsAt = nextRaceEvent.value?.startsAt || ''
  if (!startsAt) return null
  const ts = parseIsoTimestamp(startsAt)
  if (ts === null) return null
  return Math.max(0, Math.ceil((ts - Date.now()) / MS_PER_DAY))
})
const nextRaceDaysLeftLabel = computed(() => {
  if (nextRaceDaysLeft.value === null) return ''
  return `${nextRaceDaysLeft.value}g alla gara`
})
const hasNextRace = computed(() => Boolean(nextRaceEvent.value))

const racePrepWindowStartTs = computed(() => {
  const event = nextRaceEvent.value
  if (!event) return null
  const explicitStart = parseIsoTimestamp(event.createdAt)
  if (explicitStart !== null) return explicitStart
  const raceTs = parseIsoTimestamp(event.startsAt)
  if (raceTs === null) return null
  return raceTs - (DEFAULT_RACE_PREP_LOOKBACK_DAYS * MS_PER_DAY)
})

const racePrepWindowStartLabel = computed(() => {
  const ts = racePrepWindowStartTs.value
  if (ts === null) return ''
  return new Intl.DateTimeFormat('it-IT', {
    day: '2-digit',
    month: 'short',
    year: 'numeric'
  }).format(new Date(ts))
})

const raceSpecificSessions = computed(() => {
  if (!hasNextRace.value) return []
  const sessions = overviewSnapshot.value?.sessions || []
  if (!sessions.length) return []

  const event = nextRaceEvent.value
  const raceTs = parseIsoTimestamp(event?.startsAt)
  const startTs = racePrepWindowStartTs.value
  const raceTrack = event?.trackName || nextRaceName.value

  return sessions.filter((session) => {
    if (!tracksMatch(session.meta?.track, raceTrack)) return false
    const sessionTs = parseIsoTimestamp(session.meta?.date_start)
    if (sessionTs === null) return false
    if (startTs !== null && sessionTs < startTs) return false
    if (raceTs !== null && sessionTs > raceTs) return false
    return true
  })
})

const raceSpecificTotals = computed(() => {
  const totals = {
    sessions: 0,
    minutes: 0,
    byType: {
      practice: 0,
      qualify: 0,
      race: 0
    }
  }

  for (const session of raceSpecificSessions.value) {
    totals.sessions += 1
    totals.minutes += Math.round(Number(session.summary?.totalTime || 0) / 60000)

    if (session.meta?.session_type === SESSION_TYPE_PRACTICE) {
      totals.byType.practice += 1
    } else if (session.meta?.session_type === SESSION_TYPE_QUALIFY) {
      totals.byType.qualify += 1
    } else if (session.meta?.session_type === SESSION_TYPE_RACE) {
      totals.byType.race += 1
    }
  }

  return totals
})

const raceSpecificScopeLabel = computed(() => {
  if (!hasNextRace.value) return ''
  const track = nextRaceName.value
  if (racePrepWindowStartLabel.value) {
    return `Conteggio solo su ${track} dal ${racePrepWindowStartLabel.value} alla gara.`
  }
  return `Conteggio solo su ${track} fino alla data gara.`
})

const plannedTrainings = computed(() => {
  if (!hasNextRace.value) return 0
  const daysLeft = nextRaceDaysLeft.value ?? 21
  if (daysLeft <= 7) return 4
  if (daysLeft <= 14) return 6
  if (daysLeft <= 28) return 8
  return 10
})

const completedTrainings = computed(() => raceSpecificTotals.value.sessions)

const reminderStatus = computed(() => {
  if (!hasNextRace.value) {
    return {
      label: 'No gara',
      tone: 'idle'
    } as const
  }

  if (plannedTrainings.value <= 0) {
    return {
      label: 'Da impostare',
      tone: 'idle'
    } as const
  }

  const ratio = completedTrainings.value / plannedTrainings.value
  if (ratio < 0.6) {
    return {
      label: 'Ritardo',
      tone: 'behind'
    } as const
  }

  if (ratio > 1) {
    return {
      label: 'Avanti',
      tone: 'ahead'
    } as const
  }

  return {
    label: 'In linea',
    tone: 'on-track'
  } as const
})

const reminderProgress = computed(() => {
  if (plannedTrainings.value <= 0) return 0
  const ratio = completedTrainings.value / plannedTrainings.value
  return Math.max(0, Math.min(100, Math.round(ratio * 100)))
})

const trainingsRemaining = computed(() => {
  return Math.max(plannedTrainings.value - completedTrainings.value, 0)
})

const reminderDeltaText = computed(() => {
  if (!hasNextRace.value) return 'Aggiungi la prossima gara in Area Pilota per attivare il piano.'
  if (plannedTrainings.value <= 0) return 'Target non disponibile.'
  const delta = plannedTrainings.value - completedTrainings.value
  if (delta > 0) {
    return `${delta} ${delta === 1 ? 'allenamento da completare' : 'allenamenti da completare'} prima della gara.`
  }
  if (delta === 0) return 'Target centrato.'
  const overTarget = Math.abs(delta)
  return `${overTarget} ${overTarget === 1 ? 'allenamento oltre target' : 'allenamenti oltre target'}.`
})

const workedFocusItems = computed(() => {
  const items: string[] = []
  if (raceSpecificTotals.value.byType.practice > 0) items.push('Pulizia base')
  if (raceSpecificTotals.value.byType.qualify > 0) items.push('Giro secco')
  if (raceSpecificTotals.value.byType.race > 0) items.push('Passo gara')
  return items
})

const todoFocusItems = computed(() => {
  const suggested = SCENARIO_FOCUS_MAP[selectedBriefingScenario.value] || []
  if (!workedFocusItems.value.length) return suggested
  const workedSet = new Set(workedFocusItems.value.map((value) => value.toLowerCase()))
  return suggested.filter((item) => !workedSet.has(item.toLowerCase()))
})

function setReminderSlide(nextSlide: DriverReminderSlide) {
  reminderSlide.value = nextSlide
}

function loadDriverReminderState() {
  if (typeof window === 'undefined') return
  const storedValue = window.localStorage.getItem(DRIVER_REMINDER_STORAGE_KEY)
  if (!storedValue) return

  try {
    const parsed = JSON.parse(storedValue) as Partial<{
      reminderSlide: DriverReminderSlide
    }>

    if (parsed.reminderSlide === 'recent' || parsed.reminderSlide === 'race') {
      reminderSlide.value = parsed.reminderSlide
    }
  } catch {
    // Ignore invalid local persistence and keep defaults.
  }
}

function saveDriverReminderState() {
  if (typeof window === 'undefined') return
  const payload = JSON.stringify({
    reminderSlide: reminderSlide.value
  })
  window.localStorage.setItem(DRIVER_REMINDER_STORAGE_KEY, payload)
}

watch(reminderSlide, saveDriverReminderState)

const goToTrack = (track: { id: string } | null) => {
  if (!track?.id) return
  const trackId = track.id

  if (pilotContext.value) {
    emit('go-to-track', trackId)
    return
  }

  router.push(`/piste/${trackId}`)
}
</script>

<template>
  <LayoutPageContainer>
    <div v-if="isLoading" class="loading-state">
      <p>Caricamento dati...</p>
    </div>
    
    <div v-else class="panoramica-wrapper">
      <!-- Top Section: lightweight coach briefing from recent projection data -->
      <div class="coach-sections">
        <div class="coach-hero coach-card" :class="briefingToneClass">
          <div class="coach-card__header">
            <div>
              <span class="eyebrow">Briefing operativo</span>
              <h2 class="coach-title">Oggi cosa fare</h2>
            </div>
            <span class="coach-chip">{{ briefingModeLabel }}</span>
          </div>

          <div class="training-choice">
            <div class="training-choice__summary">
              <span>Allenamento</span>
              <strong>{{ selectedTrainingLabel }}</strong>
            </div>
            <select v-model="briefingSelection" aria-label="Scegli allenamento">
              <option value="auto">Consigliato dai dati</option>
              <option v-for="scenario in briefingScenarioOptions" :key="scenario.id" :value="scenario.id">
                {{ scenario.label }}
              </option>
            </select>
          </div>

          <div class="insight-box" :class="[dailySuggestion.type, briefingToneClass]">
            <div class="insight-main">
              <h3>{{ dailySuggestion.message }}</h3>
              <p v-if="dailySuggestion.details">{{ dailySuggestion.details }}</p>
            </div>
            <NuxtLink :to="prepSessionTarget" class="action-btn">{{ dailySuggestion.ctaLabel || 'Apri allenamento' }}</NuxtLink>
          </div>

          <p class="coach-note">
            Il consiglio nasce dagli ultimi 7 giorni. Cambialo se oggi vuoi lavorare su un focus diverso.
          </p>
        </div>
        
        <div class="driver-state coach-card">
          <div class="coach-card__header driver-header">
            <h2 class="coach-title">Focus gara</h2>
            <div class="driver-header-actions">
              <div class="driver-segmented" role="tablist" aria-label="Vista reminder">
              <button
                type="button"
                role="tab"
                :aria-selected="reminderSlide === 'recent'"
                :class="{ 'is-active': reminderSlide === 'recent' }"
                @click="setReminderSlide('recent')"
              >
                Lettura
              </button>
              <button
                type="button"
                role="tab"
                :aria-selected="reminderSlide === 'race'"
                :class="{ 'is-active': reminderSlide === 'race' }"
                @click="setReminderSlide('race')"
              >
                Gara
              </button>
              </div>
            </div>
          </div>

          <div class="driver-slide-container">
            <Transition name="driver-slide" mode="out-in">
              <div v-if="reminderSlide === 'recent'" key="recent" class="driver-slide-panel driver-slide-panel--recent">
                <div class="driver-summary">
                  <p class="insight-text">{{ driverState.message }}</p>
                  <p v-if="driverState.details" class="coach-note">{{ driverState.details }}</p>
                </div>

                <div class="driver-metrics">
                  <div>
                    <span class="metric-value">{{ recentSessions }}</span>
                    <span class="metric-label">allenamenti</span>
                  </div>
                  <div>
                    <span class="metric-value">{{ Math.round(recentMinutes) }}</span>
                    <span class="metric-label">min totali</span>
                  </div>
                </div>

                <div class="recent-breakdown">
                  <div class="recent-breakdown__row">
                    <span>Pulizia</span>
                    <strong>{{ activityTotals.practice.sessions }}</strong>
                  </div>
                  <div class="recent-breakdown__row">
                    <span>Qualifica</span>
                    <strong>{{ activityTotals.qualify.sessions }}</strong>
                  </div>
                  <div class="recent-breakdown__row">
                    <span>Gara</span>
                    <strong>{{ activityTotals.race.sessions }}</strong>
                  </div>
                </div>
              </div>

              <div v-else key="race" class="driver-slide-panel driver-slide-panel--race">
                <div class="race-header-row">
                  <div>
                    <span class="race-title">{{ nextRaceName }}</span>
                    <span v-if="nextRaceSubtitle" class="race-subtitle">{{ nextRaceSubtitle }}</span>
                    <span class="race-date">{{ nextRaceDateLabel }}</span>
                    <span v-if="nextRaceDaysLeftLabel" class="race-days-chip">{{ nextRaceDaysLeftLabel }}</span>
                  </div>
                  <span class="race-status-chip" :class="`tone-${reminderStatus.tone}`">{{ reminderStatus.label }}</span>
                </div>

                <div class="race-metrics">
                  <div class="race-metric">
                    <span class="metric-value">{{ plannedTrainings }}</span>
                    <span class="metric-label">allenamenti target</span>
                  </div>
                  <div class="race-metric">
                    <span class="metric-value">{{ completedTrainings }}</span>
                    <span class="metric-label">registrati per gara</span>
                  </div>
                </div>

                <div class="race-type-breakdown">
                  <span class="race-type-chip">Pulizia {{ raceSpecificTotals.byType.practice }}</span>
                  <span class="race-type-chip">Qualifica {{ raceSpecificTotals.byType.qualify }}</span>
                  <span class="race-type-chip">Gara {{ raceSpecificTotals.byType.race }}</span>
                </div>

                <p class="race-remaining">{{ trainingsRemaining }} {{ trainingsRemaining === 1 ? 'allenamento restante' : 'allenamenti restanti' }}</p>
                <p v-if="raceSpecificScopeLabel" class="race-scope">{{ raceSpecificScopeLabel }}</p>
                <div class="progress-line" role="presentation">
                  <div class="progress-line__value" :style="{ width: `${reminderProgress}%` }" />
                </div>

                <div class="focus-grid">
                  <div class="focus-column">
                    <span class="focus-title">Gia lavorato</span>
                    <div class="focus-tags">
                      <span
                        v-for="item in workedFocusItems"
                        :key="item"
                        class="focus-tag focus-tag--done"
                      >
                        {{ item }}
                      </span>
                      <span v-if="workedFocusItems.length === 0" class="focus-empty">Nessun blocco allenato</span>
                    </div>
                  </div>

                  <div class="focus-column">
                    <span class="focus-title">Da lavorare</span>
                    <div class="focus-tags">
                      <span
                        v-for="item in todoFocusItems"
                        :key="item"
                        class="focus-tag"
                      >
                        {{ item }}
                      </span>
                    </div>
                  </div>
                </div>

                <p class="reminder-note">{{ reminderDeltaText }}</p>
              </div>
            </Transition>
          </div>
        </div>
      </div>

      <!-- Original Section: Data Grid -->
      <h2 class="section-title" style="margin-top: 32px; margin-bottom: 24px;">Panoramica Dati</h2>
      <div class="panoramica-grid">
        <!-- Top Left: Featured Car -->
        <CardsFeaturedCarCard 
          :car-name="lastCarName"
          :car-image="lastCarImage"
          subtitle="Ultima auto utilizzata"
          :date="lastCarDate"
        />
        
        <!-- Top Right: Ultima Pista -->
        <CardsTrackPerformanceCard
          title="Ultima pista"
          :track-name="lastTrackName"
          :track-image="lastTrackImage"
          :best-qualy="lastTrackBestQualy"
          :best-qualy-grip="lastTrackBestQualyGrip"
          :best-race="lastTrackBestRace"
          :best-race-grip="lastTrackBestRaceGrip"
          :avg-time="lastTrackAvgTime"
          :avg-time-grip="lastTrackAvgTimeGrip"
          @click="goToTrack(lastTrack)"
        />
        
        <!-- Bottom Left: Activity -->
        <CardsActivityCard 
          :data="activityData"
          :practice-total="activityTotals.practice"
          :qualify-total="activityTotals.qualify"
          :race-total="activityTotals.race"
        />
        
        <!-- Bottom Right: Penultima Pista -->
        <CardsTrackPerformanceCard
          title="Penultima pista"
          :track-name="prevTrackName"
          :track-image="prevTrackImage"
          :best-qualy="prevTrackBestQualy"
          :best-qualy-grip="prevTrackBestQualyGrip"
          :best-race="prevTrackBestRace"
          :best-race-grip="prevTrackBestRaceGrip"
          :avg-time="prevTrackAvgTime"
          :avg-time-grip="prevTrackAvgTimeGrip"
          @click="goToTrack(prevTrack)"
        />
      </div>
    </div>
  </LayoutPageContainer>
</template>

<style lang="scss" scoped>
.panoramica-wrapper {
  display: flex;
  flex-direction: column;
}

.coach-sections {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 24px;
  align-items: stretch;
}

.coach-sections > .coach-card {
  align-self: stretch !important;
  height: 100%;
  min-height: 100%;
}

.coach-hero {
  min-width: 0;
  display: flex;
  flex-direction: column;
}

.panoramica-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  grid-auto-rows: 1fr;
  gap: 24px;
}

.coach-card {
  position: relative;
  min-height: 190px;
  padding: 24px;
  border-radius: 18px;
  overflow: hidden;
  --briefing-accent: 255, 59, 34;
  --briefing-accent-strong: #ff3b22;
  --briefing-accent-end: #ff8a00;
  background:
    radial-gradient(circle at top left, rgba(var(--briefing-accent), 0.12), transparent 34%),
    linear-gradient(145deg, rgba(26, 26, 36, 0.98), rgba(14, 14, 22, 0.98));
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 18px 45px rgba(0, 0, 0, 0.22);
}

.coach-card.tone-baseline {
  --briefing-accent: 40, 183, 255;
  --briefing-accent-strong: #28b7ff;
  --briefing-accent-end: #4fd1c5;
}

.coach-card.tone-pace {
  --briefing-accent: 255, 142, 41;
  --briefing-accent-strong: #ff8e29;
  --briefing-accent-end: #ffbf3f;
}

.coach-card.tone-race {
  --briefing-accent: 255, 59, 34;
  --briefing-accent-strong: #ff3b22;
  --briefing-accent-end: #ff8a00;
}

.coach-card.tone-clean {
  --briefing-accent: 255, 205, 64;
  --briefing-accent-strong: #ffcd40;
  --briefing-accent-end: #ff9f1c;
}

.coach-card.tone-success {
  --briefing-accent: 34, 197, 94;
  --briefing-accent-strong: #22c55e;
  --briefing-accent-end: #14b8a6;
}

.driver-state {
  min-width: 0;
  display: flex;
  flex-direction: column;
  --briefing-accent: 66, 120, 255;
  background:
    radial-gradient(circle at top left, rgba(var(--briefing-accent), 0.09), transparent 36%),
    linear-gradient(150deg, rgba(26, 24, 38, 0.98), rgba(16, 16, 26, 0.98));
  box-shadow: 0 14px 30px rgba(0, 0, 0, 0.2);
}

.coach-card::before {
  content: '';
  position: absolute;
  inset: 0;
  border-radius: inherit;
  padding: 1px;
  background: linear-gradient(135deg, rgba(var(--briefing-accent), 0.35), transparent 48%, rgba(var(--briefing-accent), 0.18));
  -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
  pointer-events: none;
}

.coach-card__header {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  align-items: flex-start;
  margin-bottom: 18px;
}

.eyebrow {
  display: block;
  margin-bottom: 6px;
  color: rgba(255, 255, 255, 0.42);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}

.coach-chip {
  flex-shrink: 0;
  padding: 5px 9px;
  border-radius: 999px;
  border: 1px solid rgba(var(--briefing-accent), 0.34);
  background: rgba(var(--briefing-accent), 0.1);
  color: rgba(255, 255, 255, 0.78);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.coach-chip--muted {
  border-color: rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.06);
}

.coach-title, .section-title {
  color: var(--text-primary);
  font-size: var(--font-size-xl, 24px);
  margin: 0;
  font-weight: 600;
}

.insight-box {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  column-gap: clamp(32px, 4vw, 52px);
  row-gap: 18px;
  align-items: center;
  padding: 18px 20px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.045);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-left: 4px solid rgba(255, 255, 255, 0.24);
}
.insight-box.actionable {
  border-left-color: var(--briefing-accent-strong);
  background: linear-gradient(90deg, rgba(var(--briefing-accent), 0.13), rgba(255, 255, 255, 0.035));
}
.insight-box.positive {
  border-left-color: var(--briefing-accent-strong);
  background: linear-gradient(90deg, rgba(var(--briefing-accent), 0.13), rgba(255, 255, 255, 0.035));
}
.insight-main {
  max-width: 430px;
  min-width: 0;
}
.insight-box h3 {
  margin: 0 0 8px 0;
  color: var(--text-primary);
  font-size: var(--font-size-lg, 18px);
}
.insight-box p {
  display: -webkit-box;
  overflow: hidden;
  margin: 0;
  color: var(--text-secondary);
  line-height: 1.45;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

.training-choice {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(210px, 0.42fr);
  gap: 12px;
  align-items: center;
  margin-bottom: 14px;
  padding: 12px 14px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.045);
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.training-choice__summary {
  min-width: 0;
}

.training-choice span {
  display: block;
  color: rgba(255, 255, 255, 0.46);
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.training-choice strong {
  display: block;
  margin-top: 5px;
  color: #fff;
  font-size: 17px;
  font-weight: 900;
  line-height: 1.1;
}

.training-choice select {
  width: 100%;
  min-height: 42px;
  padding: 9px 12px;
  border-radius: 11px;
  border: 1px solid rgba(var(--briefing-accent), 0.32);
  background: rgba(255, 255, 255, 0.08);
  color: #fff;
  font-weight: 800;
  outline: none;
}

.training-choice select:focus {
  border-color: rgba(var(--briefing-accent), 0.62);
  box-shadow: 0 0 0 3px rgba(var(--briefing-accent), 0.16);
}

.training-choice option {
  color: #111;
}

.action-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 42px;
  padding: 10px 16px;
  background: linear-gradient(135deg, var(--briefing-accent-strong), var(--briefing-accent-end));
  color: #fff;
  border-radius: 999px;
  text-decoration: none;
  font-weight: 800;
  white-space: nowrap;
  justify-self: end;
  box-shadow: 0 10px 24px rgba(var(--briefing-accent), 0.2);
  transition: transform 0.2s, box-shadow 0.2s;
}
.action-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 14px 28px rgba(var(--briefing-accent), 0.28);
}

.insight-text {
  color: var(--text-secondary);
  font-size: var(--font-size-md, 16px);
  margin: 0 0 8px 0;
}

.coach-note {
  margin: 14px 0 0 0;
  color: rgba(255, 255, 255, 0.52);
  font-size: 13px;
  line-height: 1.55;
}

.coach-hero .coach-note {
  margin-top: auto;
}

.driver-header {
  align-items: center;
  margin-bottom: 16px;
}

.driver-header-actions {
  display: flex;
  justify-content: flex-end;
}

.driver-segmented {
  display: inline-grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  padding: 3px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.04);
}

.driver-segmented button {
  min-height: 30px;
  padding: 0 12px;
  border: 0;
  border-radius: 999px;
  background: transparent;
  color: rgba(255, 255, 255, 0.64);
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.01em;
  cursor: pointer;
  transition: color 160ms ease, background 180ms ease;
}

.driver-segmented button.is-active {
  background: rgba(255, 255, 255, 0.13);
  color: #fff;
}

.driver-slide-container {
  display: flex;
  flex: 1;
  min-height: 0;
}

.driver-slide-panel {
  display: flex;
  flex-direction: column;
  width: 100%;
  min-height: 100%;
}

.driver-slide-panel--recent {
  gap: 14px;
}

.driver-summary {
  min-height: 0;
}

.driver-slide-panel .coach-note {
  margin-top: 10px;
}

.driver-metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: auto;
}

.driver-metrics > div {
  padding: 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.045);
  border: 1px solid rgba(255, 255, 255, 0.07);
}

.recent-breakdown {
  display: grid;
  gap: 6px;
  padding: 10px 12px;
  border-radius: 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(255, 255, 255, 0.02);
}

.recent-breakdown__row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: rgba(255, 255, 255, 0.7);
  font-size: 12px;
  line-height: 1.2;
}

.recent-breakdown__row strong {
  color: #fff;
  font-size: 13px;
  font-weight: 800;
}

.metric-value {
  display: block;
  color: #fff;
  font-size: 22px;
  font-weight: 800;
  line-height: 1;
}

.metric-label {
  display: block;
  margin-top: 6px;
  color: rgba(255, 255, 255, 0.46);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.driver-slide-panel--race {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.race-header-row {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: flex-start;
}

.race-title {
  display: block;
  color: #fff;
  font-size: 18px;
  font-weight: 800;
  line-height: 1.1;
}

.race-subtitle {
  display: block;
  margin-top: 3px;
  color: rgba(255, 255, 255, 0.58);
  font-size: 12px;
  font-weight: 700;
}

.race-date {
  display: block;
  margin-top: 2px;
  color: rgba(255, 255, 255, 0.54);
  font-size: 12px;
  font-weight: 700;
}

.race-days-chip {
  display: inline-flex;
  align-items: center;
  margin-top: 8px;
  padding: 4px 10px;
  border-radius: 999px;
  border: 1px solid rgba(64, 156, 255, 0.4);
  background: rgba(64, 156, 255, 0.14);
  color: rgba(214, 236, 255, 0.96);
  font-size: 12px;
  font-weight: 800;
  line-height: 1;
  letter-spacing: 0.02em;
}

.race-status-chip {
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  background: rgba(255, 255, 255, 0.08);
  color: rgba(255, 255, 255, 0.88);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.race-status-chip.tone-behind {
  border-color: rgba(255, 149, 0, 0.45);
  background: rgba(255, 149, 0, 0.14);
  color: rgba(255, 210, 143, 0.96);
}

.race-status-chip.tone-on-track {
  border-color: rgba(52, 199, 89, 0.45);
  background: rgba(52, 199, 89, 0.14);
  color: rgba(183, 255, 205, 0.96);
}

.race-status-chip.tone-ahead {
  border-color: rgba(64, 156, 255, 0.45);
  background: rgba(64, 156, 255, 0.14);
  color: rgba(191, 226, 255, 0.96);
}

.race-status-chip.tone-idle {
  border-color: rgba(255, 255, 255, 0.2);
  background: rgba(255, 255, 255, 0.06);
  color: rgba(255, 255, 255, 0.78);
}

.race-metrics {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.race-metric {
  padding: 11px;
  border-radius: 10px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.06);
}

.race-type-breakdown {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.race-type-chip {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 0 9px;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.03);
  color: rgba(255, 255, 255, 0.8);
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
}

.race-remaining {
  margin: 0;
  color: rgba(255, 255, 255, 0.68);
  font-size: 12px;
  font-weight: 700;
  line-height: 1.35;
}

.race-scope {
  margin: 0;
  color: rgba(255, 255, 255, 0.5);
  font-size: 11px;
  line-height: 1.35;
}

.progress-line {
  height: 7px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.1);
  overflow: hidden;
}

.progress-line__value {
  height: 100%;
  border-radius: inherit;
  background: linear-gradient(90deg, #4fd1c5, #28b7ff);
  transition: width 220ms ease;
}

.focus-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.focus-column {
  display: grid;
  gap: 6px;
}

.focus-title {
  color: rgba(255, 255, 255, 0.54);
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.focus-tags {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.focus-tag {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 25px;
  padding: 1px 10px 0;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.15);
  background: rgba(255, 255, 255, 0.03);
  color: rgba(255, 255, 255, 0.78);
  font-size: 11px;
  font-weight: 700;
  line-height: 1;
  white-space: nowrap;
}

.focus-tag--done {
  border-color: rgba(52, 199, 89, 0.44);
  background: rgba(52, 199, 89, 0.14);
  color: rgba(193, 255, 214, 0.95);
}

.focus-empty {
  color: rgba(255, 255, 255, 0.42);
  font-size: 11px;
}

.reminder-note {
  margin: auto 0 0;
  color: rgba(255, 255, 255, 0.58);
  font-size: 12px;
  line-height: 1.45;
}

.driver-slide-enter-active,
.driver-slide-leave-active {
  transition: opacity 190ms ease, transform 190ms ease;
}

.driver-slide-enter-from,
.driver-slide-leave-to {
  opacity: 0;
  transform: translateY(6px);
}

.mini-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: var(--spacing-lg, 16px);
}

.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 300px;
  color: var(--color-text-muted);
}

@media (max-width: 768px) {
  .coach-sections {
    grid-template-columns: 1fr;
  }

  .insight-box {
    grid-template-columns: 1fr;
  }

  .insight-main {
    max-width: none;
  }

  .action-btn {
    width: 100%;
  }

  .training-choice {
    grid-template-columns: 1fr;
  }

  .training-choice select {
    width: 100%;
  }

  .panoramica-grid {
    grid-template-columns: 1fr;
  }
}
</style>
