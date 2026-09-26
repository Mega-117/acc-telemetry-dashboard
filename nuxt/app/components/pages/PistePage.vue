<script setup lang="ts">
// ============================================
// PistePage - Track grid using the existing overview projection
// Projection-first via telemetry gateway
// ============================================

import { onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { usePilotContext } from '~/composables/usePilotContext'
import { usePublicPath } from '~/composables/usePublicPath'
import { useTelemetryGateway } from '~/composables/useTelemetryGateway'
import type { TrackOverviewProjectionItem } from '~/types/trackProjections'

const { getPublicPath } = usePublicPath()

type TrackDisplay = TrackOverviewProjectionItem

const emit = defineEmits<{
  'go-to-track': [trackId: string]
}>()

const telemetryGateway = useTelemetryGateway()
const targetUserId = usePilotContext()
const sortedTracks = ref<TrackDisplay[]>([])


async function loadTracks() {
  sortedTracks.value = await telemetryGateway.getTracksOverviewProjection(targetUserId.value || undefined)
}

function handleCacheInvalidated(event: Event) {
  const detail = (event as CustomEvent<{ uid?: string | null }>).detail || {}
  if (!targetUserId.value || !detail.uid || detail.uid === targetUserId.value) {
    void loadTracks()
  }
}

watch(() => targetUserId.value, loadTracks, { immediate: true })

onMounted(() => {
  window.addEventListener('acc:telemetry-cache-invalidated', handleCacheInvalidated)
})

onBeforeUnmount(() => {
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
    <p class="page-subtitle">
      {{ sortedTracks.filter(t => t.sessions > 0).length }} piste visitate su {{ sortedTracks.length }} totali
    </p>
    <div class="tracks-grid">
      <a
        v-for="track in sortedTracks"
        :key="track.id"
        :href="getPublicPath(`/piste/${track.id}`)"
        class="track-card"
        :class="{ 'track-card--unplayed': track.sessions === 0 }"
        :aria-label="`Dettaglio pista ${track.name}`"
        @click.prevent="goToTrack(track.id)"
      >
        <div class="track-card__surface">
          <div class="card-image-section">
            <img
              v-if="track.image"
              :src="getPublicPath(track.image)"
              :alt="track.name"
              class="card-track-image"
              loading="lazy"
            />
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
          </div>
        </div>
      </a>
    </div>
  </LayoutPageContainer>
</template>

<style scoped lang="scss">
@use '@/assets/scss/racing-settings' as controls;
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
