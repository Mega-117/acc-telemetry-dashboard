<script setup lang="ts">
// ============================================
// TrackDetailPage - Track detail view (placeholder)
// ============================================

import { ref } from 'vue'

const props = defineProps<{
  trackId: string
}>()

const emit = defineEmits<{
  back: []
}>()

// Mock track data (will be dynamic later)
const track = ref({
  id: props.trackId,
  name: 'Monza',
  fullName: 'Autodromo Nazionale Monza',
  country: 'Italia',
  countryCode: 'IT',
  length: '5.793 km',
  turns: 11,
  image: '/tracks/track_monza.png',
  sessions: 12,
  lastSession: '2026-01-06',
  bestQualy: '1:47.234',
  bestRace: '1:48.123',
  description: 'Il Tempio della Velocità - uno dei circuiti più iconici del motorsport mondiale, famoso per le sue lunghe rettilinee e le curve paraboliche.'
})

// Mock session history
const recentSessions = ref([
  { id: '1', date: '2026-01-06', type: 'Race', bestLap: '1:48.123', position: 3 },
  { id: '2', date: '2026-01-05', type: 'Qualifying', bestLap: '1:47.234', position: 5 },
  { id: '3', date: '2026-01-03', type: 'Practice', bestLap: '1:48.567', position: null },
  { id: '4', date: '2025-12-28', type: 'Race', bestLap: '1:48.890', position: 7 },
])

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  const day = date.getDate()
  const months = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic']
  const month = months[date.getMonth()]
  const year = date.getFullYear()
  return `${day} ${month} ${year}`
}
</script>

<template>
  <LayoutPageContainer>
    <!-- Back button -->
    <button class="back-button" @click="emit('back')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M19 12H5M12 19l-7-7 7-7"/>
      </svg>
      Torna alle piste
    </button>

    <!-- Track Header -->
    <div class="track-header">
      <div class="track-header-image">
        <img :src="track.image" :alt="track.name" />
      </div>
      <div class="track-header-info">
        <span class="track-country-badge">{{ track.countryCode }}</span>
        <h1 class="track-title">{{ track.name }}</h1>
        <p class="track-fullname">{{ track.fullName }}</p>
        <div class="track-meta">
          <span class="meta-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M12 2L2 7l10 5 10-5-10-5z"/>
              <path d="M2 17l10 5 10-5"/>
              <path d="M2 12l10 5 10-5"/>
            </svg>
            {{ track.length }}
          </span>
          <span class="meta-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 12a9 9 0 11-18 0 9 9 0 0118 0z"/>
              <path d="M9 12l2 2 4-4"/>
            </svg>
            {{ track.turns }} curve
          </span>
          <span class="meta-item">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2"/>
              <line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/>
              <line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            {{ track.sessions }} sessioni
          </span>
        </div>
      </div>
    </div>

    <!-- Best Times -->
    <div class="section">
      <h2 class="section-title">Migliori Tempi</h2>
      <div class="best-times-grid">
        <div class="best-time-card best-time-card--qualy">
          <span class="time-label">Best Qualifying</span>
          <span class="time-value">{{ track.bestQualy || '—:—.---' }}</span>
        </div>
        <div class="best-time-card best-time-card--race">
          <span class="time-label">Best Race</span>
          <span class="time-value">{{ track.bestRace || '—:—.---' }}</span>
        </div>
      </div>
    </div>

    <!-- Description -->
    <div class="section">
      <h2 class="section-title">Info Circuito</h2>
      <p class="track-description">{{ track.description }}</p>
    </div>

    <!-- Recent Sessions -->
    <div class="section">
      <h2 class="section-title">Sessioni Recenti</h2>
      <div class="sessions-list">
        <div class="session-row session-row--header">
          <span>Data</span>
          <span>Tipo</span>
          <span>Miglior Giro</span>
          <span>Posizione</span>
        </div>
        <div v-for="session in recentSessions" :key="session.id" class="session-row">
          <span>{{ formatDate(session.date) }}</span>
          <span class="session-type">{{ session.type }}</span>
          <span class="session-time">{{ session.bestLap }}</span>
          <span class="session-position">{{ session.position ? `P${session.position}` : '—' }}</span>
        </div>
      </div>
    </div>
  </LayoutPageContainer>
