<script setup lang="ts">
// ============================================
// PistePage - Track grid using the existing overview projection
// Projection-first via telemetry gateway
// ============================================

import { getCarCategory, formatCarName } from '~/utils/telemetryFormat'
import { TRACK_CARD_SIZES } from '~/utils/responsiveImage'
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { usePilotContext } from '~/composables/usePilotContext'
import { usePublicPath } from '~/composables/usePublicPath'
import { useTelemetryGateway } from '~/composables/useTelemetryGateway'
import type { TrackOverviewProjectionItem } from '~/types/trackProjections'
import { useGameContext } from '~/composables/useGameContext'
import { buildCommonTrackOverview } from '~/services/projections/buildCommonTrackOverview'
import { historyOptions, type HistoryFilter } from '~/services/projections/vehicleHistory'
import type { SessionDocument } from '~/types/telemetry'
import GameContextTransition from '~/components/layout/GameContextTransition.vue'
const { consultedGame } = useGameContext()

const { getPublicPath } = usePublicPath()

type TrackDisplay = TrackOverviewProjectionItem

const emit = defineEmits<{
  'go-to-track': [trackId: string]
}>()

const targetUserId = usePilotContext()
const props = defineProps<{ initialTracks?: TrackDisplay[]; initialSessions?: SessionDocument[] }>()
const initialTracks = ref<TrackDisplay[]>(props.initialTracks || [])
const sessions = ref<SessionDocument[]>(props.initialSessions || [])
const filters = useState<Record<string, HistoryFilter & { active?: boolean }>>('track-history-filters', () => ({}))
const filterKey = computed(() => `${targetUserId.value || 'self'}:${consultedGame.value}`)
const filter = computed<HistoryFilter>(() => filters.value[filterKey.value] ?? { category: '', car: '' })
const options = computed(() => historyOptions(sessions.value, consultedGame.value))
const cars = computed(() => historyOptions(sessions.value.filter(s => !filter.value.category || getCarCategory(s.meta.car) === filter.value.category), consultedGame.value).cars)
const sortedTracks = computed(() => sessions.value.length || !initialTracks.value.length
  ? buildCommonTrackOverview(sessions.value, consultedGame.value, filter.value) : initialTracks.value)
function changeFilter(field: 'category' | 'car', event: Event) {
  const value = (event.target as HTMLSelectElement).value
  filters.value[filterKey.value] = { ...filter.value, [field]: value as HistoryFilter['category'], ...(field === 'category' ? { car: '' } : {}), active: true }
}
const loading = ref(false)
const failed = ref(false)
let revision = 0


async function loadTracks() {
  const ticket = ++revision
  sessions.value = []
  if (ticket > 1) initialTracks.value = []
  loading.value = true
  failed.value = false
  try {
    const result = await useTelemetryGateway(consultedGame.value).getVehicleHistory(targetUserId.value || undefined)
    if (ticket === revision) { sessions.value = result; initialTracks.value = [] }
  } catch { if (ticket === revision) failed.value = true }
  finally { if (ticket === revision) loading.value = false }
}

function handleCacheInvalidated(event: Event) {
  const detail = (event as CustomEvent<{ uid?: string | null }>).detail || {}
  if (!targetUserId.value || !detail.uid || detail.uid === targetUserId.value) {
    void loadTracks()
  }
}

watch([targetUserId, consultedGame], loadTracks, { immediate: props.initialSessions === undefined, flush: 'sync' })

onMounted(() => {
  window.addEventListener('acc:telemetry-cache-invalidated', handleCacheInvalidated)
})

onBeforeUnmount(() => {
  revision++
  window.removeEventListener('acc:telemetry-cache-invalidated', handleCacheInvalidated)
})

function formatDateDisplay(dateStr?: string): string {
  if (!dateStr) return 'Nessuna sessione'
  const date = new Date(dateStr)
  const day = date.getDate()
  const months = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic']
  const month = months[date.getMonth()]
  const year = date.getFullYear()
  return `${day} ${month} ${year}`
}

