<script setup lang="ts">
// ============================================
// SessioniPage - Sessions list with filters
// ============================================

import { ref, computed } from 'vue'

// Emit to parent for navigation
const emit = defineEmits<{
  'go-to-session': [sessionId: string]
}>()

// Types
type SessionType = 'practice' | 'qualify' | 'race'

interface Session {
  id: string
  date: string
  time: string
  type: SessionType
  track: string
  car: string
  laps: number
  stints: number
  bestQualy?: string
  bestRace?: string
}

// === FILTER STATE ===
const filterType = ref<'all' | SessionType>('all')
const filterTrack = ref('all')
const filterCar = ref('all')
const filterTimeRange = ref<'today' | '7d' | '30d' | 'all'>('all')

// === VIEW MODE ===
type ViewMode = 'list' | 'card'
const viewMode = ref<ViewMode>('list')

// === MOCK DATA ===
const sessions: Session[] = [
  // 13 Gennaio 2026
  { id: 's1', date: '2026-01-13', time: '19:34', type: 'practice', track: 'Donington', car: 'Ford Mustang GT3', laps: 18, stints: 2, bestQualy: '1:29.456' },
  { id: 's2', date: '2026-01-13', time: '18:22', type: 'practice', track: 'Valencia', car: 'Ford Mustang GT3', laps: 12, stints: 1, bestQualy: '1:31.890' },
  
  // 10 Gennaio 2026
  { id: 's3', date: '2026-01-10', time: '20:15', type: 'race', track: 'Spa', car: 'AMR V8 Vantage GT3', laps: 18, stints: 2, bestRace: '2:17.890' },
  { id: 's4', date: '2026-01-10', time: '18:45', type: 'practice', track: 'Spa', car: 'AMR V8 Vantage GT3', laps: 24, stints: 3, bestQualy: '2:16.543', bestRace: '2:18.234' },
  { id: 's5', date: '2026-01-10', time: '15:30', type: 'qualify', track: 'Spa', car: 'AMR V8 Vantage GT3', laps: 8, stints: 1, bestQualy: '2:16.874' },
  
  // 6 Gennaio 2026
  { id: 's6', date: '2026-01-06', time: '21:00', type: 'race', track: 'Monza', car: 'Ford Mustang GT3', laps: 22, stints: 2, bestRace: '1:48.345' },
  { id: 's7', date: '2026-01-06', time: '19:12', type: 'qualify', track: 'Monza', car: 'Ford Mustang GT3', laps: 6, stints: 1, bestQualy: '1:47.234' },
  { id: 's8', date: '2026-01-06', time: '17:45', type: 'practice', track: 'Monza', car: 'Ford Mustang GT3', laps: 32, stints: 3, bestQualy: '1:47.890', bestRace: '1:48.567' },
  { id: 's9', date: '2026-01-06', time: '15:30', type: 'practice', track: 'Monza', car: 'Ford Mustang GT3', laps: 28, stints: 2, bestQualy: '1:48.234' },
  { id: 's10', date: '2026-01-06', time: '13:00', type: 'race', track: 'Monza', car: 'Ford Mustang GT3', laps: 20, stints: 2, bestRace: '1:48.567', bestQualy: '1:47.890' },
  { id: 's11', date: '2026-01-06', time: '11:30', type: 'qualify', track: 'Monza', car: 'Ford Mustang GT3', laps: 5, stints: 1, bestQualy: '1:47.678' },
  { id: 's12', date: '2026-01-06', time: '09:00', type: 'race', track: 'Monza', car: 'Ford Mustang GT3', laps: 18, stints: 2, bestRace: '1:48.123' },
  
  // 3 Gennaio 2026
  { id: 's13', date: '2026-01-03', time: '20:30', type: 'race', track: 'Monza', car: 'Ford Mustang GT3', laps: 16, stints: 2, bestRace: '1:49.234' },
  { id: 's14', date: '2026-01-03', time: '18:00', type: 'practice', track: 'Monza', car: 'Ford Mustang GT3', laps: 24, stints: 2, bestQualy: '1:48.567' },
  { id: 's15', date: '2026-01-03', time: '16:30', type: 'qualify', track: 'Monza', car: 'Ford Mustang GT3', laps: 6, stints: 1, bestQualy: '1:48.012', bestRace: '1:49.890' },
  
  // 31 Dicembre 2025
  { id: 's16', date: '2025-12-31', time: '22:00', type: 'practice', track: 'Paul Ricard', car: 'Ford Mustang GT3', laps: 20, stints: 2, bestQualy: '1:54.234' },
  { id: 's17', date: '2025-12-31', time: '19:30', type: 'practice', track: 'Donington', car: 'Ford Mustang GT3', laps: 18, stints: 2, bestQualy: '1:29.890' },
  
  // 30 Dicembre 2025
  { id: 's18', date: '2025-12-30', time: '21:15', type: 'practice', track: 'Donington', car: 'Ford Mustang GT3', laps: 27, stints: 3, bestQualy: '1:29.123' },
  { id: 's19', date: '2025-12-30', time: '18:00', type: 'practice', track: 'Paul Ricard', car: 'Ford Mustang GT3', laps: 22, stints: 2, bestQualy: '1:54.567' },
  { id: 's20', date: '2025-12-30', time: '15:30', type: 'practice', track: 'Donington', car: 'AMR V8 Vantage GT3', laps: 16, stints: 2, bestQualy: '1:30.234' },
  { id: 's21', date: '2025-12-30', time: '12:00', type: 'practice', track: 'Donington', car: 'Ford Mustang GT3', laps: 30, stints: 3, bestQualy: '1:29.456', bestRace: '1:30.890' },
]

