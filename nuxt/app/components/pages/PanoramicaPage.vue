<script setup lang="ts">
// ============================================
// PanoramicaPage - latest drive and racing overview
// ============================================

import { computed, onBeforeUnmount, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useTelemetryGateway } from '~/composables/useTelemetryGateway'
import { usePilotContext, useTargetUserId } from '~/composables/usePilotContext'
import { useOverviewProjection } from '~/composables/useOverviewProjection'


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

const pilotContext = usePilotContext()
const targetUserId = useTargetUserId()
const telemetryGateway = useTelemetryGateway()
const overview = useOverviewProjection(uid => telemetryGateway.getOverviewProjection(uid))
const { projection: overviewProjection, status: overviewStatus } = overview
const isOverviewPlaceholder = computed(() => !overviewProjection.value && overviewStatus.value !== 'empty')
const emptyActivityTotals = {
  practice: { minutes: 0, sessions: 0 },
  qualify: { minutes: 0, sessions: 0 },
  race: { minutes: 0, sessions: 0 }
}


async function loadOverview() {
  await overview.load(targetUserId.value)
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
  { immediate: true, flush: 'sync' }
)

onMounted(() => {
  window.addEventListener('acc:telemetry-cache-invalidated', handleCacheInvalidated)
})

onBeforeUnmount(() => {
  overview.dispose()
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

const lastCarName = computed(() => overviewProjection.value?.lastCar.displayName || 'Nessuna auto')
const lastCarDate = computed(() => overviewProjection.value?.lastCar.lastUsedDate || 'Nessuna sessione registrata')
const lastTrack = computed(() => overviewProjection.value?.lastTrack || null)
const lastTrackName = computed(() => lastTrack.value?.name || 'La tua prossima pista')
const lastSession = computed(() => overviewProjection.value?.lastSession || null)
const performanceColumns = computed(() => [
  { label: 'Quali', best: lastTrack.value?.bestQualy, grip: lastTrack.value?.bestQualyGrip, session: lastSession.value?.bestQualy },
  { label: 'Race', best: lastTrack.value?.bestRace, grip: lastTrack.value?.bestRaceGrip, session: lastSession.value?.bestRace },
  { label: 'AVG', best: lastTrack.value?.bestAvgRace, grip: lastTrack.value?.bestAvgRaceGrip, session: lastSession.value?.bestAvgRace },
])
const emit = defineEmits<{
  'go-to-track': [trackId: string]
  'go-to-session': [sessionId: string]
}>()
const router = useRouter()
function goToTrack() {
  if (!lastTrack.value?.id) return
  if (pilotContext.value) emit('go-to-track', lastTrack.value.id)
  else router.push(`/piste/${encodeURIComponent(lastTrack.value.id)}`)
}
function goToSession() {
  if (!lastSession.value?.id) return
  if (pilotContext.value) emit('go-to-session', lastSession.value.id)
  else router.push(`/sessioni/${encodeURIComponent(lastSession.value.id)}`)
}
</script>

<template>
  <LayoutPageContainer>
    <p v-if="overviewStatus === 'error'" class="overview-error" role="status">
      Dati non disponibili. <button type="button" @click="loadOverview">Riprova</button>
    </p>
    <div class="racing-overview" :aria-busy="overviewStatus === 'pending'">
      <section class="last-drive racing-panel" :class="{ 'overview-placeholder': isOverviewPlaceholder }" :inert="isOverviewPlaceholder" aria-label="Ultima sessione e migliori tempi">
        <div class="last-drive__hero">
          <img :src="lastCarImage" :alt="lastCarName" class="last-drive__image" />
          <div class="last-drive__identity">
            <h1>{{ lastTrackName }}</h1>
            <h2>{{ lastCarName }}</h2>
            <p>{{ lastCarDate }}</p>
          </div>
        </div>
        <div class="last-drive__results">
          <table class="performance-table" aria-label="Best storici pista e best ultima sessione">
            <tbody>
              <tr>
                <td v-for="column in performanceColumns" :key="column.label">
                  <span class="time-label">Best {{ column.label }}</span>
                  <strong>{{ column.best || '--:--.---' }}</strong>
                  <abbr v-if="column.grip" class="grip-badge" :title="column.grip">{{ column.grip.slice(0, 3).toUpperCase() }}</abbr>
                </td>
              </tr>
              <tr>
                <td v-for="column in performanceColumns" :key="column.label">
                  <span class="time-label">Last session {{ column.label }}</span>
                  <strong>{{ column.session || '--:--.---' }}</strong>
                </td>
              </tr>
            </tbody>
          </table>
          <div class="last-drive__actions">
            <button class="racing-button" :disabled="!lastTrack" @click="goToTrack">Dettaglio pista</button>
            <button class="racing-button racing-button--primary" :disabled="!lastSession?.id" @click="goToSession">Ultima sessione</button>
          </div>
        </div>
        <span v-if="isOverviewPlaceholder" class="overview-loading-label" role="status">Caricamento dati…</span>
      </section>

      <aside class="racing-overview__side">
        <OverviewUpcomingRacesCard :user-id="targetUserId" racing />
        <CardsActivityCard class="overview-activity" :data="activityData" :practice-total="activityTotals.practice" :qualify-total="activityTotals.qualify" :race-total="activityTotals.race" racing :aria-busy="isOverviewPlaceholder" />
        <section class="training-panel racing-panel">
          <div><h2>Allenamenti</h2><p>Migliora il tuo tempo in pista</p></div>
          <NuxtLink to="/preparazione?scenario=tracktitan_input" class="racing-button racing-button--primary">Esplora allenamenti</NuxtLink>
        </section>
      </aside>
    </div>
  </LayoutPageContainer>
</template>

<style scoped lang="scss">
.racing-overview { display: grid; grid-template-columns: minmax(0, 1.42fr) minmax(0, 1fr); gap: 16px; color: #f5f5f5; }
.racing-panel { border: 1px solid #b4b4b4; background: transparent; min-width: 0; }
.last-drive { display: flex; flex-direction: column; position: relative; }
.last-drive__hero { position: relative; flex: 1; min-height: 340px; }
.last-drive__image { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center 42%; mask-image: linear-gradient(#000 55%, #000b 74%, transparent 100%); }
.last-drive__identity { position: absolute; bottom: 20px; left: 24px; right: 24px; text-shadow: 0 2px 12px #000; }
.last-drive__identity h1, .last-drive__identity h2 { margin: 0; font-family: 'Racer Display', sans-serif; font-style: italic; font-weight: 700; text-transform: uppercase; line-height: 1.13; }
.last-drive__identity h1 { font-size: clamp(28px, 3vw, 48px); letter-spacing: -.025em; }
.last-drive__identity h2 { font-size: clamp(20px, 2vw, 31px); margin-top: 3px; }
.last-drive__identity p { margin: 8px 0 0; font-size: 13px; text-transform: uppercase; letter-spacing: 2px; }
.last-drive__results { padding: 0 22px 18px; }
.performance-table { width: 100%; table-layout: fixed; border-collapse: collapse; background: transparent; }
.performance-table tr { border-bottom: 1px solid #ffffff24; }
.performance-table td { position: relative; padding: 14px 18px; vertical-align: top; }
.performance-table td + td::before { content: ''; position: absolute; left: 0; top: 14px; bottom: 14px; width: 1px; background: #ffffff65; }
.time-label { display: block; font: 400 12px/1.3 'Arial Narrow', 'Segoe UI', sans-serif; text-transform: uppercase; color: #ddd; margin-bottom: 3px; }
.performance-table strong { font: italic 700 clamp(18px, 1.6vw, 25px)/1.2 'Racer Display', sans-serif; font-variant-numeric: tabular-nums; }
.grip-badge { display: inline-block; font-size: 9px; color: #c7c7c7; margin-left: 6px; text-decoration: none; }
.last-drive__actions { display: flex; justify-content: center; gap: 24px; padding-top: 18px; }
.last-drive__actions button { flex: 1; max-width: 280px; }
.racing-overview__side { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.overview-activity { flex: 1; }
.training-panel { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 18px; }
.training-panel h2 { font: italic 700 22px/1.2 'Racer Display', sans-serif; text-transform: uppercase; margin: 0 0 6px; }
.training-panel p { font: italic 13px/1.4 'Segoe UI', sans-serif; text-transform: uppercase; margin: 0; color: #ccc; }
.training-panel .racing-button { padding-inline: 20px; font-size: 12px; }
.overview-error { color: #ffafba; padding: 12px; }
.overview-error button { color: #fff; background: transparent; border: 1px solid #aaa; padding: 6px 12px; }
.overview-placeholder > :not(.overview-loading-label) { visibility: hidden; }
.overview-placeholder::after { content: ''; position: absolute; inset: 16px; background: #ffffff08; animation: loading-pulse 1.5s ease-in-out infinite alternate; }
.overview-loading-label { position: absolute; left: 24px; top: 24px; color: #ccc; }
@keyframes loading-pulse { to { opacity: .35; } }
@media (prefers-reduced-motion: reduce) { .overview-placeholder::after { animation: none; } }
@media (min-width: 1500px) { .last-drive__hero { min-height: 440px; } .training-panel { padding: 22px; } }
@media (max-width: 1050px) { .racing-overview { grid-template-columns: 1.2fr 1fr; gap: 12px; } .last-drive__results { padding-inline: 12px; } .performance-table td { padding-inline: 10px; } .training-panel { flex-direction: column; align-items: stretch; } .last-drive__actions { gap: 12px; } }
@media (max-width: 800px) { .racing-overview { grid-template-columns: 1fr; } .last-drive__hero { min-height: 390px; } .training-panel { flex-direction: row; } }
@media (max-width: 480px) { .last-drive__hero { min-height: 310px; } .last-drive__identity { left: 16px; } .performance-table td { padding-inline: 6px; } .time-label { font-size: 10px; } .grip-badge { display: block; margin: 3px 0 0; } .training-panel { flex-direction: column; } .last-drive__actions button { padding-inline: 8px; font-size: 12px; } }
</style>
