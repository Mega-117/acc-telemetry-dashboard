<script setup lang="ts">
// ============================================
// TrackDetailPage - Track detail view (placeholder)
// ============================================

import { ref, computed } from 'vue'
import { Line } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js'

// Register Chart.js components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
)

const props = defineProps<{
  trackId: string
}>()

const emit = defineEmits<{
  back: []
}>()

// Types
type SessionType = 'practice' | 'qualify' | 'race'

interface Session {
  id: string
  date: string
  time: string
  type: SessionType
  car: string
  laps: number
  stints: number
  bestQualy?: string
  bestRace?: string
}

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
  bestQualyConditions: {
    airTemp: 22,
    trackTemp: 28,
    grip: 'Optimum'
  },
  bestRace: '1:48.123',
  bestRaceConditions: {
    airTemp: 19,
    trackTemp: 24,
    grip: 'Fast'
  },
  bestAvgRace: '1:48.890',
  bestAvgRaceConditions: {
    airTemp: 21,
    trackTemp: 26,
    grip: 'Optimum'
  }
})

// Skill level targets (static for now - will be fetched later)
const skillTargets = ref({
  qualy: {
    pro: '1:46.500',
    amateur: '1:48.000',
    rookie: '1:50.000'
  },
  race: {
    pro: '1:47.500',
    amateur: '1:49.000',
    rookie: '1:51.000'
  },
  avgRace: {
    pro: '1:48.000',
    amateur: '1:49.500',
    rookie: '1:51.500'
  }
})

// Determine skill level based on time
type SkillLevel = 'pro' | 'amateur' | 'rookie'

function getSkillLevel(time: string | undefined, targets: { pro: string, amateur: string, rookie: string }): SkillLevel {
  if (!time) return 'rookie'
  const timeSeconds = timeToSeconds(time)
  const proSeconds = timeToSeconds(targets.pro)
  const amateurSeconds = timeToSeconds(targets.amateur)
  
  if (timeSeconds <= proSeconds) return 'pro'
  if (timeSeconds <= amateurSeconds) return 'amateur'
  return 'rookie'
}

const skillRatings = computed(() => ({
  qualy: getSkillLevel(track.value.bestQualy, skillTargets.value.qualy),
  race: getSkillLevel(track.value.bestRace, skillTargets.value.race),
  avgRace: getSkillLevel(track.value.bestAvgRace, skillTargets.value.avgRace)
}))

// Activity stats for this track (last 7 days)
const activityStats = ref({
  totalLaps: 127,
  validLaps: 98,
  validPercentage: 77,
  timeOnTrack: '3h 42m',
  sessionsCount: 5,
  lastActivity: '2026-01-06'
})

