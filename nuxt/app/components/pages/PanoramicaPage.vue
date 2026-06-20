<script setup lang="ts">
// ============================================
// PanoramicaPage - Overview with Virtual Coach
// ============================================

import { ref, computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useTelemetryGateway } from '~/composables/useTelemetryGateway'
import { useCoachInsights } from '~/composables/useCoachInsights'
import { usePilotContext, useTargetUserId } from '~/composables/usePilotContext'
import { usePublicPath } from '~/composables/usePublicPath'
import type { OverviewProjection } from '~/types/overviewProjections'
import type { CoachBriefingScenario } from '~/composables/useCoachInsights'


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
const emptyActivityTotals = {
  practice: { minutes: 0, sessions: 0 },
  qualify: { minutes: 0, sessions: 0 },
  race: { minutes: 0, sessions: 0 }
}


async function loadOverview() {
  const projection = await telemetryGateway.getOverviewProjection(targetUserId.value || undefined)
  overviewProjection.value = projection
}


function handleCacheInvalidated(event: Event) {
  const detail = (event as CustomEvent<{ uid?: string | null; scope?: string }>).detail || {}
  if (!targetUserId.value) return
  if (detail.uid && detail.uid !== targetUserId.value) return

  void loadOverview()

}

watch(
  () => targetUserId.value,
  async () => {
    await loadOverview()
  },
  { immediate: true }
)

onMounted(() => {
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

const emit = defineEmits<{
  'go-to-track': [trackId: string]
}>()

const router = useRouter()

const { getDailySuggestionScenarios, generateDailySuggestion } = useCoachInsights()
const briefingSelection = ref<'auto' | CoachBriefingScenario>('auto')
const briefingScenarioOptions = getDailySuggestionScenarios()

const recommendedBriefingScenario = computed<CoachBriefingScenario>(() => {
  return generateDailySuggestion(activityData.value, null).scenario || 'clean_laps'
})

const selectedBriefingScenario = computed<CoachBriefingScenario>(() => {
  return briefingSelection.value === 'auto' ? recommendedBriefingScenario.value : briefingSelection.value
})

const dailySuggestion = computed(() => {
  return generateDailySuggestion(
    activityData.value,
    briefingSelection.value === 'auto' ? null : selectedBriefingScenario.value
  )
})

const briefingToneClass = computed(() => `tone-${dailySuggestion.value.tone || 'race'}`)
const selectedTrainingLabel = computed(() => {
  return briefingScenarioOptions.find((scenario) => scenario.id === selectedBriefingScenario.value)?.label || 'Pulizia'
})
const briefingModeLabel = computed(() => {
  if (briefingSelection.value !== 'auto') return 'Scelta manuale'
  return dailySuggestion.value.isDataDriven === false ? 'Dati insufficienti' : '7 giorni'
})
const dailySuggestionReliabilityNote = computed(() => {
  if (briefingSelection.value !== 'auto') {
    return 'Scenario scelto manualmente. Il riepilogo delle sessioni recenti resta visibile nel box Attivita recenti.'
  }
  if (dailySuggestion.value.isDataDriven === false) {
    return 'Il consiglio resta prudente finche non ci sono minuti recenti misurabili.'
  }
  return 'Il consiglio nasce dagli ultimi 7 giorni. Cambialo se oggi vuoi lavorare su un focus diverso.'
})


const prepSessionTarget = computed(() => ({
  path: '/preparazione',
  query: {
    scenario: dailySuggestion.value.scenario || 'race_real'
  }
}))
const pilotAreaTarget = computed(() => ({ path: '/area-pilota' }))

const recentMinutes = computed(() => {
  return activityTotals.value.practice.minutes + activityTotals.value.qualify.minutes + activityTotals.value.race.minutes
})

const recentSessions = computed(() => {
  return activityTotals.value.practice.sessions + activityTotals.value.qualify.sessions + activityTotals.value.race.sessions
})

const recentActivityTitle = computed(() => {
  if (recentSessions.value <= 0) return 'Nessuna sessione negli ultimi 7 giorni'
  const sessionLabel = recentSessions.value === 1 ? 'sessione registrata' : 'sessioni registrate'
  return `Ultimi 7 giorni: ${recentSessions.value} ${sessionLabel}`
})

const recentActivityDescription = computed(() => {
  if (recentSessions.value <= 0) {
    return 'Appena registri nuove sessioni, qui vedrai volume, minuti totali e distribuzione tra pratica, qualifica e gara.'
  }
  return 'Riepilogo delle sessioni effettive salvate: volume totale, minuti guidati e distribuzione per tipo sessione.'
})

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
            {{ dailySuggestionReliabilityNote }}
          </p>
        </div>
        
        <div class="driver-state coach-card">
          <div class="coach-card__header driver-header">
            <div>
              <span class="eyebrow">Ultimi 7 giorni</span>
              <h2 class="coach-title">Attivita recenti</h2>
            </div>
          </div>

          <div class="driver-slide-container">
            <div class="driver-slide-panel driver-slide-panel--recent">
              <div class="driver-summary">
                <p class="insight-text">{{ recentActivityTitle }}</p>
                <p class="coach-note">{{ recentActivityDescription }}</p>
              </div>

              <div class="driver-metrics">
                <div>
                  <span class="metric-value">{{ recentSessions }}</span>
                  <span class="metric-label">sessioni</span>
                </div>
                <div>
                  <span class="metric-value">{{ Math.round(recentMinutes) }}</span>
                  <span class="metric-label">min totali</span>
                </div>
              </div>

              <div class="recent-breakdown" aria-label="Sessioni per tipo negli ultimi 7 giorni">
                <div class="recent-breakdown__row">
                  <span>Pratica</span>
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

.action-btn--secondary {
  justify-self: start;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.08);
  box-shadow: none;
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
