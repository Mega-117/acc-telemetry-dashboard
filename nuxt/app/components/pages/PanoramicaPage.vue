<script setup lang="ts">
// ============================================
// PanoramicaPage - latest drive and racing overview
// ============================================

import GameContextTransition from '~/components/layout/GameContextTransition.vue'
import GameLogo from '~/components/layout/GameLogo.vue'
import { getCarCategory } from '~/utils/telemetryFormat'
import { computed, inject, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useTelemetryGateway } from '~/composables/useTelemetryGateway'
import { usePilotContext, useTargetUserId } from '~/composables/usePilotContext'
import { useOverviewProjection } from '~/composables/useOverviewProjection'
import { useGameContext } from '~/composables/useGameContext'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import { OVERVIEW_CAR_SIZES } from '~/utils/responsiveImage'
import { getOverviewCarImage } from '~/utils/overviewCarImage'
import { overviewEntryKey } from '~/services/auth/overviewEntryPreparation'
import type { OverviewProjection } from '~/types/overviewProjections'
import type { RaceCalendarEvent } from '~/repositories/raceCalendarRepository'
import { useI18n, type TranslationKey } from '~/i18n'
import { parseTelemetryDate } from '~/utils/telemetryFormat'

// PIP-555: `pending` = prepared before the cloud with nothing to show; the page stays
// "in caricamento" and loads at the cloud-ready event.
const props = defineProps<{ prepared?: { uid: string; projection: OverviewProjection | null; events: RaceCalendarEvent[]; pending?: boolean } }>()

const { t, locale, intlLocale } = useI18n()
const pilotContext = usePilotContext()
const targetUserId = useTargetUserId()
const { consultedGame } = useGameContext()
const { cloudSessionReady } = useFirebaseAuth()
// The legacy projection is ACC-only; common requests carry their explicit game.
const telemetryGateway = useTelemetryGateway('acc')
const entry = inject(overviewEntryKey, null)
const preparedForThisOwner = consultedGame.value === 'acc' && props.prepared?.uid === targetUserId.value
const overview = useOverviewProjection(uid => {
  if (consultedGame.value !== 'acc') return telemetryGateway.getCommonOverviewProjection(uid, consultedGame.value)
  return entry?.value?.takeProjection(uid) || telemetryGateway.getOverviewProjection(uid)
}, preparedForThisOwner && !props.prepared?.pending ? props.prepared : undefined)
// Whether what is on screen was computed with the cloud: a cloud-ready event then changes nothing.
let loadedWithCloud = preparedForThisOwner && !props.prepared?.pending && cloudSessionReady.value
const { projection: overviewProjection, status: overviewStatus } = overview
const calendarBusy = ref(false)
const isOverviewPlaceholder = computed(() => !overviewProjection.value && overviewStatus.value !== 'empty')
const emptyActivityTotals = {
  practice: { minutes: 0, sessions: 0 },
  qualify: { minutes: 0, sessions: 0 },
  race: { minutes: 0, sessions: 0 }
}


async function loadOverview() {
  loadedWithCloud = cloudSessionReady.value
  await overview.load(targetUserId.value)
}


function handleCacheInvalidated(event: Event) {
  const detail = (event as CustomEvent<{ uid?: string | null; scope?: string }>).detail || {}
  if (!targetUserId.value) return
  if (detail.uid && detail.uid !== targetUserId.value) return
  // PIP-555: the cloud arrived after the entry: reload only what was computed without it.
  if (detail.scope === 'cloud-ready' && loadedWithCloud) return

  void loadOverview()

}

let initial = true
watch(
  () => [targetUserId.value, consultedGame.value],
  async () => {
    if (initial && consultedGame.value === 'acc' && props.prepared?.uid === targetUserId.value) {
      initial = false
      return
    }
    initial = false
    overviewProjection.value = null
    await loadOverview()
  },
  { immediate: true, flush: 'sync' }
)

// PIP-555: the cloud may become ready before this page listens to the cloud-ready event
// (dashboard entry and page preparation take a couple of seconds): follow the state itself.
watch(cloudSessionReady, (ready) => {
  if (ready && !loadedWithCloud && targetUserId.value) void loadOverview()
}, { immediate: true })

onMounted(() => {
  window.addEventListener('acc:telemetry-cache-invalidated', handleCacheInvalidated)
})

onBeforeUnmount(() => {
  overview.dispose()
  window.removeEventListener('acc:telemetry-cache-invalidated', handleCacheInvalidated)
})

const activityData = computed(() => overviewProjection.value?.activity7d || [])
const activityTotals = computed(() => overviewProjection.value?.activityTotals || emptyActivityTotals)

