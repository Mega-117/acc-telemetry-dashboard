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

const { getPublicPath } = usePublicPath()

// Get pilot context (will be set when coach views a pilot)
const targetUserId = usePilotContext()

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

// Load on mount - use pilot context if available
onMounted(async () => {
  await loadSessions(targetUserId.value || undefined)
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
  monza: '/tracks/track_monza.png',
  donington: '/tracks/track_donington.png',
  spa: '/tracks/track_spa.png',
  paul_ricard: '/tracks/track_paul_ricard.png',
  valencia: '/tracks/track_valencia.png',
  barcelona: '/tracks/track_barcelona.png',
  brands_hatch: '/tracks/track_brands_hatch.png',
  hungaroring: '/tracks/track_hungaroring.png',
  imola: '/tracks/track_imola.png',
  kyalami: '/tracks/track_kyalami.png',
  laguna_seca: '/tracks/track_laguna_seca.png',
  misano: '/tracks/track_misano.png',
  mount_panorama: '/tracks/track_mount_panorama.png',
  nurburgring: '/tracks/track_nurburgring.png',
  oulton_park: '/tracks/track_oulton_park.png',
  silverstone: '/tracks/track_silverstone.png',
  snetterton: '/tracks/track_snetterton.png',
  suzuka: '/tracks/track_suzuka.png',
  watkins_glen: '/tracks/track_watkins_glen.png',
  zandvoort: '/tracks/track_zandvoort.png',
  zolder: '/tracks/track_zolder.png',
  cota: '/tracks/track_cota.png',
  indianapolis: '/tracks/track_indianapolis.png',
  red_bull_ring: '/tracks/track_red_bull_ring.png',
}

const lastTrackImage = computed(() => {
  const trackId = lastTrack.value?.track.toLowerCase().replace(/[^a-z0-9]/g, '_') || ''
  const imagePath = trackImages[trackId]
  return imagePath ? getPublicPath(imagePath) : spaImg
})

const prevTrackImage = computed(() => {
  const trackId = prevTrack.value?.track.toLowerCase().replace(/[^a-z0-9]/g, '_') || ''
  const imagePath = trackImages[trackId]
  return imagePath ? getPublicPath(imagePath) : monzaImg
})

// Emit to parent for navigation (used when in coach pilot view)
const emit = defineEmits<{
  'go-to-track': [trackId: string]
}>()

// Router for direct navigation
const router = useRouter()

// Navigation handlers
const goToTrack = (track: { track: string } | null) => {
  if (!track) return
  const trackId = track.track.toLowerCase().replace(/[^a-z0-9]/g, '_')
  
  // Emit for parent component (coach view)
  emit('go-to-track', trackId)
  
  // Also navigate directly via router for standalone view
  router.push(`/piste/${trackId}`)
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