// Extract unique values for filters
const tracks = computed(() => [...new Set(sessions.map(s => s.track))].sort())
const cars = computed(() => [...new Set(sessions.map(s => s.car))].sort())

// Filtered sessions
const filteredSessions = computed(() => {
  return sessions.filter(session => {
    // Type filter
    if (filterType.value !== 'all' && session.type !== filterType.value) return false
    
    // Track filter
    if (filterTrack.value !== 'all' && session.track !== filterTrack.value) return false
    
    // Car filter
    if (filterCar.value !== 'all' && session.car !== filterCar.value) return false
    
    // Time range filter (mock - just for UI)
    if (filterTimeRange.value !== 'all') {
      const today = new Date('2026-01-13') // Mock "today"
      const sessionDate = new Date(session.date)
      const diffDays = Math.floor((today.getTime() - sessionDate.getTime()) / (1000 * 60 * 60 * 24))
      
      if (filterTimeRange.value === 'today' && diffDays > 0) return false
      if (filterTimeRange.value === '7d' && diffDays > 7) return false
      if (filterTimeRange.value === '30d' && diffDays > 30) return false
    }
    
    return true
  })
})

// Group filtered sessions by date
const sessionsByDay = computed(() => {
  const groups: Record<string, Session[]> = {}
  
  for (const session of filteredSessions.value) {
    if (!groups[session.date]) {
      groups[session.date] = []
    }
    groups[session.date]!.push(session)
  }
  
  return Object.entries(groups)
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, sessions]) => ({ date, sessions }))
})

// Format date for header
function formatDateHeader(dateStr: string): string {
  const date = new Date(dateStr)
  const day = date.getDate()
  const months = ['GENNAIO', 'FEBBRAIO', 'MARZO', 'APRILE', 'MAGGIO', 'GIUGNO', 
                  'LUGLIO', 'AGOSTO', 'SETTEMBRE', 'OTTOBRE', 'NOVEMBRE', 'DICEMBRE']
  const month = months[date.getMonth()]
  const year = date.getFullYear()
  return `${day} ${month} ${year}`
}

// Get session type label
function getTypeLabel(type: SessionType): string {
  const labels = { practice: 'PRACTICE', qualify: 'QUALIFY', race: 'RACE' }
  return labels[type]
}

// Navigate to session detail via emit
function goToSession(id: string) {
  emit('go-to-session', id)
}
</script>

