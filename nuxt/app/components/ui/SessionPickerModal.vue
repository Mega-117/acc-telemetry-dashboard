<script setup lang="ts">
import { computed, ref } from 'vue'
import { 
  useTelemetryData, 
  formatTrackName, 
  formatLapTime,
  formatTime,
  formatCarName,
  getSessionTypeLabel
} from '~/composables/useTelemetryData'

const props = defineProps<{
  isOpen: boolean
  currentTrack: string
  excludeSessionId: string
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'select', sessionId: string): void
}>()

const { sessions } = useTelemetryData()

// Filter sessions by same track, exclude current session
const filteredSessions = computed(() => {
  const trackNorm = props.currentTrack.toLowerCase().replace(/[^a-z0-9]/g, '_')
  
  return sessions.value
    .filter(s => {
      // Exclude current session
      if (s.sessionId === props.excludeSessionId) return false
      
      // Match track
      const sessionTrack = s.meta.track.toLowerCase().replace(/[^a-z0-9]/g, '_')
      return sessionTrack.includes(trackNorm) || trackNorm.includes(sessionTrack)
    })
    .map(s => ({
      id: s.sessionId,
      date: formatDateShort(s.meta.date_start),
      time: formatTime(s.meta.date_start),
      type: getSessionTypeLabel(s.meta.session_type),
      car: formatCarName(s.meta.car),
      laps: s.summary.laps || 0,
      stints: s.summary.stintCount || 1,
      bestQualy: s.summary.best_qualy_ms ? formatLapTime(s.summary.best_qualy_ms) : null,
      bestRace: s.summary.best_race_ms ? formatLapTime(s.summary.best_race_ms) : null
    }))
})

function formatDateShort(dateStr: string): string {
  if (!dateStr) return '-'
  const date = new Date(dateStr)
  const day = date.getDate()
  const months = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic']
  return `${day} ${months[date.getMonth()]} ${date.getFullYear()}`
}

function getTypeLabel(type: string): string {
  const labels: Record<string, string> = { practice: 'PRACTICE', qualify: 'QUALIFY', race: 'RACE' }
  return labels[type] || type.toUpperCase()
}

function selectSession(sessionId: string) {
  emit('select', sessionId)
  emit('close')
}

function closeModal() {
  emit('close')
}
</script>

<template>
  <Teleport to="body">
    <div v-if="isOpen" class="session-picker-overlay" @click.self="closeModal">
      <div class="session-picker-modal">
        <!-- Header -->
        <div class="spm-header">
          <h2 class="spm-title">Aggiungi Sorgente Dati</h2>
          <p class="spm-subtitle">{{ formatTrackName(currentTrack) }} · {{ filteredSessions.length }} sessioni disponibili</p>
          <button class="spm-close" @click="closeModal">✕</button>
        </div>
        
        <!-- Session List -->
        <div class="spm-list">
          <div 
            v-for="session in filteredSessions" 
            :key="session.id"
            class="session-row"
            @click="selectSession(session.id)"
          >
            <!-- Left side: type, time, car -->
            <div class="row-left">
              <span :class="['session-chip', `session-chip--${session.type}`]">
                {{ getTypeLabel(session.type) }}
              </span>
              <span class="session-date">{{ session.date }}</span>
              <span class="session-time">{{ session.time }}</span>
              <span class="session-car">{{ session.car }}</span>
            </div>
            
            <!-- Right side: stats + times -->
            <div class="row-right">
              <!-- GIRI / STINT chips -->
              <div class="stat-chips">
                <span class="stat-chip">GIRI {{ session.laps }}</span>
                <span class="stat-chip">STINT {{ session.stints }}</span>
              </div>
              
              <!-- Q Badge -->
              <div class="time-slot">
                <span v-if="session.bestQualy" class="time-badge time-badge--qualy">
                  Q {{ session.bestQualy }}
                </span>
                <span v-else class="time-badge time-badge--qualy time-badge--empty">
                  Q —
                </span>
              </div>
              
              <!-- R Badge -->
              <div class="time-slot">
                <span v-if="session.bestRace" class="time-badge time-badge--race">
                  R {{ session.bestRace }}
                </span>
                <span v-else class="time-badge time-badge--race time-badge--empty">
                  R —
                </span>
              </div>
            </div>
          </div>
          
          <!-- Empty state -->
          <div v-if="filteredSessions.length === 0" class="spm-empty">
            Nessuna altra sessione disponibile per questa pista.
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style lang="scss" scoped>
@use '@/assets/scss/variables' as *;