// Mock session history (same structure as SessioniPage)
const recentSessions = ref<Session[]>([
  { id: '1', date: '2026-01-06', time: '21:00', type: 'race', car: 'Ford Mustang GT3', laps: 22, stints: 2, bestRace: '1:48.123' },
  { id: '2', date: '2026-01-06', time: '19:12', type: 'qualify', car: 'Ford Mustang GT3', laps: 6, stints: 1, bestQualy: '1:47.234' },
  { id: '3', date: '2026-01-06', time: '17:45', type: 'practice', car: 'Ford Mustang GT3', laps: 32, stints: 3, bestQualy: '1:47.890', bestRace: '1:48.567' },
  { id: '4', date: '2026-01-03', time: '20:30', type: 'race', car: 'Ford Mustang GT3', laps: 16, stints: 2, bestRace: '1:49.234' },
  { id: '5', date: '2026-01-03', time: '18:00', type: 'practice', car: 'Ford Mustang GT3', laps: 24, stints: 2, bestQualy: '1:48.567' },
  { id: '6', date: '2025-12-28', time: '21:15', type: 'practice', car: 'Ford Mustang GT3', laps: 20, stints: 2, bestQualy: '1:48.890' },
  { id: '7', date: '2025-12-28', time: '19:00', type: 'qualify', car: 'Ford Mustang GT3', laps: 5, stints: 1, bestQualy: '1:48.234' },
  { id: '8', date: '2025-12-20', time: '20:30', type: 'race', car: 'Ford Mustang GT3', laps: 18, stints: 2, bestRace: '1:49.567' },
  { id: '9', date: '2025-12-20', time: '18:00', type: 'practice', car: 'Ford Mustang GT3', laps: 28, stints: 3, bestQualy: '1:48.123', bestRace: '1:49.234' },
  { id: '10', date: '2025-12-12', time: '21:00', type: 'practice', car: 'Ford Mustang GT3', laps: 22, stints: 2, bestQualy: '1:49.567' },
  { id: '11', date: '2025-12-12', time: '19:00', type: 'qualify', car: 'Ford Mustang GT3', laps: 6, stints: 1, bestQualy: '1:49.123' },
  { id: '12', date: '2025-12-05', time: '20:00', type: 'race', car: 'Ford Mustang GT3', laps: 20, stints: 2, bestRace: '1:50.234' },
  { id: '13', date: '2025-12-05', time: '18:00', type: 'practice', car: 'Ford Mustang GT3', laps: 26, stints: 2, bestQualy: '1:49.890' },
  { id: '14', date: '2025-11-28', time: '21:30', type: 'practice', car: 'Ford Mustang GT3', laps: 24, stints: 2, bestQualy: '1:50.567' },
  { id: '15', date: '2025-11-28', time: '19:15', type: 'race', car: 'Ford Mustang GT3', laps: 16, stints: 2, bestRace: '1:51.234' },
  { id: '16', date: '2025-11-20', time: '20:00', type: 'practice', car: 'Ford Mustang GT3', laps: 22, stints: 2, bestQualy: '1:51.890' },
  { id: '17', date: '2025-11-20', time: '18:00', type: 'qualify', car: 'Ford Mustang GT3', laps: 5, stints: 1, bestQualy: '1:51.234' },
  { id: '18', date: '2025-11-15', time: '21:00', type: 'race', car: 'Ford Mustang GT3', laps: 18, stints: 2, bestRace: '1:52.567' },
  { id: '19', date: '2025-11-15', time: '19:00', type: 'practice', car: 'Ford Mustang GT3', laps: 28, stints: 3, bestQualy: '1:52.123' },
  { id: '20', date: '2025-11-10', time: '20:30', type: 'practice', car: 'Ford Mustang GT3', laps: 20, stints: 2, bestQualy: '1:52.890' },
  { id: '21', date: '2025-11-10', time: '18:00', type: 'qualify', car: 'Ford Mustang GT3', laps: 6, stints: 1, bestQualy: '1:52.456' },
  { id: '22', date: '2025-11-05', time: '21:00', type: 'race', car: 'Ford Mustang GT3', laps: 16, stints: 2, bestRace: '1:53.234' },
  { id: '23', date: '2025-11-05', time: '19:00', type: 'practice', car: 'Ford Mustang GT3', laps: 24, stints: 2, bestQualy: '1:53.890' },
  { id: '24', date: '2025-10-28', time: '20:00', type: 'practice', car: 'Ford Mustang GT3', laps: 22, stints: 2, bestQualy: '1:54.123' },
  { id: '25', date: '2025-10-28', time: '18:00', type: 'race', car: 'Ford Mustang GT3', laps: 18, stints: 2, bestRace: '1:54.567' },
])

// === PAGINATION ===
const currentPage = ref(1)
const itemsPerPage = 20

const totalPages = computed(() => Math.max(1, Math.ceil(recentSessions.value.length / itemsPerPage)))

const paginatedSessions = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage
  const end = start + itemsPerPage
  return recentSessions.value.slice(start, end)
})

function goToPage(page: number) {
  if (page >= 1 && page <= totalPages.value) {
    currentPage.value = page
  }
}

function prevPage() {
  if (currentPage.value > 1) currentPage.value--
}

function nextPage() {
  if (currentPage.value < totalPages.value) currentPage.value++
}

// Smooth page change animation
const sessionsRef = ref<HTMLElement | null>(null)
const isChangingPage = ref(false)

function onPageChange() {
  isChangingPage.value = true
}