<template>
  <LayoutPageContainer>
    <h1 class="page-title">SESSIONI</h1>
    
    <!-- FILTERS -->
    <div class="filters">
      <!-- Left: Filter controls -->
      <div class="filters-left">
        <!-- Type filter (segmented) -->
        <div class="filter-group">
          <div class="segmented-control">
            <button 
              :class="['seg-btn', { 'seg-btn--active': filterType === 'all' }]"
              @click="filterType = 'all'"
            >Tutto</button>
            <button 
              :class="['seg-btn', 'seg-btn--practice', { 'seg-btn--active': filterType === 'practice' }]"
              @click="filterType = 'practice'"
            >Practice</button>
            <button 
              :class="['seg-btn', 'seg-btn--qualify', { 'seg-btn--active': filterType === 'qualify' }]"
              @click="filterType = 'qualify'"
            >Qualify</button>
            <button 
              :class="['seg-btn', 'seg-btn--race', { 'seg-btn--active': filterType === 'race' }]"
              @click="filterType = 'race'"
            >Race</button>
          </div>
        </div>
        
        <!-- Track select -->
        <div class="filter-group">
          <select v-model="filterTrack" class="filter-select">
            <option value="all">Tutte le piste</option>
            <option v-for="track in tracks" :key="track" :value="track">{{ track }}</option>
          </select>
        </div>
        
        <!-- Car select -->
        <div class="filter-group">
          <select v-model="filterCar" class="filter-select">
            <option value="all">Tutte le auto</option>
            <option v-for="car in cars" :key="car" :value="car">{{ car }}</option>
          </select>
        </div>
        
        <!-- Time range (segmented) -->
        <div class="filter-group">
          <div class="segmented-control segmented-control--compact">
            <button 
              :class="['seg-btn', { 'seg-btn--active': filterTimeRange === 'today' }]"
              @click="filterTimeRange = 'today'"
            >Oggi</button>
            <button 
              :class="['seg-btn', { 'seg-btn--active': filterTimeRange === '7d' }]"
              @click="filterTimeRange = '7d'"
            >7g</button>
            <button 
              :class="['seg-btn', { 'seg-btn--active': filterTimeRange === '30d' }]"
              @click="filterTimeRange = '30d'"
            >30g</button>
            <button 
              :class="['seg-btn', { 'seg-btn--active': filterTimeRange === 'all' }]"
              @click="filterTimeRange = 'all'"
            >Tutto</button>
          </div>
        </div>
      </div>
      
      <!-- Right: View mode toggle -->
      <div class="filters-right">
        <div class="view-toggle">
          <button 
            :class="['view-btn', { 'view-btn--active': viewMode === 'list' }]"
            @click="viewMode = 'list'"
            title="Vista lista"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M8 6h13M8 12h13M8 18h13M3 6h.01M3 12h.01M3 18h.01"/>
            </svg>
          </button>
          <button 
            :class="['view-btn', { 'view-btn--active': viewMode === 'card' }]"
            @click="viewMode = 'card'"
            title="Vista card"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="7" height="7" rx="1"/>
              <rect x="14" y="3" width="7" height="7" rx="1"/>
              <rect x="3" y="14" width="7" height="7" rx="1"/>
              <rect x="14" y="14" width="7" height="7" rx="1"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
    
    <!-- No results -->
    <div v-if="sessionsByDay.length === 0" class="no-results">
      <p>Nessuna sessione trovata con i filtri selezionati.</p>
    </div>
    
    <!-- LIST VIEW (original) -->
    <div v-else-if="viewMode === 'list'" class="day-groups">
      <div v-for="group in sessionsByDay" :key="group.date" class="day-group">
        <!-- Day header -->
        <div class="day-header">
          <span class="day-date">{{ formatDateHeader(group.date) }}</span>
          <span class="day-count">{{ group.sessions.length }} sessioni</span>
        </div>
        
        <!-- Sessions list -->
        <div class="sessions-list">
          <div 
            v-for="session in group.sessions" 
            :key="session.id"
            class="session-row"
            @click="goToSession(session.id)"
          >
            <!-- Left side: type, time, track, car -->
            <div class="row-left">
              <span :class="['session-chip', `session-chip--${session.type}`]">
                {{ getTypeLabel(session.type) }}
              </span>
              <span class="session-time">{{ session.time }}</span>
              <span class="session-track">{{ session.track }}</span>
              <span class="session-car">{{ session.car }}</span>
            </div>
            
            <!-- Right side: stats + times (grid layout) -->
            <div class="row-right">
              <!-- GIRI / STINT chips -->
              <div class="stat-chips">
                <span class="stat-chip">GIRI {{ session.laps }}</span>
                <span class="stat-chip">STINT {{ session.stints }}</span>
              </div>
              
              <!-- Q Badge (fixed slot) -->
              <div class="time-slot">
                <span v-if="session.bestQualy" class="time-badge time-badge--qualy">
                  Q {{ session.bestQualy }}
                </span>
                <span v-else class="time-badge time-badge--qualy time-badge--empty">
                  Q —
                </span>
              </div>
              
              <!-- R Badge (fixed slot) -->
              <div class="time-slot">
                <span v-if="session.bestRace" class="time-badge time-badge--race">
                  R {{ session.bestRace }}
                </span>
                <span v-else class="time-badge time-badge--race time-badge--empty">
                  R —
                </span>
              </div>
              
              <!-- CTA Arrow -->
              <span class="session-cta">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M9 18l6-6-6-6"/>
                </svg>
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
    
    <!-- CARD VIEW (grouped) -->
    <div v-else class="day-cards">
      <div v-for="group in sessionsByDay" :key="group.date" class="day-card">
        <!-- Card header with date -->
        <div class="card-header">
          <div class="card-header-info">
            <span class="card-date">{{ formatDateHeader(group.date) }}</span>
            <span class="card-count">{{ group.sessions.length }} sessioni</span>
          </div>
        </div>
        
        <!-- Sessions inside card -->
        <div class="card-sessions">
          <div 
            v-for="session in group.sessions" 
            :key="session.id"
            class="card-session-row"
            @click="goToSession(session.id)"
          >
            <!-- Type chip -->
            <span :class="['session-chip', `session-chip--${session.type}`]">
              {{ getTypeLabel(session.type) }}
            </span>
            
            <!-- Time -->
            <span class="card-session-time">{{ session.time }}</span>
            
            <!-- Track -->
            <span class="card-session-track">{{ session.track }}</span>
            
            <!-- Car -->
            <span class="card-session-car">{{ session.car }}</span>
            
            <!-- Laps/Stints -->
            <div class="card-stat-chips">
              <span class="stat-chip">GIRI {{ session.laps }}</span>
              <span class="stat-chip">STINT {{ session.stints }}</span>
            </div>
            
            <!-- Times (with placeholders for alignment) -->
            <div class="card-time-slot">
              <span v-if="session.bestQualy" class="time-badge time-badge--qualy">
                Q {{ session.bestQualy }}
              </span>
              <span v-else class="time-badge time-badge--qualy time-badge--empty">
                Q —
              </span>
            </div>
            
            <div class="card-time-slot">
              <span v-if="session.bestRace" class="time-badge time-badge--race">
                R {{ session.bestRace }}
              </span>
              <span v-else class="time-badge time-badge--race time-badge--empty">
                R —
              </span>
            </div>
            
            <!-- Arrow -->
            <span class="session-cta">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M9 18l6-6-6-6"/>
              </svg>
            </span>
          </div>
        </div>
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
  margin-bottom: 20px;
  letter-spacing: 1px;
}

