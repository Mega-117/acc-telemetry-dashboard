<script setup lang="ts">
// ============================================
// PistePage - Tracks overview with Card/List
// ============================================

import { ref, computed } from 'vue'

// Composable for public path (GitHub Pages compatibility)
const { getPublicPath } = usePublicPath()

// Types
interface Track {
  id: string
  name: string
  country: string
  length: string
  image?: string
  sessions: number
  lastSession?: string
  bestQualy?: string
  bestRace?: string
}

// Emit to parent for navigation
const emit = defineEmits<{
  'go-to-track': [trackId: string]
}>()

// === VIEW MODE ===
type ViewMode = 'card' | 'list'
const viewMode = ref<ViewMode>('card')

// === MOCK DATA: All ACC Tracks ===
const tracks: Track[] = [
  // Piste con sessioni (dati aggregati)
  { id: 'monza', name: 'Monza', country: 'IT', length: '5.793 km', image: '/tracks/track_monza.png', sessions: 12, lastSession: '2026-01-06', bestQualy: '1:47.234', bestRace: '1:48.123' },
  { id: 'donington', name: 'Donington Park', country: 'GB', length: '4.020 km', image: '/tracks/track_donington.png', sessions: 8, lastSession: '2026-01-13', bestQualy: '1:29.123', bestRace: '1:30.456' },
  { id: 'spa', name: 'Spa-Francorchamps', country: 'BE', length: '7.004 km', image: '/tracks/track_spa.png', sessions: 5, lastSession: '2026-01-10', bestQualy: '2:16.543', bestRace: '2:17.890' },
  { id: 'paul_ricard', name: 'Paul Ricard', country: 'FR', length: '5.842 km', image: '/tracks/track_paul_ricard.png', sessions: 4, lastSession: '2025-12-31', bestQualy: '1:54.234', bestRace: '1:55.678' },
  { id: 'valencia', name: 'Valencia', country: 'ES', length: '4.005 km', image: '/tracks/track_valencia.png', sessions: 2, lastSession: '2026-01-13', bestQualy: '1:31.890' },
  
  // Piste senza sessioni
  { id: 'barcelona', name: 'Barcelona-Catalunya', country: 'ES', length: '4.655 km', image: '/tracks/track_barcelona.png', sessions: 0 },
  { id: 'brands_hatch', name: 'Brands Hatch', country: 'GB', length: '3.908 km', image: '/tracks/track_brands_hatch.png', sessions: 0 },
  { id: 'hungaroring', name: 'Hungaroring', country: 'HU', length: '4.381 km', image: '/tracks/track_hungaroring.png', sessions: 0 },
  { id: 'imola', name: 'Imola', country: 'IT', length: '4.909 km', image: '/tracks/track_imola.png', sessions: 0 },
  { id: 'kyalami', name: 'Kyalami', country: 'ZA', length: '4.522 km', image: '/tracks/track_kyalami.png', sessions: 0 },
  { id: 'laguna_seca', name: 'Laguna Seca', country: 'US', length: '3.602 km', image: '/tracks/track_laguna_seca.png', sessions: 0 },
  { id: 'misano', name: 'Misano', country: 'IT', length: '4.226 km', image: '/tracks/track_misano.png', sessions: 0 },
  { id: 'mount_panorama', name: 'Mount Panorama', country: 'AU', length: '6.213 km', image: '/tracks/track_mount_panorama.png', sessions: 0 },
  { id: 'nurburgring', name: 'Nürburgring', country: 'DE', length: '5.148 km', image: '/tracks/track_nurburgring.png', sessions: 0 },
  { id: 'oulton_park', name: 'Oulton Park', country: 'GB', length: '4.307 km', image: '/tracks/track_oulton_park.png', sessions: 0 },
  { id: 'silverstone', name: 'Silverstone', country: 'GB', length: '5.891 km', image: '/tracks/track_silverstone.png', sessions: 0 },
  { id: 'snetterton', name: 'Snetterton', country: 'GB', length: '4.779 km', image: '/tracks/track_snetterton.png', sessions: 0 },
  { id: 'suzuka', name: 'Suzuka', country: 'JP', length: '5.807 km', image: '/tracks/track_suzuka.png', sessions: 0 },
  { id: 'watkins_glen', name: 'Watkins Glen', country: 'US', length: '5.472 km', image: '/tracks/track_watkins_glen.png', sessions: 0 },
  { id: 'zandvoort', name: 'Zandvoort', country: 'NL', length: '4.259 km', image: '/tracks/track_zandvoort.png', sessions: 0 },
  { id: 'zolder', name: 'Zolder', country: 'BE', length: '4.011 km', image: '/tracks/track_zolder.png', sessions: 0 },
  { id: 'cota', name: 'COTA', country: 'US', length: '5.513 km', image: '/tracks/track_cota.png', sessions: 0 },
  { id: 'indianapolis', name: 'Indianapolis', country: 'US', length: '4.192 km', image: '/tracks/track_indianapolis.png', sessions: 0 },
  { id: 'red_bull_ring', name: 'Red Bull Ring', country: 'AT', length: '4.318 km', image: '/tracks/track_red_bull_ring.png', sessions: 0 },
]