// Historical best times data for the chart (mock data - chronological order)
interface HistoricalTime {
  date: string
  bestQualy?: string
  bestRace?: string
}

const historicalTimes = ref<HistoricalTime[]>([
  { date: '2025-11-15', bestQualy: '1:52.456', bestRace: '1:53.890' },
  { date: '2025-11-28', bestQualy: '1:51.234', bestRace: '1:52.567' },
  { date: '2025-12-05', bestQualy: '1:50.123', bestRace: '1:51.234' },
  { date: '2025-12-12', bestQualy: '1:49.567', bestRace: '1:50.890' },
  { date: '2025-12-20', bestQualy: '1:48.890', bestRace: '1:49.567' },
  { date: '2025-12-28', bestQualy: '1:48.234', bestRace: '1:49.123' },
  { date: '2026-01-03', bestQualy: '1:47.890', bestRace: '1:48.890' },
  { date: '2026-01-06', bestQualy: '1:47.234', bestRace: '1:48.123' },
])

// Convert time string to seconds for chart calculations
function timeToSeconds(time: string): number {
  if (!time || !time.includes(':')) return 0
  const parts = time.split(':')
  const mins = parseInt(parts[0] || '0')
  const rest = parts[1] || '0.000'
  const secParts = rest.split('.')
  const secs = parseInt(secParts[0] || '0')
  const ms = parseInt(secParts[1] || '0')
  return mins * 60 + secs + ms / 1000
}

// Convert seconds back to time string for display
function secondsToTimeString(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = (seconds % 60).toFixed(3)
  return `${mins}:${secs.padStart(6, '0')}`
}

// Chart.js data configuration
const chartJsData = computed(() => {
  const times = historicalTimes.value
  
  // Labels (dates)
  const labels = times.map(t => 
    new Date(t.date).toLocaleDateString('it-IT', { day: '2-digit', month: 'short' })
  )
  
  // Qualifying times (convert to seconds for Y axis)
  const qualyData = times.map(t => t.bestQualy ? timeToSeconds(t.bestQualy) : null)
  
  // Race times
  const raceData = times.map(t => t.bestRace ? timeToSeconds(t.bestRace) : null)
  
  return {
    labels,
    datasets: [
      {
        label: 'Best Qualifying',
        data: qualyData,
        borderColor: '#f0b400',
        backgroundColor: 'rgba(240, 180, 0, 0.1)',
        borderWidth: 2.5,
        pointRadius: 5,
        pointHoverRadius: 7,
        pointBackgroundColor: '#f0b400',
        pointBorderColor: '#f0b400',
        tension: 0.3,
        fill: false
      },
      {
        label: 'Best Race',
        data: raceData,
        borderColor: '#ff6464',
        backgroundColor: 'rgba(255, 100, 100, 0.1)',
        borderWidth: 2.5,
        pointRadius: 5,
        pointHoverRadius: 7,
        pointBackgroundColor: '#ff6464',
        pointBorderColor: '#ff6464',
        tension: 0.3,
        fill: false
      }
    ]
  }
})