// === FILTERS ===
.filters {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 16px;
  margin-bottom: 24px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
}

.filters-left {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}

.filters-right {
  display: flex;
  align-items: center;
}

.view-toggle {
  display: flex;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 8px;
  padding: 3px;
  gap: 2px;
}

.view-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 36px;
  height: 32px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;

  svg {
    width: 18px;
    height: 18px;
    color: rgba(255, 255, 255, 0.4);
    transition: color 0.15s ease;
  }

  &:hover {
    background: rgba(255, 255, 255, 0.05);
    svg { color: rgba(255, 255, 255, 0.7); }
  }

  &--active {
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.2);
    svg { color: #fff; }
  }
}

.filter-group {
  display: flex;
  align-items: center;
}

// Segmented control
.segmented-control {
  display: flex;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 8px;
  padding: 3px;
  gap: 2px;

  &--compact .seg-btn {
    padding: 6px 12px;
    min-width: 50px;
  }
}

.seg-btn {
  padding: 6px 14px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.5);
  font-family: $font-primary;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.3px;
  text-transform: uppercase;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    color: rgba(255, 255, 255, 0.8);
    background: rgba(255, 255, 255, 0.05);
    border-color: rgba(255, 255, 255, 0.1);
  }

  &--active {
    background: rgba(255, 255, 255, 0.08);
    border: 1px solid rgba(255, 255, 255, 0.2);
    color: #fff;
  }

  // Type-specific active states (aligned with session-chip)
  &--practice.seg-btn--active {
    background: rgba($accent-info, 0.12);
    border: 1px solid rgba($accent-info, 0.4);
    color: $accent-info;
  }

  &--qualify.seg-btn--active {
    background: rgba($accent-warning, 0.12);
    border: 1px solid rgba($accent-warning, 0.4);
    color: $accent-warning;
  }

  &--race.seg-btn--active {
    background: rgba(255, 100, 100, 0.12);
    border: 1px solid rgba(255, 100, 100, 0.35);
    color: rgb(255, 100, 100);
  }
}