function goToTrack(id: string) {
  emit('go-to-track', id)
}
</script>
<template>
  <LayoutPageContainer>
    <GameContextTransition :game-id="consultedGame" :busy="loading">
    <p v-if="failed" role="alert">Impossibile caricare le piste. <button @click="loadTracks">Riprova</button></p>
    <p v-else-if="!loading && !sortedTracks.length">Nessuna pista registrata per questo gioco.</p>
    <div class="history-filters">
      <label v-if="consultedGame === 'acc'">Categoria
        <select :value="filter.category || ''" @change="changeFilter('category', $event)"><option value="">Tutte le categorie</option><option v-for="category in options.categories" :key="category" :value="category">{{ category }}</option></select>
      </label>
      <label>Vettura
        <select :value="filter.car || ''" @change="changeFilter('car', $event)"><option value="">Tutte le vetture</option><option v-for="car in cars" :key="car" :value="car">{{ formatCarName(car) }}</option></select>
      </label>
    </div>
    <p class="page-subtitle">
      {{ sortedTracks.filter(t => t.sessions > 0).length }} piste visitate su {{ sortedTracks.length }} totali
    </p>
    <div class="tracks-grid">
      <a
        v-for="(track, index) in sortedTracks"
        :key="track.id"
        :href="getPublicPath(`/piste/${encodeURIComponent(track.id)}`)"
        class="track-card"
        :class="{ 'track-card--unplayed': track.sessions === 0 }"
        :aria-label="`Dettaglio pista ${track.name}`"
        @click.prevent="goToTrack(track.id)"
      >
        <div class="track-card__surface">
          <div class="card-image-section">
            <UiResponsiveImage
              v-if="track.image"
              :src="track.image"
              :sizes="TRACK_CARD_SIZES"
              :alt="track.name"
              class="card-track-image"
              :loading="index < 6 ? 'eager' : 'lazy'"
            />
            <span v-else class="track-placeholder">{{ track.name }}</span>
          </div>
          <div class="card-content">
            <h2 class="track-name">{{ track.name }}</h2>
            <div class="track-stats">
              <span>{{ track.sessions }} {{ track.sessions === 1 ? 'sessione' : 'sessioni' }}</span>
              <template v-if="track.lastSession"><span aria-hidden="true">·</span><span :title="`Ultima sessione: ${formatDateDisplay(track.lastSession)}`">{{ formatDateDisplay(track.lastSession) }}</span></template>
            </div>
            <div class="track-times">
              <span
                class="time-badge time-badge--qualy"
                :class="{ 'time-badge--empty': !track.bestQualy }"
                :aria-label="`Qualifica ${track.bestQualy || 'non disponibile'}`"
              >{{ track.bestQualy || '—:—.---' }}</span>
              <span
                class="time-badge time-badge--race"
                :class="{ 'time-badge--empty': !track.bestRace }"
                :aria-label="`Gara ${track.bestRace || 'non disponibile'}`"
              >{{ track.bestRace || '—:—.---' }}</span>
            </div>
            <p v-if="track.bestQualyCar" class="track-reference">Q · {{ formatCarName(track.bestQualyCar) }}</p>
            <p v-if="track.bestRaceCar" class="track-reference">G · {{ formatCarName(track.bestRaceCar) }}</p>
          </div>
        </div>
      </a>
    </div>
    </GameContextTransition>
  </LayoutPageContainer>
</template>