// Chart.js options configuration
const chartOptions = computed(() => {
  const times = historicalTimes.value
  const qualyTimes = times.filter(t => t.bestQualy).map(t => timeToSeconds(t.bestQualy!))
  const raceTimes = times.filter(t => t.bestRace).map(t => timeToSeconds(t.bestRace!))
  const allTimes = [...qualyTimes, ...raceTimes]
  const minTime = Math.min(...allTimes) - 0.5
  const maxTime = Math.max(...allTimes) + 0.5
  
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      intersect: false,
      mode: 'index' as const
    },
    plugins: {
      legend: {
        display: true,
        position: 'bottom' as const,
        labels: {
          color: 'rgba(255, 255, 255, 0.7)',
          usePointStyle: true,
          padding: 20,
          font: {
            family: "'Inter', sans-serif",
            size: 12
          }
        }
      },
      tooltip: {
        enabled: true,
        backgroundColor: 'rgba(20, 20, 30, 0.95)',
        titleColor: '#fff',
        bodyColor: 'rgba(255, 255, 255, 0.8)',
        borderColor: 'rgba(255, 255, 255, 0.1)',
        borderWidth: 1,
        cornerRadius: 8,
        padding: 12,
        callbacks: {
          label: function(context: any) {
            const value = context.parsed.y
            if (value === null) return ''
            return `${context.dataset.label}: ${secondsToTimeString(value)}`
          }
        }
      }
    },
    scales: {
      x: {
        grid: {
          color: 'rgba(255, 255, 255, 0.06)',
          drawBorder: false
        },
        ticks: {
          color: 'rgba(255, 255, 255, 0.5)',
          font: {
            family: "'Inter', sans-serif",
            size: 11
          }
        }
      },
      y: {
        min: minTime,
        max: maxTime,
        grid: {
          color: 'rgba(255, 255, 255, 0.06)',
          drawBorder: false
        },
        ticks: {
          color: 'rgba(255, 255, 255, 0.5)',
          font: {
            family: "'JetBrains Mono', monospace",
            size: 11
          },
          callback: function(value: any) {
            return secondsToTimeString(value)
          }
        }
      }
    }
  }
})

function formatDate(dateStr: string): string {
  const date = new Date(dateStr)
  const day = date.getDate()
  const months = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic']
  const month = months[date.getMonth()]
  const year = date.getFullYear()
  return `${day} ${month} ${year}`
}

function getTypeLabel(type: SessionType): string {
  const labels = { practice: 'PRACTICE', qualify: 'QUALIFY', race: 'RACE' }
  return labels[type]
}