</template>

<style lang="scss" scoped>
@use '@/assets/scss/variables' as *;

.back-button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 10px 16px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.7);
  font-family: $font-primary;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  margin-bottom: 24px;

  svg {
    width: 18px;
    height: 18px;
  }

  &:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.2);
    color: #fff;
  }
}

// === TRACK HEADER ===
.track-header {
  display: flex;
  gap: 32px;
  margin-bottom: 40px;
  padding: 24px;
  background: linear-gradient(145deg, #1a2035, #151828);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
}

.track-header-image {
  width: 280px;
  height: 200px;
  flex-shrink: 0;
  border-radius: 12px;
  overflow: hidden;
  background: linear-gradient(135deg, #0d1117 0%, #1a1f2e 100%);

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }
}

.track-header-info {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: center;
}

.track-country-badge {
  display: inline-block;
  padding: 4px 10px;
  background: rgba($racing-red, 0.15);
  border: 1px solid rgba($racing-red, 0.3);
  border-radius: 4px;
  color: $racing-red;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1px;
  margin-bottom: 12px;
  width: fit-content;
}

.track-title {
  font-family: 'Outfit', $font-primary;
  font-size: 36px;
  font-weight: 700;
  color: #fff;
  margin: 0 0 4px 0;
}

.track-fullname {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.5);
  margin: 0 0 20px 0;
}

.track-meta {
  display: flex;
  gap: 24px;
}

.meta-item {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);

  svg {
    width: 16px;
    height: 16px;
    opacity: 0.5;
  }
}

// === SECTIONS ===
.section {
  margin-bottom: 32px;
}

.section-title {
  font-family: 'Outfit', $font-primary;
  font-size: 18px;
  font-weight: 600;
  color: #fff;
  margin: 0 0 16px 0;
}

// === BEST TIMES ===
.best-times-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 16px;
}

.best-time-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 24px;
  border-radius: 12px;
  text-align: center;

  &--qualy {
    background: rgba($accent-warning, 0.1);
    border: 1px solid rgba($accent-warning, 0.3);
  }

  &--race {
    background: rgba(255, 100, 100, 0.1);
    border: 1px solid rgba(255, 100, 100, 0.3);
  }
}

.time-label {
  font-size: 12px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 8px;
}

.time-value {
  font-family: 'JetBrains Mono', monospace;
  font-size: 28px;
  font-weight: 700;
  color: #fff;
}

// === DESCRIPTION ===
.track-description {
  font-size: 14px;
  line-height: 1.7;
  color: rgba(255, 255, 255, 0.7);
  margin: 0;
  padding: 20px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.06);
}

// === SESSIONS LIST ===
.sessions-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.session-row {
  display: grid;
  grid-template-columns: 1fr 100px 120px 80px;
  align-items: center;
  padding: 14px 20px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 8px;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.8);

  &--header {
    background: rgba(255, 255, 255, 0.04);
    font-size: 11px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: rgba(255, 255, 255, 0.5);
  }
}

.session-type {
  font-weight: 600;
}

.session-time {
  font-family: 'JetBrains Mono', monospace;
  font-weight: 600;
}

.session-position {
  font-weight: 700;
  color: $racing-red;
}

// === RESPONSIVE ===
@media (max-width: 768px) {
  .track-header {
    flex-direction: column;
    gap: 20px;
  }

  .track-header-image {
    width: 100%;
    height: 180px;
  }

  .best-times-grid {
    grid-template-columns: 1fr;
  }

  .session-row {
    grid-template-columns: 1fr 80px 100px;
  }

  .session-row span:last-child {
    display: none;
  }
}
</style>

