<script setup lang="ts">
// ============================================
// SessionDetailPage - Session detail placeholder
// ============================================

import { computed } from 'vue'

const props = defineProps<{
  sessionId: string
}>()

const emit = defineEmits<{
  back: []
}>()

// Mock session data (will come from API based on sessionId)
const session = computed(() => ({
  id: props.sessionId,
  date: '6 GENNAIO 2026',
  time: '19:12',
  type: 'qualify' as const,
  track: 'Monza',
  car: 'Ford Mustang GT3',
  laps: 6,
  stints: 1,
  bestQualy: '1:47.234',
  bestRace: undefined,
  avgTime: '1:48.890'
}))

function getTypeLabel(type: string): string {
  const labels: Record<string, string> = { practice: 'PRACTICE', qualify: 'QUALIFY', race: 'RACE' }
  return labels[type] || type.toUpperCase()
}
</script>

<template>
  <LayoutPageContainer>
    <!-- Back button -->
    <button class="back-button" @click="emit('back')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M15 18l-6-6 6-6"/>
      </svg>
      <span>Torna alle sessioni</span>
    </button>

    <!-- Header -->
    <header class="session-header">
      <div class="header-main">
        <span :class="['type-chip', `type-chip--${session.type}`]">
          {{ getTypeLabel(session.type) }}
        </span>
        <h1 class="track-name">{{ session.track }}</h1>
      </div>
      <div class="header-meta">
        <span class="meta-item">{{ session.date }}</span>
        <span class="meta-separator">·</span>
        <span class="meta-item">{{ session.time }}</span>
        <span class="meta-separator">·</span>
        <span class="meta-item meta-item--car">{{ session.car }}</span>
      </div>
    </header>

    <!-- Times summary -->
    <section class="section times-section">
      <h2 class="section-title">Riepilogo Tempi</h2>
      <div class="times-grid">
        <div class="time-card" v-if="session.bestQualy">
          <span class="time-label">BEST QUALIFY</span>
          <span class="time-value">{{ session.bestQualy }}</span>
        </div>
        <div class="time-card" v-if="session.bestRace">
          <span class="time-label">BEST RACE</span>
          <span class="time-value">{{ session.bestRace }}</span>
        </div>
        <div class="time-card time-card--subtle">
          <span class="time-label">AVERAGE TIME</span>
          <span class="time-value">{{ session.avgTime || '—' }}</span>
        </div>
      </div>
    </section>

    <!-- Stints -->
    <section class="section">
      <h2 class="section-title">Stint</h2>
      <div class="placeholder-box">
        <p>{{ session.stints }} stint · {{ session.laps }} giri</p>
        <p class="placeholder-note">Dettaglio stint in arrivo...</p>
      </div>
    </section>

    <!-- Graphs -->
    <section class="section">
      <h2 class="section-title">Grafici</h2>
      <div class="graphs-grid">
        <div class="placeholder-box">
          <p class="placeholder-title">Tempi Giro</p>
          <p class="placeholder-note">Grafico in arrivo...</p>
        </div>
        <div class="placeholder-box">
          <p class="placeholder-title">Costanza</p>
          <p class="placeholder-note">Grafico in arrivo...</p>
        </div>
        <div class="placeholder-box">
          <p class="placeholder-title">Degrado</p>
          <p class="placeholder-note">Grafico in arrivo...</p>
        </div>
      </div>
    </section>
  </LayoutPageContainer>
</template>

<style lang="scss" scoped>
@use '@/assets/scss/variables' as *;

// === BACK BUTTON ===
.back-button {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  padding: 8px 0;
  background: none;
  border: none;
  color: rgba(255, 255, 255, 0.5);
  font-family: $font-primary;
  font-size: 13px;
  cursor: pointer;
  transition: color 0.15s ease;
  margin-bottom: 16px;

  svg {
    width: 18px;
    height: 18px;
  }

  &:hover {
    color: #fff;
  }
}

// === HEADER ===
.session-header {
  margin-bottom: 32px;
}

.header-main {
  display: flex;
  align-items: center;
  gap: 16px;
  margin-bottom: 12px;
}

.type-chip {
  padding: 6px 14px;
  border-radius: 6px;
  font-family: $font-primary;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.5px;

  &--practice {
    background: rgba($accent-info, 0.2);
    color: $accent-info;
  }

  &--qualify {
    background: rgba($accent-warning, 0.2);
    color: $accent-warning;
  }

  &--race {
    background: rgba($racing-red, 0.2);
    color: $racing-red;
  }
}

.track-name {
  font-family: 'Outfit', $font-primary;
  font-size: 32px;
  font-weight: 800;
  color: #fff;
  letter-spacing: 1px;
  text-transform: uppercase;
}

.header-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  color: rgba(255, 255, 255, 0.5);
  font-size: 14px;
}

.meta-item {
  font-family: $font-primary;
}

.meta-item--car {
  color: rgba(255, 255, 255, 0.4);
}

.meta-separator {
  color: rgba(255, 255, 255, 0.2);
}

// === SECTIONS ===
.section {
  margin-bottom: 32px;
}

.section-title {
  font-family: 'Outfit', $font-primary;
  font-size: 16px;
  font-weight: 700;
  color: #fff;
  margin-bottom: 16px;
  letter-spacing: 0.5px;
}

// === TIMES GRID ===
.times-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 16px;
}

.time-card {
  padding: 20px;
  background: #121218;
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;

  &--subtle {
    background: rgba(255, 255, 255, 0.02);
    border-color: rgba(255, 255, 255, 0.05);
  }
}

.time-label {
  display: block;
  font-family: $font-primary;
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: rgba(255, 255, 255, 0.4);
  margin-bottom: 8px;
}

.time-value {
  font-family: 'JetBrains Mono', 'Consolas', monospace;
  font-size: 24px;
  font-weight: 700;
  color: #fff;
}

// === PLACEHOLDER ===
.placeholder-box {
  padding: 32px;
  background: #121218;
  border: 1px dashed rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  text-align: center;
}

.placeholder-title {
  font-family: $font-primary;
  font-size: 14px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 8px;
}

.placeholder-note {
  font-family: $font-primary;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.3);
}

.graphs-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
  gap: 16px;
}

// === RESPONSIVE ===
@media (max-width: 640px) {
  .track-name {
    font-size: 24px;
  }

  .header-meta {
    flex-wrap: wrap;
  }

  .time-value {
    font-size: 20px;
  }
}
</style>