function goToSession(id: string) {
  // TODO: Navigate to session detail
  console.log('Navigate to session:', id)
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

    <!-- 2-Column Layout -->
    <div class="page-layout">
      <div class="main-content">
        <!-- Historical Times Chart -->
        <div class="section">
          <h2 class="section-title">Storico Tempi</h2>
          <div class="chart-container">
            <div class="chart-wrapper">
              <Line :data="chartJsData" :options="chartOptions" />
            </div>
          </div>
        </div>
        <!-- /Chart -->

        <!-- Recent Sessions (same layout as SessioniPage) -->
        <div ref="sessionsRef" class="section">
          <h2 class="section-title">Sessioni Recenti</h2>
          <div :class="['sessions-list', { 'sessions-list--fading': isChangingPage }]" @transitionend="isChangingPage = false">
            <div 
              v-for="session in paginatedSessions" 
              :key="session.id"
              class="session-row"
              @click="goToSession(session.id)"
            >
              <!-- Left side: type, time, date, car -->
              <div class="row-left">
                <span :class="['session-chip', `session-chip--${session.type}`]">
                  {{ getTypeLabel(session.type) }}
                </span>
                <span class="session-time">{{ session.time }}</span>
                <span class="session-date">{{ formatDate(session.date) }}</span>
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

        <!-- PAGINATION CONTROLS -->
        <UiPaginationControls
          v-model:currentPage="currentPage"
          :total-pages="totalPages"
          :total-items="recentSessions.length"
          :scroll-target="sessionsRef"
          item-label="sessioni"
          @page-change="onPageChange"
        />
        <!-- /sessions section -->
      </div>
      <!-- /main-content -->

      <!-- Sidebar (right - 35%) -->
      <aside class="sidebar">
        <!-- Best Times Section -->
        <div class="sidebar-section">
          <h2 class="section-title">Migliori Tempi</h2>
          <div class="best-times-stack">
            <div class="best-time-card best-time-card--qualy">
              <span class="time-label">Best Qualifying</span>
              <span class="time-value">{{ track.bestQualy || '—:—.---' }}</span>
              <span v-if="track.bestQualyConditions" class="time-conditions">
                <span>Aria {{ track.bestQualyConditions.airTemp }}°C</span>
                <span class="condition-separator">·</span>
                <span>Asfalto {{ track.bestQualyConditions.trackTemp }}°C</span>
                <span class="condition-separator">·</span>
                <span>{{ track.bestQualyConditions.grip }}</span>
              </span>
            </div>
            <div class="best-time-card best-time-card--race">
              <span class="time-label">Best Race</span>
              <span class="time-value">{{ track.bestRace || '—:—.---' }}</span>
              <span v-if="track.bestRaceConditions" class="time-conditions">
                <span>Aria {{ track.bestRaceConditions.airTemp }}°C</span>
                <span class="condition-separator">·</span>
                <span>Asfalto {{ track.bestRaceConditions.trackTemp }}°C</span>
                <span class="condition-separator">·</span>
                <span>{{ track.bestRaceConditions.grip }}</span>
              </span>
            </div>
            <div class="best-time-card best-time-card--avg">
              <span class="time-label">Best Average Race</span>
              <span class="time-value">{{ track.bestAvgRace || '—:—.---' }}</span>
              <span v-if="track.bestAvgRaceConditions" class="time-conditions">
                <span>Aria {{ track.bestAvgRaceConditions.airTemp }}°C</span>
                <span class="condition-separator">·</span>
                <span>Asfalto {{ track.bestAvgRaceConditions.trackTemp }}°C</span>
                <span class="condition-separator">·</span>
                <span>{{ track.bestAvgRaceConditions.grip }}</span>
              </span>
            </div>
          </div>
        </div>

        <!-- Activity Stats Section -->
        <div class="sidebar-section">
          <h2 class="section-title">Attività Ultimi 7 Giorni</h2>
          <div class="activity-stack">
            <div class="activity-item">
              <span class="activity-value">{{ activityStats.totalLaps }}</span>
              <span class="activity-label">Giri Totali</span>
            </div>
            <div class="activity-item">
              <span class="activity-value">{{ activityStats.validLaps }}</span>
              <span class="activity-label">Giri Validi ({{ activityStats.validPercentage }}%)</span>
            </div>
            <div class="activity-item">
              <span class="activity-value">{{ activityStats.timeOnTrack }}</span>
              <span class="activity-label">Tempo in Pista</span>
            </div>
            <div class="activity-item">
              <span class="activity-value">{{ activityStats.sessionsCount }}</span>
              <span class="activity-label">Sessioni</span>
            </div>
          </div>
        </div>
      </aside>
    </div>
    <!-- /page-layout -->
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

// === 2-COLUMN PAGE LAYOUT ===
.page-layout {
  display: flex;
  gap: 32px;
  align-items: flex-start;
}

.main-content {
  flex: 1;
  min-width: 0;
}

.sidebar {
  width: 340px;
  flex-shrink: 0;
  position: sticky;
  top: 24px;
}

.sidebar-section {
  margin-bottom: 24px;

  &:last-child {
    margin-bottom: 0;
  }
}

.skill-stack {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.activity-stack {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
}

.activity-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 16px 12px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  text-align: center;
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
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

.best-times-stack {
  display: flex;
  flex-direction: column;
  gap: 12px;
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

  &--avg {
    background: rgba($accent-info, 0.1);
    border: 1px solid rgba($accent-info, 0.3);
  }
}

.time-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 6px;
}

.time-value {
  font-family: 'JetBrains Mono', monospace;
  font-size: 24px;
  font-weight: 700;
  color: #fff;
}

.time-conditions {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: 12px;
  font-size: 13px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.6);
}

.condition-icon {
  font-size: 14px;
}

.condition-separator {
  opacity: 0.4;
}

// === CHART ===
.chart-container {
  padding: 24px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
}

.chart-wrapper {
  height: 280px;
  position: relative;
}

// === SKILL RATING ===
.skill-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 16px;
}

.skill-card {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 20px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
  transition: all 0.2s ease;

  &--pro {
    background: rgba(255, 215, 0, 0.08);
    border-color: rgba(255, 215, 0, 0.3);
  }

  &--amateur {
    background: rgba(192, 192, 192, 0.08);
    border-color: rgba(192, 192, 192, 0.3);
  }

  &--rookie {
    background: rgba(205, 127, 50, 0.08);
    border-color: rgba(205, 127, 50, 0.3);
  }
}

.skill-medal {
  font-size: 32px;
  line-height: 1;
}