<style scoped lang="scss">
@use '@/assets/scss/racing-settings' as controls;
.history-filters { display: flex; flex-wrap: wrap; gap: 16px; margin-bottom: 20px; }
.history-filters label { display: grid; gap: 6px; font-size: 12px; color: var(--rc-muted); }
.history-filters select { color: white; background: #111; border: 1px solid #555; padding: 8px 12px; min-width: 180px; }
.page-subtitle { margin: 0 0 24px; color: #d1d1d6; font-size: 12px; }
.tracks-grid { display: grid; grid-template-columns: repeat(6,minmax(0,1fr)); gap: 24px; }
.track-card { --card-cut: 12px; --card-border: var(--rc-border); position: relative; display: block; min-width: 0; padding: 1px; background: transparent; color: #fff; text-decoration: none; clip-path: polygon(var(--card-cut) 0,100% 0,100% calc(100% - var(--card-cut)),calc(100% - var(--card-cut)) 100%,0 100%,0 var(--card-cut)); }
/* A hollow polygon preserves the diagonal border without filling the card. */
.track-card::after { content: ''; position: absolute; inset: 0; pointer-events: none; background: var(--card-border); clip-path: polygon(evenodd,12px 0,100% 0,100% calc(100% - 12px),calc(100% - 12px) 100%,0 100%,0 12px,12px 0,12.414px 1px,1px 12.414px,1px calc(100% - 1px),calc(100% - 12.414px) calc(100% - 1px),calc(100% - 1px) calc(100% - 12.414px),calc(100% - 1px) 1px,12.414px 1px); }
.track-card__surface { height: 100%; background: transparent; clip-path: polygon(var(--card-cut) 0,100% 0,100% calc(100% - var(--card-cut)),calc(100% - var(--card-cut)) 100%,0 100%,0 var(--card-cut)); }
.track-card::after { transition: background-color .18s; }
.track-card:hover { --card-border: #ffffff66; }
.track-card:focus-visible { --card-border: #fff; outline: none; }
.track-card--unplayed { --card-border: #ffffff20; }
.track-card--unplayed .card-track-image { opacity: .55; }
.track-card--unplayed .card-content { opacity: .65; }
.card-image-section { aspect-ratio: 1; overflow: hidden; background: #090b0e; }
.track-placeholder { display: flex; height: 100%; align-items: center; justify-content: center; padding: 20px; box-sizing: border-box; text-align: center; font-size: 24px; font-style: italic; }
.common-best-label, .track-reference { color: var(--rc-muted); font-size: 10px; align-self: center; }
.card-track-image { display: block; width: 100%; height: 100%; object-fit: cover; object-position: center top; }
.card-content { padding: 12px; }
.track-name { margin: 0 0 6px; font-size: 14px; font-weight: 600; line-height: 18px; overflow-wrap: anywhere; }
.track-stats { display: flex; flex-wrap: wrap; gap: 5px; color: var(--rc-muted); font-size: 11px; line-height: 1.4; }
.track-times { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 8px; margin-top: 10px; }
.time-badge { min-width: 0; width: 100%; box-sizing: border-box; padding: 4px 6px; border: 1px solid color-mix(in srgb,var(--time-color) 45%,transparent); background: color-mix(in srgb,var(--time-color) 10%,transparent); color: var(--time-color); text-align: center; font-size: 10px; font-weight: 700; font-variant-numeric: tabular-nums; }
.time-badge--qualy { --time-color: var(--racing-qualify); }.time-badge--race { --time-color: var(--racing-race); }.time-badge--empty { --time-color: #626971; }
@media(max-width: 1100px) { .tracks-grid { grid-template-columns: repeat(4,minmax(0,1fr)); gap: 18px; } }
@media(max-width: 760px) { .tracks-grid { grid-template-columns: repeat(3,minmax(0,1fr)); gap: 14px; } }
@media(max-width: 520px) { .tracks-grid { grid-template-columns: repeat(2,minmax(0,1fr)); gap: 12px; } }
@media(prefers-reduced-motion: reduce) { .track-card::after { transition: none; } }
.tracks-grid { @include controls.tokens; }
.track-card:hover .card-content,.track-card:focus-visible .card-content { background: var(--rc-hover); }

.time-badge { font-size: 12px; }
.time-badge--race { color: color-mix(in srgb,var(--racing-race) 80%,white); }
.time-badge--empty { color: #9298a1; }
</style>