const lastCarImage = computed(() => getOverviewCarImage(overviewProjection.value?.lastCar.rawName, consultedGame.value))

// PIP-665: the projection is cached with Italian placeholders and dates: Italian shows them as stored,
// other languages rebuild them at display time from the raw values (the cache is never rewritten).
const STORED_NO_CAR = ['Nessuna auto', 'NESSUNA AUTO']
const lastCarName = computed(() => {
  const stored = overviewProjection.value?.lastCar.displayName
  if (!stored || (locale.value !== 'it' && STORED_NO_CAR.includes(stored))) return t('overview.noCar')
  return stored
})
const lastCarDate = computed(() => {
  const stored = overviewProjection.value?.lastCar.lastUsedDate
  if (!stored || stored === 'Nessuna sessione registrata') return t('overview.noSession')
  const raw = overviewProjection.value?.lastSession?.date
  const date = locale.value === 'it' || !raw ? null : parseTelemetryDate(raw)
  return date ? date.toLocaleDateString(intlLocale.value, { day: 'numeric', month: 'short', year: 'numeric' }) : stored
})
const lastTrack = computed(() => overviewProjection.value?.lastTrack || null)
const lastTrackName = computed(() => lastTrack.value?.name || t('overview.nextTrack'))
const lastSession = computed(() => overviewProjection.value?.lastSession || null)
// Column labels are stored in Italian in the cached projection: shown through their key.
const COLUMN_KEYS: Record<string, TranslationKey> = { Qualifica: 'overview.columns.qualify', Gara: 'overview.columns.race', 'Media gara': 'overview.columns.avgRace' }
const columnLabel = (label: string) => COLUMN_KEYS[label] ? t(COLUMN_KEYS[label]) : label
const performanceColumns = computed(() => overviewProjection.value?.performanceColumns ?? [
  { label: 'Qualifica', best: lastTrack.value?.bestQualy, grip: lastTrack.value?.bestQualyGrip, session: lastSession.value?.bestQualy },
  { label: 'Gara', best: lastTrack.value?.bestRace, grip: lastTrack.value?.bestRaceGrip, session: lastSession.value?.bestRace },
  { label: 'Media gara', best: lastTrack.value?.bestAvgRace, grip: lastTrack.value?.bestAvgRaceGrip, session: lastSession.value?.bestAvgRace },
])
const emit = defineEmits<{
  'go-to-track': [trackId: string]
  'go-to-session': [sessionId: string]
  'go-to-stats': []
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
// PIP-619: the coach stays inside the pilot page (explicit pilot context), the pilot gets the route.
function goToStats() {
  if (pilotContext.value) emit('go-to-stats')
  else router.push('/statistiche')
}
</script>

<template>
  <LayoutPageContainer>
    <GameContextTransition :game-id="consultedGame" :busy="overviewStatus === 'pending' || calendarBusy">
    <p v-if="overviewStatus === 'error'" class="overview-error" role="status">
      {{ t('overview.dataUnavailable') }} <button type="button" @click="loadOverview">{{ t('common.retry') }}</button>
    </p>
    <div class="racing-overview" :aria-busy="overviewStatus === 'pending'">
      <section class="last-drive racing-panel" :class="{ 'overview-placeholder': isOverviewPlaceholder }" :inert="isOverviewPlaceholder" :aria-label="t('overview.lastDriveAria')">
        <div class="last-drive__hero">
          <UiResponsiveImage :src="lastCarImage" :alt="lastCarName" :sizes="OVERVIEW_CAR_SIZES" loading="eager" fetchpriority="high" class="last-drive__image" />
          <div class="last-drive__game"><GameLogo :game-id="consultedGame" /></div>
          <div class="last-drive__identity">
            <h1>{{ lastTrackName }}</h1>
            <h2>{{ lastCarName }}</h2>
            <p>{{ lastCarDate }}</p>
          </div>
        </div>
        <div class="last-drive__results">
          <table class="performance-table" :aria-label="t('overview.performanceAria')">
            <tbody>
              <tr>
                <td v-for="column in performanceColumns" :key="column.label">
                  <span class="time-label">{{ consultedGame === 'acc' ? t('overview.historyCategory', { category: getCarCategory(overviewProjection?.lastCar.rawName || '') }) : t('overview.historyCar') }} · {{ columnLabel(column.label) }}</span>
                  <strong>{{ column.best || '--:--.---' }}</strong>
                  <abbr v-if="column.grip" class="grip-badge" :title="column.grip">{{ column.grip.slice(0, 3).toUpperCase() }}</abbr>
                </td>
              </tr>
              <tr>
                <td v-for="column in performanceColumns" :key="column.label">
                  <span class="time-label">{{ t('overview.latest') }} · {{ columnLabel(column.label) }}</span>
                  <strong>{{ column.session || '--:--.---' }}</strong>
                </td>
              </tr>
            </tbody>
          </table>
          <div class="last-drive__actions">
            <button class="rc-btn" :disabled="!lastTrack" @click="goToTrack">{{ t('overview.trackDetail') }}<UiRacingIcon name="chevron" :size="16" class="rc-btn__arrow" /></button>
            <button class="rc-btn rc-btn--primary" :disabled="!lastSession?.id" @click="goToSession">{{ t('overview.lastSession') }}<UiRacingIcon name="chevron" :size="16" class="rc-btn__arrow" /></button>
          </div>
        </div>
        <span v-if="isOverviewPlaceholder" class="overview-loading-label" role="status">{{ t('common.loadingData') }}</span>
      </section>

      <aside class="racing-overview__side">
        <OverviewUpcomingRacesCard :user-id="targetUserId" :game-id="consultedGame" @loading="calendarBusy = $event" :initial-events="prepared?.events" :initial-user-id="prepared?.uid" racing />
        <CardsActivityCard class="overview-activity" :data="activityData" :practice-total="activityTotals.practice" :qualify-total="activityTotals.qualify" :race-total="activityTotals.race" :other-total="overviewProjection?.otherActivity" racing :aria-busy="isOverviewPlaceholder" :stats-link="consultedGame === 'acc'" @open-stats="goToStats" />
        <section class="training-panel racing-panel">
          <div><h2>{{ t('overview.training') }}</h2><p>{{ t('overview.trainingText') }}</p></div>
          <NuxtLink to="/preparazione?scenario=tracktitan_input" class="rc-btn rc-btn--primary">{{ t('overview.trainingCta') }}<UiRacingIcon name="chevron" :size="16" class="rc-btn__arrow" /></NuxtLink>
        </section>
      </aside>
    </div>
    </GameContextTransition>
  </LayoutPageContainer>
</template>

<style scoped lang="scss">
@use '@/assets/scss/racing-settings' as controls;
.racing-overview { display: grid; grid-template-columns: minmax(0, 1.42fr) minmax(0, 1fr); gap: 16px; color: #f5f5f5; }
.racing-panel { border: 1px solid var(--rc-section-line); background: transparent; min-width: 0; }
.last-drive { display: flex; flex-direction: column; position: relative; }
// The image fades onto black, not onto the animated background behind the card.
.last-drive__hero { position: relative; isolation: isolate; background: #020202; flex: 1; min-height: 340px; }
.last-drive__image { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; object-position: center 42%; mask-image: linear-gradient(#000 55%, #000b 74%, transparent 100%); }
.last-drive__hero::after { content: ''; position: absolute; top: 0; right: 0; width: 320px; max-width: 80%; height: 210px; pointer-events: none; clip-path: polygon(0 0, 100% 0, 100% 100%); background: linear-gradient(to bottom left, #000b, #0007 24%, #0003 40%, transparent 50%); }
.last-drive__game { position: absolute; top: 12px; right: 12px; width: clamp(120px, 13vw, 180px); padding: 14px 16px; z-index: 1; }
.last-drive__identity { position: absolute; bottom: 20px; left: 24px; right: 24px; text-shadow: 0 2px 12px #000; }
.last-drive__identity h1, .last-drive__identity h2 { margin: 0; font-family: 'Racer Display', sans-serif; font-style: italic; font-weight: 700; text-transform: uppercase; line-height: 1.13; }
.last-drive__identity h1 { font-size: clamp(28px, 3vw, 48px); letter-spacing: -.025em; }
.last-drive__identity h2 { font-size: clamp(20px, 2vw, 31px); margin-top: 3px; }
.last-drive__identity p { margin: 8px 0 0; font-size: 13px; text-transform: uppercase; letter-spacing: 2px; }
.last-drive__results { padding: 0 22px 18px; }
.performance-table { width: 100%; table-layout: fixed; border-collapse: collapse; background: transparent; }
.performance-table tr { border-bottom: 1px solid var(--rc-section-line); }
.performance-table td { position: relative; padding: 14px 18px; vertical-align: top; }
.performance-table td + td::before { content: ''; position: absolute; left: 0; top: 14px; bottom: 14px; width: 1px; background: var(--rc-section-line); }
// Etichette dei tempi nel font del sito (Inter), come le scritte di Attività: uguali su ogni PC.
.time-label { display: block; font: 400 11.5px/1.3 'Inter', 'Segoe UI', sans-serif; letter-spacing: .5px; text-transform: uppercase; color: #c4c4c4; margin-bottom: 5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.performance-table strong { font: italic 700 clamp(18px, 1.6vw, 25px)/1.2 'Racer Display', sans-serif; font-variant-numeric: tabular-nums; }
.grip-badge { display: inline-block; font-size: 9px; color: #c7c7c7; margin-left: 6px; text-decoration: none; }
.last-drive__actions { display: flex; justify-content: center; gap: 24px; padding-top: 18px; }
.last-drive__actions button { flex: 0 1 auto; min-width: 150px; }
.racing-overview__side { display: flex; flex-direction: column; gap: 12px; min-width: 0; }
.overview-activity { flex: 1; }
.training-panel { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 18px; }
.training-panel h2 { font: italic 700 22px/1.2 'Racer Display', sans-serif; text-transform: uppercase; margin: 0 0 6px; }
.training-panel p { font: italic 13px/1.4 'Segoe UI', sans-serif; text-transform: uppercase; margin: 0; color: #ccc; }
.overview-error { color: #ffafba; padding: 12px; }
.overview-error button { color: #fff; background: transparent; border: 1px solid #aaa; padding: 6px 12px; }
.overview-placeholder > :not(.overview-loading-label) { visibility: hidden; }
.overview-placeholder::after { content: ''; position: absolute; inset: 16px; background: #ffffff08; animation: loading-pulse 1.5s ease-in-out infinite alternate; }
.overview-loading-label { position: absolute; left: 24px; top: 24px; color: #ccc; }
@keyframes loading-pulse { to { opacity: .35; } }
@media (prefers-reduced-motion: reduce) { .overview-placeholder::after { animation: none; } }
@media (min-width: 1500px) { .last-drive__hero { min-height: 440px; } .training-panel { padding: 22px; } }
// Fit the normal desktop window through card proportions, not clipped content.
@media (min-width: 1051px) and (max-height: 900px) {
  .racing-overview { --overview-race-min-height: 154px; --overview-chart-min-height: 140px; --overview-chart-title-gap: 18px; }
  .last-drive__hero { min-height: 300px; }
  .training-panel { padding: 14px 18px; }
}
@media (max-width: 1050px) { .racing-overview { grid-template-columns: 1.2fr 1fr; gap: 12px; } .last-drive__results { padding-inline: 12px; } .performance-table td { padding-inline: 10px; } .training-panel { flex-direction: column; align-items: stretch; } .last-drive__actions { gap: 12px; } }
// PIP-639: tablet in verticale e telefono: una colonna (due colonne strette tagliavano testi e bottoni).
@media (max-width: 900px) { .racing-overview { grid-template-columns: 1fr; } .last-drive__hero { min-height: 340px; } .training-panel { flex-direction: row; } }
// Le etichette dei tempi vanno a capo invece di finire con i puntini quando la colonna e' stretta.
@media (max-width: 1300px) { .time-label { white-space: normal; } }
// Tablet in orizzontale, schermo basso (barre del browser comprese): tutto in una schermata, foto piu' bassa.
@media (min-width: 1051px) and (max-height: 780px) {
  .last-drive__hero { min-height: 220px; }
  .performance-table td { padding-block: 9px; }
  .last-drive__actions { padding-top: 10px; }
  .training-panel { padding: 8px 18px; } .training-panel h2 { font-size: 18px; margin: 0; }
  .racing-overview__side :deep(.activity-card--racing) { min-height: 0; padding-block: 14px; }
  .racing-overview__side :deep(.legend-dot) { height: 44px; }
  .racing-overview { --overview-race-min-height: 130px; --overview-chart-min-height: 92px; --overview-chart-title-gap: 8px; }
  .training-panel p { display: none; }
  .racing-overview__side :deep(.race-countdown__value) { font-size: 46px; }
}
@media (max-width: 480px) { .last-drive__hero { min-height: 310px; }
.last-drive__identity { left: 16px; } .performance-table td { padding-inline: 6px; } .time-label { font-size: 10px; } .grip-badge { display: block; margin: 3px 0 0; } .training-panel { flex-direction: column; }
  // Telefono: i due bottoni uno sotto l'altro, larghi quanto la card.
  .last-drive__actions { flex-direction: column; gap: 10px; } .last-drive__actions button { width: 100%; min-width: 0; } }
.racing-overview { @include controls.tokens; }
</style>