// Select
.filter-select {
  padding: 8px 32px 8px 12px;
  background: rgba(0, 0, 0, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.8);
  font-family: $font-primary;
  font-size: 12px;
  cursor: pointer;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%23ffffff80' stroke-width='2'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 10px center;

  &:focus {
    outline: none;
    border-color: rgba($racing-red, 0.5);
  }

  option {
    background: #1a1a24;
    color: #fff;
  }
}

// No results
.no-results {
  padding: 48px;
  text-align: center;
  color: rgba(255, 255, 255, 0.4);
  font-family: $font-primary;
}

// === DAY GROUPS ===
.day-groups {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.day-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.day-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 8px 0;
}

.day-date {
  font-family: 'Outfit', $font-primary;
  font-size: 13px;
  font-weight: 700;
  color: #fff;
  letter-spacing: 0.5px;
}

.day-count {
  font-family: $font-primary;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.4);
}

// === SESSIONS LIST ===
.sessions-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.session-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 14px 16px;
  background: #121218;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.04);
    border-color: rgba($racing-red, 0.3);

    .row-right {
      background: rgba(255, 255, 255, 0.02);
    }

    .session-cta {
      color: #fff;
      transform: translateX(2px);
    }
  }
}

// Left side
.row-left {
  display: flex;
  align-items: center;
  gap: 16px;
}

.session-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 6px 12px;
  border-radius: 6px;
  font-family: $font-primary;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  min-width: 80px;

  &--practice {
    background: rgba($accent-info, 0.12);
    border: 1px solid rgba($accent-info, 0.4);
    color: $accent-info;
  }

  &--qualify {
    background: rgba($accent-warning, 0.12);
    border: 1px solid rgba($accent-warning, 0.4);
    color: $accent-warning;
  }

  &--race {
    // Rosso più soft
    background: rgba(255, 100, 100, 0.12);
    border: 1px solid rgba(255, 100, 100, 0.35);
    color: rgb(255, 100, 100);
  }
}

.session-time {
  font-family: $font-primary;
  font-size: 14px;
  font-weight: 500;
  color: #fff;
  min-width: 45px;
}

.session-track {
  font-family: $font-primary;
  font-size: 14px;
  font-weight: 500;
  color: #fff;
  min-width: 100px;
}

.session-car {
  font-family: $font-primary;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.45);
}

// Right side (Grid layout for fixed alignment)
.row-right {
  display: grid;
  grid-template-columns: auto 105px 105px 32px;
  align-items: center;
  gap: 12px;
  padding: 6px 8px 6px 16px;
  border-radius: 8px;
  transition: background 0.15s ease;
}