.session-picker-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: rgba(0, 0, 0, 0.85);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
}

.session-picker-modal {
  width: 95%;
  max-width: 900px;
  max-height: 85vh;
  background: linear-gradient(135deg, rgba(15, 23, 42, 0.98) 0%, rgba(18, 18, 24, 0.98) 100%);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 16px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
  box-shadow: 0 25px 80px rgba(0, 0, 0, 0.5);
}

.spm-header {
  position: relative;
  padding: 24px 28px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(0, 0, 0, 0.25);
}

.spm-title {
  font-family: 'Outfit', $font-primary;
  font-size: 20px;
  font-weight: 700;
  color: #fff;
  margin: 0 0 6px 0;
  letter-spacing: 0.5px;
}

.spm-subtitle {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
  margin: 0;
}

.spm-close {
  position: absolute;
  top: 20px;
  right: 20px;
  width: 36px;
  height: 36px;
  border: none;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.6);
  font-size: 16px;
  cursor: pointer;
  transition: all 0.15s;
  
  &:hover {
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.2);
    color: #fff;
  }
}

.spm-list {
  flex: 1;
  overflow-y: auto;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

// === SESSION ROW (copied from SessioniPage) ===
.session-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  background: #121218;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    border-color: rgba(255, 255, 255, 0.25);
    transform: translateY(-2px);
    box-shadow: 
      0 6px 20px rgba(0, 0, 0, 0.3),
      0 0 20px rgba(255, 255, 255, 0.08);
  }
}

.row-left {
  display: flex;
  align-items: center;
  gap: 12px;
}

.row-right {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 4px 8px;
  background: rgba(255, 255, 255, 0.02);
  border-radius: 6px;
}

// Session type chip
.session-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 4px 10px;
  border-radius: 5px;
  font-family: $font-primary;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.8px;
  text-transform: uppercase;

  &--practice {
    background: rgba($accent-info, 0.15);
    border: 1px solid rgba($accent-info, 0.4);
    color: $accent-info;
  }
  &--qualify {
    background: rgba($accent-warning, 0.15);
    border: 1px solid rgba($accent-warning, 0.4);
    color: $accent-warning;
  }
  &--race {
    background: rgba(255, 100, 100, 0.15);
    border: 1px solid rgba(255, 100, 100, 0.4);
    color: rgb(255, 100, 100);
  }
}

.session-date {
  font-family: $font-primary;
  font-size: 12px;
  font-weight: 600;
  color: #60a5fa;
}

.session-time {
  font-family: $font-primary;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}

.session-car {
  font-family: $font-primary;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
}

// Stat chips
.stat-chips {
  display: flex;
  gap: 6px;
}

.stat-chip {
  display: inline-flex;
  align-items: center;
  padding: 3px 8px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 4px;
  font-family: $font-primary;
  font-size: 9px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.5);
  letter-spacing: 0.5px;
}

// Time badges
.time-slot {
  min-width: 90px;
  display: flex;
  justify-content: flex-end;
}

.time-badge {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 10px;
  border-radius: 6px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  font-weight: 600;

  &--qualy {
    background: rgba($accent-warning, 0.12);
    border: 1px solid rgba($accent-warning, 0.3);
    color: $accent-warning;
  }

  &--race {
    background: rgba(255, 100, 100, 0.12);
    border: 1px solid rgba(255, 100, 100, 0.3);
    color: rgb(255, 100, 100);
  }

  &--empty {
    opacity: 0.4;
    background: rgba(255, 255, 255, 0.03);
    border-color: rgba(255, 255, 255, 0.06);
    color: rgba(255, 255, 255, 0.3);
  }
}

.spm-empty {
  text-align: center;
  padding: 48px 20px;
  color: rgba(255, 255, 255, 0.4);
  font-size: 14px;
}
</style>
