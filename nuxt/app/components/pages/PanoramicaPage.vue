<script setup lang="ts">
// ============================================
// PanoramicaPage - Overview with 2x2 card grid
// Uses Firebase data for real session info
// ============================================

import { ref, computed, onMounted } from 'vue'
import { 
  useTelemetryData, 
  formatLapTime,
  formatCarName,
  formatTrackName,
  formatDate
} from '~/composables/useTelemetryData'

// Car images
import mustangImg from '@/assets/images/cars/mustang_gt3.png'
import astonMartinImg from '@/assets/images/cars/aston_martin_gt3.png'
import ferrariImg from '@/assets/images/cars/ferrari_296_gt3.png'
import bmwImg from '@/assets/images/cars/bmw_m4_gt3.png'
import mclarenImg from '@/assets/images/cars/mclaren_720s_gt3.png'
import defaultCarImg from '@/assets/images/cars/default_gt3.png'

// Track images
import spaImg from '@/assets/images/tracks/spa.jpg'
import monzaImg from '@/assets/images/tracks/monza.jpg'

// Car image mapping (key patterns from session data)
const carImages: Record<string, string> = {
  'mustang': mustangImg,
  'ford_mustang': mustangImg,
  'amr': astonMartinImg,
  'aston': astonMartinImg,
  'aston_martin': astonMartinImg,
  'v8_vantage': astonMartinImg,
  'ferrari_296': ferrariImg,
  '296_gt3': ferrariImg,
  'bmw': bmwImg,
  'm4': bmwImg,
  'm4_gt3': bmwImg,
  'mclaren': mclarenImg,
  '720s': mclarenImg,
}

// Composable for public path
const { getPublicPath } = usePublicPath()

// Telemetry data
const { 
  sessions, 
  lastSession,
  lastUsedCar, 
  lastUsedTrack, 
  trackStats,
  getActivityData,
  activityTotals,
  isLoading, 
  loadSessions 
} = useTelemetryData()

// Activity chart data
const activityData = computed(() => getActivityData(7))

// Load on mount
onMounted(async () => {
  await loadSessions()
})

// === COMPUTED DATA ===

// Get car image based on car name from session
const lastCarImage = computed(() => {
  if (!lastUsedCar.value) return defaultCarImg
  const carName = lastUsedCar.value.toLowerCase()
  
  // Try to find a matching image
  for (const [key, img] of Object.entries(carImages)) {
    if (carName.includes(key)) {
      return img
    }
  }
  
  // Fallback to default
  return defaultCarImg
})

// Last car info
const lastCarName = computed(() => {
  return lastUsedCar.value ? formatCarName(lastUsedCar.value).toUpperCase() : 'NESSUNA AUTO'
})

const lastCarDate = computed(() => {
  return lastSession.value ? formatDate(lastSession.value.meta.date_start) : '-'
})

// Get track stats sorted by last session date
const sortedTrackStats = computed(() => {
  return [...trackStats.value].sort((a, b) => 
    (b.lastSession || '').localeCompare(a.lastSession || '')
  )
})

// Last track (most recent)
const lastTrack = computed(() => {
  return sortedTrackStats.value[0] || null
})

const lastTrackName = computed(() => {
  return lastTrack.value ? formatTrackName(lastTrack.value.track).toUpperCase() : 'NESSUNA PISTA'
})

const lastTrackBestQualy = computed(() => {
  return lastTrack.value?.bestQualy ? formatLapTime(lastTrack.value.bestQualy) : '--:--.---'
})

const lastTrackBestRace = computed(() => {
  return lastTrack.value?.bestRace ? formatLapTime(lastTrack.value.bestRace) : '--:--.---'
})

// Second to last track
const prevTrack = computed(() => {
  return sortedTrackStats.value[1] || null
})

const prevTrackName = computed(() => {
  return prevTrack.value ? formatTrackName(prevTrack.value.track).toUpperCase() : 'NESSUNA PISTA'
})

const prevTrackBestQualy = computed(() => {
  return prevTrack.value?.bestQualy ? formatLapTime(prevTrack.value.bestQualy) : '--:--.---'
})

const prevTrackBestRace = computed(() => {
  return prevTrack.value?.bestRace ? formatLapTime(prevTrack.value.bestRace) : '--:--.---'
})

// Track images - use static mapping, fallback to default
const trackImages: Record<string, string> = {
  spa: '/tracks/track_spa.png',
  monza: '/tracks/track_monza.png',
  donington: '/tracks/track_donington.png',
  suzuka: '/tracks/track_suzuka.png',
  valencia: '/tracks/track_valencia.png',
}

const lastTrackImage = computed(() => {
  const trackId = lastTrack.value?.track.toLowerCase().replace(/[^a-z0-9]/g, '_') || ''
  return trackImages[trackId] || spaImg
})

const prevTrackImage = computed(() => {
  const trackId = prevTrack.value?.track.toLowerCase().replace(/[^a-z0-9]/g, '_') || ''
  return trackImages[trackId] || monzaImg
})

// Navigation handlers
const goToTrack = (track: { track: string } | null) => {
  if (!track) return
  const trackId = track.track.toLowerCase().replace(/[^a-z0-9]/g, '_')
  navigateTo(`/piste/${trackId}`)
}
</script>

<template>
  <LayoutPageContainer>
    <div v-if="isLoading" class="loading-state">
      <p>Caricamento dati...</p>
    </div>
    
    <div v-else class="panoramica-grid">
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
        :best-race="lastTrackBestRace"
        avg-time="--:--.---"
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
        :best-race="prevTrackBestRace"
        avg-time="--:--.---"
        @click="goToTrack(prevTrack)"
      />
    </div>
  </LayoutPageContainer>
</template>

<style lang="scss" scoped>
.panoramica-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  grid-auto-rows: 1fr;
  gap: 24px;
}

.loading-state {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 300px;
  color: var(--color-text-muted);
}

@media (max-width: 768px) {
  .panoramica-grid {
    grid-template-columns: 1fr;
  }
}
</style>