// Sorted tracks: with sessions first (by lastSession desc), then without sessions
const sortedTracks = computed(() => {
  return [...tracks].sort((a, b) => {
    // Both have sessions: sort by lastSession desc
    if (a.sessions > 0 && b.sessions > 0) {
      return (b.lastSession || '').localeCompare(a.lastSession || '')
    }
    // Only one has sessions: that one goes first
    if (a.sessions > 0 && b.sessions === 0) return -1
    if (a.sessions === 0 && b.sessions > 0) return 1
    // Both have no sessions: sort alphabetically
    return a.name.localeCompare(b.name)
  })
})

// Format date
function formatDate(dateStr?: string): string {
  if (!dateStr) return 'Nessuna sessione'
  const date = new Date(dateStr)
  const day = date.getDate()
  const months = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic']
  const month = months[date.getMonth()]
  const year = date.getFullYear()
  return `${day} ${month} ${year}`
}

// Navigate to track detail
function goToTrack(id: string) {
  emit('go-to-track', id)
}
</script>

<template>
  <LayoutPageContainer>
    <h1 class="page-title">PISTE</h1>
    
    <!-- HEADER WITH TOGGLE -->
    <div class="page-header">
      <p class="page-subtitle">{{ sortedTracks.filter(t => t.sessions > 0).length }} piste visitate su {{ sortedTracks.length }} totali</p>
      
      <div class="view-toggle">
        <button 
          :class="['view-btn', { 'view-btn--active': viewMode === 'card' }]"
          @click="viewMode = 'card'"
          title="Card"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="7" height="7" rx="1"/>
            <rect x="14" y="3" width="7" height="7" rx="1"/>
            <rect x="3" y="14" width="7" height="7" rx="1"/>
            <rect x="14" y="14" width="7" height="7" rx="1"/>
          </svg>
        </button>
        <button 
          :class="['view-btn', { 'view-btn--active': viewMode === 'list' }]"
          @click="viewMode = 'list'"
          title="Lista"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>
          </svg>
        </button>
      </div>
    </div>

    <!-- CARD VIEW (Standard) -->
    <div v-if="viewMode === 'card'" class="tracks-grid">
      <div 
        v-for="track in sortedTracks" 
        :key="track.id"
        :class="['track-card', { 'track-card--unplayed': track.sessions === 0 }]"
        @click="goToTrack(track.id)"
      >
        <!-- Track image section -->
        <div class="card-image-section">
          <img 
            v-if="track.image" 
            :src="getPublicPath(track.image)" 
            :alt="track.name"
            class="card-track-image"
          />
          <div v-else class="card-image-placeholder">
            <span class="placeholder-icon">🏁</span>
          </div>
        </div>
        
        <!-- Card content -->
        <div class="card-content">
          <h3 class="track-name">{{ track.name }}</h3>
          
          <div class="track-stats">
            <span class="track-sessions">{{ track.sessions }} sessioni</span>
            <span class="track-separator">·</span>
            <span class="track-last">{{ formatDate(track.lastSession) }}</span>
          </div>
          
          <div class="track-times">
            <span :class="['time-badge', 'time-badge--qualy', { 'time-badge--empty': !track.bestQualy }]">
              Q {{ track.bestQualy || '—:—.---' }}
            </span>
            <span :class="['time-badge', 'time-badge--race', { 'time-badge--empty': !track.bestRace }]">
              R {{ track.bestRace || '—:—.---' }}
            </span>
          </div>
          
          <button class="track-cta">
            Dettaglio pista
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M9 18l6-6-6-6"/>
            </svg>
          </button>
        </div>
      </div>
    </div>


    <!-- LIST VIEW -->
    <div v-else class="tracks-list">
      <!-- Header -->
      <div class="list-header">
        <span class="lh-name">Pista</span>
        <span class="lh-sessions">Sessioni</span>
        <span class="lh-last">Ultima sessione</span>
        <span class="lh-best">Best Q</span>
        <span class="lh-best">Best R</span>
        <span class="lh-cta"></span>
      </div>
      
      <!-- Rows -->
      <div 
        v-for="track in sortedTracks" 
        :key="track.id"
        :class="['list-row', { 'list-row--unplayed': track.sessions === 0 }]"
        @click="goToTrack(track.id)"
      >
        <span class="lr-name">
          <span class="lr-country">{{ track.country }}</span>
          {{ track.name }}
        </span>
        <span class="lr-sessions">{{ track.sessions }}</span>
        <span class="lr-last">{{ formatDate(track.lastSession) }}</span>
        <span :class="['lr-time', 'lr-time--qualy', { 'lr-time--empty': !track.bestQualy }]">
          Q {{ track.bestQualy || '—:—.---' }}
        </span>
        <span :class="['lr-time', 'lr-time--race', { 'lr-time--empty': !track.bestRace }]">
          R {{ track.bestRace || '—:—.---' }}
        </span>
        <span class="lr-cta">
          Dettaglio
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 18l6-6-6-6"/>
          </svg>
        </span>
      </div>
    </div>
  </LayoutPageContainer>
