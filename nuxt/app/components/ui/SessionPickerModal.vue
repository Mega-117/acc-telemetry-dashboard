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
  (e: 'select', sessionId: string, userId?: string, nickname?: string): void
}>()

const { sessions, fetchSessionFull } = useTelemetryData()
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
const { getUserProfile } = useFirebaseAuth()

// === SHARED LINK INPUT ===
const sharedLink = ref('')
const linkError = ref('')
const isLoadingLink = ref(false)

// Parse shared link to extract sessionId and userId
function parseSharedLink(url: string): { sessionId: string, userId: string } | null {
  // Pattern: /sessioni/SESSION_ID?userId=USER_ID
  const match = url.match(/\/sessioni\/([^?]+)\?userId=([^&]+)/)
  if (match && match[1] && match[2]) return { sessionId: match[1], userId: match[2] }
  return null
}

async function loadSharedLink() {
  linkError.value = ''
  
  const parsed = parseSharedLink(sharedLink.value)
  if (!parsed) {
    linkError.value = 'Link non valido. Formato atteso: .../sessioni/ID?userId=...'
    return
  }
  
  isLoadingLink.value = true
  
  try {
    // 1. Fetch session from external user
    const data = await fetchSessionFull(parsed.sessionId, parsed.userId)
    
    if (!data) {
      linkError.value = 'Sessione non trovata o non più condivisa'
      return
    }
    
    // 2. Check track match
    const sessionTrack = (data.session_info?.track || '').toLowerCase().replace(/[^a-z0-9]/g, '_')
    const currentTrackNorm = props.currentTrack.toLowerCase().replace(/[^a-z0-9]/g, '_')
    
    if (!sessionTrack.includes(currentTrackNorm) && !currentTrackNorm.includes(sessionTrack)) {
      linkError.value = `Pista non corrispondente: ${data.session_info?.track || 'sconosciuta'} vs ${props.currentTrack}`
      return
    }
    
    // 3. Fetch nickname
    let nickname = 'Utente Esterno'
    try {
      const profile = await getUserProfile(parsed.userId)
      nickname = profile?.nickname || profile?.displayName || 'Utente Esterno'
    } catch (e) {
      // Ignore - use default
    }
    
    // 4. Emit with userId and nickname
    emit('select', parsed.sessionId, parsed.userId, nickname)
    emit('close')
    
  } catch (e: any) {
    console.error('[SHARE] Error loading shared session:', e)
    linkError.value = e?.code === 'permission-denied' 
      ? 'Sessione non più condivisa o accesso negato'
      : 'Errore nel caricamento della sessione'
  } finally {
    isLoadingLink.value = false
  }
}

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
        
        <!-- Link Input Section -->
        <div class="spm-link-section">
          <label class="link-label">📋 Incolla link sessione condivisa</label>
          <div class="link-input-row">
            <input 
              v-model="sharedLink"
              type="text"
              class="link-input"
              placeholder="https://...?userId=..."
              @keyup.enter="loadSharedLink"
            />
            <button 
              class="link-load-btn" 
              :disabled="isLoadingLink || !sharedLink"
              @click="loadSharedLink"
            >
              {{ isLoadingLink ? '...' : 'Carica' }}
            </button>
          </div>
          <p v-if="linkError" class="link-error">{{ linkError }}</p>
        </div>

        <div class="spm-divider">
          <span>oppure seleziona dalle tue sessioni</span>
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

// === LINK INPUT SECTION ===
.spm-link-section {
  padding: 16px 20px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(0, 0, 0, 0.15);
}

.link-label {
  display: block;
  font-size: 12px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.7);
  margin-bottom: 10px;
}

.link-input-row {
  display: flex;
  gap: 10px;
}

.link-input {
  flex: 1;
  padding: 10px 14px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  color: #fff;
  font-size: 13px;
  font-family: $font-primary;
  transition: all 0.2s;

  &::placeholder {
    color: rgba(255, 255, 255, 0.3);
  }

  &:focus {
    outline: none;
    border-color: rgba(255, 255, 255, 0.3);
    background: rgba(255, 255, 255, 0.08);
  }
}

.link-load-btn {
  padding: 10px 20px;
  background: $racing-red;
  border: 1px solid $racing-red;
  border-radius: 8px;
  color: #fff;
  font-size: 13px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;

  &:hover:not(:disabled) {
    background: lighten($racing-red, 8%);
    transform: translateY(-1px);
    box-shadow: 0 4px 15px rgba($racing-red, 0.4);
  }

  &:disabled {
    opacity: 0.4;
    background: rgba(255, 255, 255, 0.1);
    border-color: rgba(255, 255, 255, 0.15);
    color: rgba(255, 255, 255, 0.4);
    cursor: not-allowed;
  }
}

.link-error {
  margin-top: 8px;
  font-size: 12px;
  color: #ff6b6b;
}

.spm-divider {
  text-align: center;
  padding: 12px 20px;
  color: rgba(255, 255, 255, 0.35);
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  background: rgba(0, 0, 0, 0.1);
}
</style>