// Stat chips
.stat-chips {
  display: flex;
  gap: 6px;
}

.stat-chip {
  padding: 4px 10px;
  background: rgba(255, 255, 255, 0.06);
  border-radius: 4px;
  font-family: $font-primary;
  font-size: 10px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.6);
  letter-spacing: 0.3px;
}

// Time slot (fixed width container)
.time-slot {
  display: flex;
  justify-content: center;
}

// Time badges (aligned with session-chip style)
.time-badge {
  padding: 6px 12px;
  border-radius: 6px;
  font-family: 'JetBrains Mono', 'Consolas', monospace;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.3px;
  white-space: nowrap;
  min-width: 95px;
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

  // Empty state (no data placeholder)
  &--empty {
    opacity: 0.35;
  }
}

.session-cta {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  color: rgba(255, 255, 255, 0.5);
  transition: all 0.15s ease;

  svg {
    width: 18px;
    height: 18px;
  }
}

// === RESPONSIVE ===
@media (max-width: 1200px) {
  .row-left {
    gap: 12px;
  }

  .session-car {
    display: none;
  }
}

@media (max-width: 900px) {
  .session-row {
    flex-direction: column;
    align-items: stretch;
    gap: 12px;
  }

  .row-left {
    flex-wrap: wrap;
  }

  .row-right {
    justify-content: space-between;
    padding: 8px 0 0 0;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
  }

  .session-car {
    display: block;
    width: 100%;
    margin-top: 4px;
  }
}

@media (max-width: 640px) {
  .filters {
    flex-direction: column;
    gap: 8px;
  }

  .segmented-control {
    width: 100%;
    justify-content: space-between;
  }

  .seg-btn {
    flex: 1;
    padding: 8px 8px;
    font-size: 11px;
  }

  .filter-select {
    width: 100%;
  }

  .stat-chips {
    gap: 4px;
  }

  .stat-chip {
    padding: 3px 8px;
    font-size: 9px;
  }

  .time-badge {
    padding: 4px 8px;
    font-size: 11px;
  }
}

// === CARD VIEW ===
.day-cards {
  display: flex;
  flex-direction: column;
  gap: 32px;
}

.day-card {
  position: relative;
  background: linear-gradient(145deg, #151520 0%, #0d0d12 100%);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 16px;
  overflow: hidden;
  
  // Subtle premium border glow
  &::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 16px;
    padding: 1px;
    background: linear-gradient(135deg, rgba($racing-red, 0.15) 0%, transparent 50%, rgba($racing-orange, 0.1) 100%);
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    pointer-events: none;
  }
}

.card-header {
  display: flex;
  align-items: center;
  padding: 18px 24px;
  background: rgba(255, 255, 255, 0.04);
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
}

.card-header-info {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.card-date {
  font-family: 'Outfit', $font-primary;
  font-size: 16px;
  font-weight: 700;
  color: #fff;
  letter-spacing: 0.5px;
}

.card-count {
  font-family: $font-primary;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}

.card-sessions {
  display: flex;
  flex-direction: column;
}

.card-session-row {
  display: grid;
  grid-template-columns: 90px 50px 120px 1fr auto 105px 105px 32px;
  align-items: center;
  gap: 12px;
  padding: 14px 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.04);
  cursor: pointer;
  transition: all 0.15s ease;

  &:last-child {
    border-bottom: none;
  }

  &:hover {
    background: rgba(255, 255, 255, 0.03);

    .session-cta {
      color: #fff;
      transform: translateX(2px);
    }
  }
}

.card-session-time {
  font-family: $font-primary;
  font-size: 14px;
  font-weight: 500;
  color: #fff;
}

.card-session-track {
  font-family: $font-primary;
  font-size: 14px;
  font-weight: 500;
  color: #fff;
}

.card-session-car {
  font-family: $font-primary;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.45);
}

.card-stat-chips {
  display: flex;
  gap: 6px;
}

.card-time-slot {
  display: flex;
  justify-content: center;
}
</style>