</template>

<style lang="scss" scoped>
@use '@/assets/scss/variables' as *;

.page-title {
  font-family: 'Outfit', $font-primary;
  font-size: 24px;
  font-weight: 700;
  color: #fff;
  margin-bottom: 8px;
  letter-spacing: 1px;
}

// === PAGE HEADER ===
.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
}

.page-subtitle {
  font-family: $font-primary;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.5);
}

.view-toggle {
  display: flex;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 4px;
  gap: 4px;
}

.view-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 32px;
  background: transparent;
  border: none;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;

  svg {
    width: 16px;
    height: 16px;
    color: rgba(255, 255, 255, 0.4);
    transition: color 0.15s ease;
    display: block;
  }

  &:hover {
    background: rgba(255, 255, 255, 0.08);
    svg { color: rgba(255, 255, 255, 0.7); }
  }

  &--active {
    background: rgba(255, 255, 255, 0.12);
    svg { color: #fff; }
  }
}

// === CARD VIEW ===
.tracks-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 20px;
}

.track-card {
  display: flex;
  flex-direction: column;
  background: linear-gradient(145deg, #1a2035, #151828);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  overflow: hidden;
  cursor: pointer;
  transition: all 0.25s ease;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.3);

  // Glow hover effect ONLY for active cards (with sessions)
  &:not(.track-card--unplayed):hover {
    border-color: rgba(255, 255, 255, 0.3);
    transform: translateY(-4px);
    box-shadow: 
      0 8px 24px rgba(0, 0, 0, 0.4),
      0 0 25px rgba(255, 255, 255, 0.15),
      0 0 50px rgba(255, 255, 255, 0.08);

    .track-cta {
      color: #fff;
      svg { transform: translateX(3px); }
    }

    .card-track-image {
      transform: scale(1.05);
    }
  }

  // Unplayed cards - no interaction
  &--unplayed {
    opacity: 0.45;
    filter: grayscale(0.6);
    cursor: default;
    pointer-events: none;
  }
}

// Image section at top
.card-image-section {
  position: relative;
  height: 200px;
  overflow: hidden;
  background: linear-gradient(135deg, #0d1117 0%, #1a1f2e 100%);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.card-track-image {
  width: 100%;
  height: 100%;
  object-fit: cover;
  object-position: center;
  transition: transform 0.3s ease;
}

.card-image-placeholder {
  display: flex;
  align-items: center;
  justify-content: center;
  height: 100%;
  background: linear-gradient(135deg, #151828 0%, #1a2035 100%);
}

.placeholder-icon {
  font-size: 40px;
  opacity: 0.3;
}

// Content section below image
.card-content {
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  flex: 1;
}

.card-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.track-country {
  font-family: $font-primary;
  font-size: 11px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.5);
  letter-spacing: 1px;
  padding: 4px 8px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 4px;
}

.track-length {
  font-family: $font-primary;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.4);
}

.track-name {
  font-family: 'Outfit', $font-primary;
  font-size: 16px;
  font-weight: 700;
  color: #fff;
  margin: 0;
}

.track-stats {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.5);
}

.track-separator {
  color: rgba(255, 255, 255, 0.25);
}

.track-sessions {
  font-weight: 600;
}

.track-times {
  display: flex;
  gap: 6px;
  margin: 4px 0;
}

