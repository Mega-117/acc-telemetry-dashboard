<script setup lang="ts">
// ============================================
// PanoramicaPage - Overview with 2x2 card grid
// Projection-first via telemetry gateway
// ============================================

import { ref, computed, watch } from 'vue'
import { useTelemetryGateway } from '~/composables/useTelemetryGateway'
import type { OverviewProjection } from '~/types/overviewProjections'

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
const targetUserId = usePilotContext()
const telemetryGateway = useTelemetryGateway()
const { isLoading } = telemetryGateway

const overviewProjection = ref<OverviewProjection | null>(null)
const emptyActivityTotals = {
  practice: { minutes: 0, sessions: 0 },
  qualify: { minutes: 0, sessions: 0 },
  race: { minutes: 0, sessions: 0 }
}

watch(
  () => targetUserId.value,
  async () => {
    overviewProjection.value = await telemetryGateway.getOverviewProjection(targetUserId.value || undefined)
  },
  { immediate: true }
)

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
const lastTrackBestRace = computed(() => lastTrack.value?.bestRace || '--:--.---')
const lastTrackAvgTime = computed(() => lastTrack.value?.bestAvgRace || '--:--.---')
const prevTrackBestQualy = computed(() => prevTrack.value?.bestQualy || '--:--.---')
const prevTrackBestRace = computed(() => prevTrack.value?.bestRace || '--:--.---')
const prevTrackAvgTime = computed(() => prevTrack.value?.bestAvgRace || '--:--.---')
const lastTrackImage = computed(() => getPublicPath(lastTrack.value?.image || '/tracks/track_default.png'))
const prevTrackImage = computed(() => getPublicPath(prevTrack.value?.image || '/tracks/track_default.png'))

const emit = defineEmits<{
  'go-to-track': [trackId: string]
}>()

const pilotContext = usePilotContext()
const router = useRouter()

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
        :avg-time="lastTrackAvgTime"
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
        :avg-time="prevTrackAvgTime"
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