.skill-info {
  display: flex;
  flex-direction: column;
  gap: 2px;
  flex: 1;
}

.skill-category {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: rgba(255, 255, 255, 0.5);
}

.skill-level {
  font-size: 14px;
  font-weight: 700;
  
  .skill-card--pro & { color: #ffd700; }
  .skill-card--amateur & { color: #c0c0c0; }
  .skill-card--rookie & { color: #cd7f32; }
}

.skill-time {
  font-family: 'JetBrains Mono', monospace;
  font-size: 16px;
  font-weight: 600;
  color: #fff;
}

.skill-target {
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
}

.target-label {
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.3px;
  color: rgba(255, 255, 255, 0.4);
}

.target-value {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
}

// === ACTIVITY STATS ===
.activity-grid {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}

.activity-card {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 20px 16px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
  text-align: center;
}

.activity-value {
  font-family: 'JetBrains Mono', monospace;
  font-size: 24px;
  font-weight: 700;
  color: #fff;
  margin-bottom: 4px;
}

.activity-label {
  font-size: 11px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.5);
  text-transform: uppercase;
  letter-spacing: 0.3px;
}

// === CHART ===
.chart-container {
  padding: 24px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 12px;
}

.times-chart {
  width: 100%;
  height: auto;
  max-height: 250px;
}

.chart-grid line {
  stroke: rgba(255, 255, 255, 0.08);
  stroke-width: 1;
}

.chart-y-labels text,
.chart-x-labels text {
  font-family: $font-primary;
  font-size: 10px;
  fill: rgba(255, 255, 255, 0.5);
}

.chart-line {
  fill: none;
  stroke-width: 2.5;
  stroke-linecap: round;
  stroke-linejoin: round;

  &--qualy {
    stroke: $accent-warning;
    filter: drop-shadow(0 0 4px rgba($accent-warning, 0.4));
  }

  &--race {
    stroke: rgb(255, 100, 100);
    filter: drop-shadow(0 0 4px rgba(255, 100, 100, 0.4));
  }
}

.chart-point {
  &--qualy {
    fill: $accent-warning;
    stroke: rgba($accent-warning, 0.5);
    stroke-width: 2;
  }

  &--race {
    fill: rgb(255, 100, 100);
    stroke: rgba(255, 100, 100, 0.5);
    stroke-width: 2;
  }
}

.chart-legend {
  display: flex;
  justify-content: center;
  gap: 24px;
  margin-top: 16px;
}

.legend-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.legend-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;

  .legend-item--qualy & {
    background: $accent-warning;
    box-shadow: 0 0 8px rgba($accent-warning, 0.5);
  }

  .legend-item--race & {
    background: rgb(255, 100, 100);
    box-shadow: 0 0 8px rgba(255, 100, 100, 0.5);
  }
}

.legend-label {
  font-family: $font-primary;
  font-size: 12px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.7);
}

// === SESSIONS LIST (same as SessioniPage) ===
.sessions-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  opacity: 1;
  transition: opacity 0.15s ease-out;

  // Fade out state during page change
  &--fading {
    opacity: 0;
  }
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
  transition: all 0.2s ease;

  &:hover {
    border-color: rgba(255, 255, 255, 0.25);
    transform: translateY(-2px);
    box-shadow: 
      0 6px 20px rgba(0, 0, 0, 0.3),
      0 0 20px rgba(255, 255, 255, 0.1),
      0 0 40px rgba(255, 255, 255, 0.05);

    .row-right {
      background: rgba(255, 255, 255, 0.02);
    }

    .session-cta {
      color: #fff;
      transform: translateX(3px);
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

.session-date {
  font-family: $font-primary;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
  min-width: 90px;
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

// Time badges
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

@media (max-width: 1024px) {
  .page-layout {
    flex-direction: column;
  }

  .sidebar {
    width: 100%;
    position: static;
  }

  .skill-stack {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
  }

  .activity-stack {
    grid-template-columns: repeat(4, 1fr);
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
  }
}

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

  .skill-grid {
    grid-template-columns: 1fr;
  }

  .activity-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
</style>