.time-badge {
  padding: 4px 8px;
  border-radius: 4px;
  font-family: 'JetBrains Mono', 'Consolas', monospace;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.2px;
  white-space: nowrap;
  flex: 1;
  text-align: center;

  &--qualy {
    background: rgba($accent-warning, 0.12);
    border: 1px solid rgba($accent-warning, 0.4);
    color: $accent-warning;
  }

  &--race {
    background: rgba(255, 100, 100, 0.12);
    border: 1px solid rgba(255, 100, 100, 0.35);
    color: rgb(255, 100, 100);
  }

  &--empty {
    opacity: 0.35;
  }
}

.track-cta {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 4px;
  padding: 6px 10px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.7);
  font-family: $font-primary;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  cursor: pointer;
  transition: all 0.15s ease;
  margin-top: 2px;

  svg {
    width: 12px;
    height: 12px;
    transition: transform 0.15s ease;
  }

  &:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.2);
  }
}

// === LIST VIEW ===
.tracks-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.list-header {
  display: grid;
  grid-template-columns: 1fr 90px 140px 110px 110px 108px;
  align-items: center;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 8px;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 4px;
}

.lh-sessions, .lh-last { text-align: center; }
.lh-best { text-align: center; }

.list-row {
  display: grid;
  grid-template-columns: 1fr 90px 140px 110px 110px 108px;
  align-items: center;
  padding: 14px 16px;
  background: #121218;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;

  // Glow hover effect ONLY for active rows (with sessions)
  &:not(.list-row--unplayed):hover {
    border-color: rgba(255, 255, 255, 0.25);
    transform: translateY(-2px);
    box-shadow: 
      0 6px 20px rgba(0, 0, 0, 0.3),
      0 0 20px rgba(255, 255, 255, 0.1),
      0 0 40px rgba(255, 255, 255, 0.05);

    .lr-cta {
      background: rgba(255, 255, 255, 0.08);
      border-color: rgba(255, 255, 255, 0.2);
      color: #fff;
      
      svg { transform: translateX(2px); }
    }
  }

  // Unplayed rows - no interaction
  &--unplayed {
    opacity: 0.5;
    cursor: default;
    pointer-events: none;
  }
}

.lr-name {
  font-family: $font-primary;
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  display: flex;
  align-items: center;
  gap: 10px;
}

.lr-country {
  font-size: 10px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.4);
  letter-spacing: 0.5px;
  padding: 3px 6px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 3px;
}

.lr-sessions {
  font-family: $font-primary;
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  text-align: center;
}

.lr-last {
  font-family: $font-primary;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
  text-align: center;
}

.lr-time {
  font-family: 'JetBrains Mono', 'Consolas', monospace;
  font-size: 10px;
  font-weight: 600;
  text-align: center;
  padding: 4px 8px;
  border-radius: 4px;
  white-space: nowrap;
  margin: 0 8px;

  &--qualy {
    background: rgba($accent-warning, 0.12);
    border: 1px solid rgba($accent-warning, 0.4);
    color: $accent-warning;
  }

  &--race {
    background: rgba(255, 100, 100, 0.12);
    border: 1px solid rgba(255, 100, 100, 0.35);
    color: rgb(255, 100, 100);
  }

  &--empty {
    opacity: 0.35;
  }
}

.lr-cta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: $font-primary;
  font-size: 11px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.6);
  padding: 6px 14px;
  margin-left: 12px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  transition: all 0.15s ease;

  svg {
    width: 18px;
    height: 18px;
    flex-shrink: 0;
    transition: transform 0.15s ease;
  }
}

// === RESPONSIVE ===
@media (max-width: 1600px) {
  .tracks-grid {
    grid-template-columns: repeat(5, 1fr);
  }
}

@media (max-width: 1300px) {
  .tracks-grid {
    grid-template-columns: repeat(4, 1fr);
  }
}

@media (max-width: 1000px) {
  .tracks-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}

@media (max-width: 750px) {
  .tracks-grid {
    grid-template-columns: repeat(2, 1fr);
  }

  .list-header, .list-row {
    grid-template-columns: 1fr 70px 100px 90px 90px 32px;
    font-size: 11px;
    padding: 12px;
  }
}

@media (max-width: 500px) {
  .tracks-grid {
    grid-template-columns: 1fr;
  }

  .page-header {
    flex-direction: column;
    align-items: flex-start;
    gap: 12px;
  }

  .list-header, .list-row {
    grid-template-columns: 1fr 60px 90px 32px;
  }

  .lh-best:nth-child(4), .lh-best:nth-child(5),
  .lr-time:nth-child(4), .lr-time:nth-child(5) {
    display: none;
  }
}
</style>
