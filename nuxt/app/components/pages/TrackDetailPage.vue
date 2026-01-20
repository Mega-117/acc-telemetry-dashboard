<script setup lang="ts">
// ============================================
// TrackDetailPage - Track detail with Firebase data
// ============================================

import { ref, computed, onMounted, watch } from 'vue'

// Composable for public path (GitHub Pages compatibility)
const { getPublicPath } = usePublicPath()
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
import { 
  useTelemetryData, 
  formatLapTime,
  formatCarName,
  formatTrackName,
  formatDate,
  getSessionTypeLabel
} from '~/composables/useTelemetryData'

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
  fromSession?: string
}>()

const emit = defineEmits<{
  back: []
  'go-to-session': [sessionId: string]
}>()

// Get pilot context (will be set when coach views a pilot)
const targetUserId = usePilotContext()

// ========================================
// FIREBASE DATA LOADING
// ========================================
const { sessions, trackStats, isLoading, loadSessions, calculateBestAvgRaceForTrack } = useTelemetryData()

onMounted(async () => {
  await loadSessions(targetUserId.value || undefined)
})

// Filter sessions for this track
const trackSessions = computed(() => {
  const trackIdNorm = props.trackId.toLowerCase().replace(/[^a-z0-9]/g, '_')
  return sessions.value.filter(s => {
    const sessionTrackId = s.meta.track.toLowerCase().replace(/[^a-z0-9]/g, '_')
    return sessionTrackId.includes(trackIdNorm) || trackIdNorm.includes(sessionTrackId)
  }).sort((a, b) => b.meta.date_start.localeCompare(a.meta.date_start))
})

// Get stats for this track from trackStats
const currentTrackStats = computed(() => {
  const trackIdNorm = props.trackId.toLowerCase().replace(/[^a-z0-9]/g, '_')
  return trackStats.value.find(t => {
    const statTrackId = t.track.toLowerCase().replace(/[^a-z0-9]/g, '_')
    return statTrackId.includes(trackIdNorm) || trackIdNorm.includes(statTrackId)
  })
})

// Track metadata (static for display)
const trackMetadata: Record<string, { name: string, fullName: string, country: string, countryCode: string, length: string, turns: number, image: string }> = {
  'monza': { name: 'Monza', fullName: 'Autodromo Nazionale Monza', country: 'Italia', countryCode: 'IT', length: '5.793 km', turns: 11, image: '/tracks/track_monza.png' },
  'spa': { name: 'Spa-Francorchamps', fullName: 'Circuit de Spa-Francorchamps', country: 'Belgio', countryCode: 'BE', length: '7.004 km', turns: 19, image: '/tracks/track_spa.png' },
  'spa_francorchamps': { name: 'Spa-Francorchamps', fullName: 'Circuit de Spa-Francorchamps', country: 'Belgio', countryCode: 'BE', length: '7.004 km', turns: 19, image: '/tracks/track_spa.png' },
  'suzuka': { name: 'Suzuka', fullName: 'Suzuka International Racing Course', country: 'Giappone', countryCode: 'JP', length: '5.807 km', turns: 18, image: '/tracks/track_suzuka.png' },
  'donington': { name: 'Donington Park', fullName: 'Donington Park Racing Circuit', country: 'Regno Unito', countryCode: 'GB', length: '4.020 km', turns: 12, image: '/tracks/track_donington.png' },
  'donington_park': { name: 'Donington Park', fullName: 'Donington Park Racing Circuit', country: 'Regno Unito', countryCode: 'GB', length: '4.020 km', turns: 12, image: '/tracks/track_donington.png' },
  'valencia': { name: 'Valencia', fullName: 'Circuit Ricardo Tormo', country: 'Spagna', countryCode: 'ES', length: '4.005 km', turns: 14, image: '/tracks/track_valencia.png' },
  'nurburgring': { name: 'Nürburgring', fullName: 'Nürburgring Grand Prix Strecke', country: 'Germania', countryCode: 'DE', length: '5.148 km', turns: 16, image: '/tracks/track_nurburgring.png' },
  'silverstone': { name: 'Silverstone', fullName: 'Silverstone Circuit', country: 'Regno Unito', countryCode: 'GB', length: '5.891 km', turns: 18, image: '/tracks/track_silverstone.png' },
  'imola': { name: 'Imola', fullName: 'Autodromo Enzo e Dino Ferrari', country: 'Italia', countryCode: 'IT', length: '4.909 km', turns: 19, image: '/tracks/track_imola.png' },
  'barcelona': { name: 'Barcelona', fullName: 'Circuit de Barcelona-Catalunya', country: 'Spagna', countryCode: 'ES', length: '4.655 km', turns: 16, image: '/tracks/track_barcelona.png' },
}

// Grip conditions for dropdown
const gripConditions = ['Optimum', 'Fast', 'Green', 'Greasy', 'Damp', 'Wet', 'Flood']
const selectedGrip = ref('Optimum')

// Recalculated best avg race from full session data (using centralized function)
const recalculatedBestByGrip = ref<Record<string, { bestAvgRace: number | null, bestAvgRaceTemp: number | null }>>({})
const isRecalculating = ref(false)

// Trigger recalculation when track sessions change
watch(trackSessions, async () => {
  if (trackSessions.value.length > 0) {
    isRecalculating.value = true
    recalculatedBestByGrip.value = await calculateBestAvgRaceForTrack(
      props.trackId,
      targetUserId.value || undefined
    )
    isRecalculating.value = false
  }
}, { immediate: true })

// Track computed data
const track = computed(() => {
  const trackIdNorm = props.trackId.toLowerCase().replace(/[^a-z0-9]/g, '_')
  const meta = trackMetadata[trackIdNorm] || trackMetadata[props.trackId] || {
    name: formatTrackName(props.trackId),
    fullName: formatTrackName(props.trackId),
    country: '-',
    countryCode: '??',
    length: '-',
    turns: 0,
    image: '/tracks/track_default.png'
  }
  
  const stats = currentTrackStats.value
  const grip = selectedGrip.value
  const gripBests = stats?.bestByGrip?.[grip]
  
  // Use ONLY grip-specific bests (no fallback to overall)
  const bestQualy = gripBests?.bestQualy || null
  const bestRace = gripBests?.bestRace || null
  
  // IMPORTANT: Use recalculated bestAvgRace (from full session data with 5+ valid lap filter)
  // This bypasses Firebase summary caching which may have incorrect values
  const recalcGrip = recalculatedBestByGrip.value[grip]
  const bestAvgRace = recalcGrip?.bestAvgRace || null
  const bestAvgRaceTemp = recalcGrip?.bestAvgRaceTemp || null
  
  // Build conditions for grip-specific bests
  const bestQualyConditions = bestQualy ? {
    airTemp: gripBests?.bestQualyTemp || 0,
    roadTemp: 0,
    grip
  } : null
  
  const bestRaceConditions = bestRace ? {
    airTemp: gripBests?.bestRaceTemp || 0,
    roadTemp: 0,
    grip
  } : null
  
  const bestAvgRaceConditions = bestAvgRace ? {
    airTemp: bestAvgRaceTemp || 0,
    roadTemp: 0,
    grip
  } : null
  
  return {
    id: props.trackId,
    ...meta,
    sessions: trackSessions.value.length,
    lastSession: stats?.lastSession || '-',
    bestQualy: bestQualy ? formatLapTime(bestQualy) : null,
    bestRace: bestRace ? formatLapTime(bestRace) : null,
    bestAvgRace: bestAvgRace ? formatLapTime(bestAvgRace) : null,
    bestQualyConditions,
    bestRaceConditions,
    bestAvgRaceConditions,
    hasGripData: !!bestQualy || !!bestRace || !!bestAvgRace
  }
})

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

// Transform Firebase sessions to display format
const recentSessions = computed<Session[]>(() => {
  return trackSessions.value.map(s => {
    const sessionType = getSessionTypeLabel(s.meta.session_type) as SessionType
    const dateObj = new Date(s.meta.date_start)
    const summary = s.summary || {}
    
    // Determine Q/R times: use specific fields if available, otherwise use bestLap based on session_type
    // session_type: 0=Race, 1=Qualify, 2=Practice (has both Q and R stints)
    let bestQualy: string | undefined
    let bestRace: string | undefined
    
    if (summary.best_qualy_ms) {
      bestQualy = formatLapTime(summary.best_qualy_ms)
    }
    if (summary.best_race_ms) {
      bestRace = formatLapTime(summary.best_race_ms)
    }
    
    // Fallback: use bestLap based on session type
    if (!bestQualy && !bestRace && summary.bestLap) {
      const lapTime = formatLapTime(summary.bestLap)
      if (s.meta.session_type === 1) {
        // Qualify session - assign to Q
        bestQualy = lapTime
      } else if (s.meta.session_type === 0) {
        // Race session - assign to R
        bestRace = lapTime
      } else {
        // Practice (2) - could have both, default to R for best lap
        bestRace = lapTime
      }
    }
    
    return {
      id: s.sessionId,
      date: s.meta.date_start?.split('T')[0] || '',
      time: dateObj.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
      type: sessionType,
      car: formatCarName(s.meta.car),
      laps: summary.laps || 0,
      stints: summary.stintCount || 0,
      bestQualy,
      bestRace
    }
  })
})

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

// Activity stats computed from real data
const activityStats = computed(() => {
  const totalLaps = trackSessions.value.reduce((sum, s) => sum + ((s.summary as any)?.laps || 0), 0)
  const validLaps = trackSessions.value.reduce((sum, s) => sum + ((s.summary as any)?.lapsValid || 0), 0)
  const totalTimeMs = trackSessions.value.reduce((sum, s) => sum + ((s.summary as any)?.totalTime || 0), 0)
  const hours = Math.floor(totalTimeMs / 3600000)
  const minutes = Math.floor((totalTimeMs % 3600000) / 60000)
  
  return {
    totalLaps,
    validLaps,
    validPercentage: totalLaps > 0 ? Math.round((validLaps / totalLaps) * 100) : 0,
    timeOnTrack: `${hours}h ${minutes}m`,
    sessionsCount: trackSessions.value.length,
    lastActivity: currentTrackStats.value?.lastSession || '-'
  }
})

// Historical best times data from real sessions (one point per session, chronological)
interface HistoricalTime {
  date: string
  sessionId: string
  bestQualy?: string
  bestRace?: string
}

const historicalTimes = computed<HistoricalTime[]>(() => {
  // Sort chronologically
  const sorted = [...trackSessions.value].sort((a, b) => a.meta.date_start.localeCompare(b.meta.date_start))
  
  return sorted.map(s => {
    const summary = s.summary as any
    // Format date manually to avoid Invalid Date issues
    const dateStr = s.meta.date_start?.split('T')[0] || ''
    const [year, month, day] = dateStr.split('-')
    const months = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']
    const dateLabel = day && month ? `${parseInt(day)} ${months[parseInt(month) - 1]}` : 'N/A'
    
    // Use same logic as recentSessions for consistency
    let qualyTime: number | null = summary?.best_qualy_ms || null
    let raceTime: number | null = summary?.best_race_ms || null
    
    // Fallback: use bestLap based on session type (same as recentSessions)
    if (!qualyTime && !raceTime && summary?.bestLap) {
      const sessionType = s.meta.session_type
      if (sessionType === 1) {
        // Qualify session - assign to Q
        qualyTime = summary.bestLap
      } else if (sessionType === 0) {
        // Race session - assign to R
        raceTime = summary.bestLap
      } else {
        // Practice (2) - default to R for best lap
        raceTime = summary.bestLap
      }
    }
    
    return {
      date: dateLabel,
      sessionId: s.sessionId,
      bestQualy: qualyTime ? formatLapTime(qualyTime) : undefined,
      bestRace: raceTime ? formatLapTime(raceTime) : undefined
    }
  })
})

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

// Chart.js data configuration - Using Scatter format for independent lines
const chartJsData = computed(() => {
  const times = historicalTimes.value
  
  // Create separate point arrays - each with {x: index, y: value}
  // Only include points where we have actual data
  const qualyPoints: {x: number, y: number, label: string}[] = []
  const racePoints: {x: number, y: number, label: string}[] = []
  
  times.forEach((t, index) => {
    if (t.bestQualy) {
      qualyPoints.push({ x: index, y: timeToSeconds(t.bestQualy), label: t.date })
    }
    if (t.bestRace) {
      racePoints.push({ x: index, y: timeToSeconds(t.bestRace), label: t.date })
    }
  })
  
  // Labels for X axis - all dates
  const labels = times.map(t => t.date)
  
  return {
    labels,
    datasets: [
      {
        label: 'Best Qualifying',
        data: qualyPoints,
        borderColor: '#f0b400',
        backgroundColor: 'rgba(240, 180, 0, 0.1)',
        borderWidth: 2.5,
        pointRadius: 5,
        pointHoverRadius: 7,
        pointBackgroundColor: '#f0b400',
        pointBorderColor: '#f0b400',
        tension: 0,
        fill: false,
        showLine: true
      },
      {
        label: 'Best Race',
        data: racePoints,
        borderColor: '#ff6464',
        backgroundColor: 'rgba(255, 100, 100, 0.1)',
        borderWidth: 2.5,
        pointRadius: 5,
        pointHoverRadius: 7,
        pointBackgroundColor: '#ff6464',
        pointBorderColor: '#ff6464',
        tension: 0,
        fill: false,
        showLine: true
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
  const minTime = allTimes.length > 0 ? Math.min(...allTimes) - 0.5 : 0
  const maxTime = allTimes.length > 0 ? Math.max(...allTimes) + 0.5 : 120
  
  // Labels for X axis tick display
  const labels = times.map(t => t.date)
  
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      intersect: false,
      mode: 'nearest' as const
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
          title: function(context: any) {
            // Get date label from the raw data point
            const point = context[0]?.raw
            return point?.label || labels[context[0]?.parsed?.x] || ''
          },
          label: function(context: any) {
            const value = context.parsed.y
            if (value === null || value === undefined) return ''
            return `${context.dataset.label}: ${secondsToTimeString(value)}`
          }
        }
      }
    },
    scales: {
      x: {
        type: 'linear' as const,
        min: -0.5,
        max: times.length - 0.5,
        grid: {
          color: 'rgba(255, 255, 255, 0.06)',
          drawBorder: false
        },
        ticks: {
          color: 'rgba(255, 255, 255, 0.5)',
          font: {
            family: "'Inter', sans-serif",
            size: 11
          },
          stepSize: 1,
          callback: function(value: number) {
            return labels[Math.round(value)] || ''
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

// Navigate to session detail via emit (for pilot context)
function goToSession(id: string) {
  emit('go-to-session', id)
}
</script>

<template>
  <LayoutPageContainer>
    <!-- Back button -->
    <button class="back-button" @click="emit('back')">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <path d="M19 12H5M12 19l-7-7 7-7"/>
      </svg>
      {{ props.fromSession ? 'Torna alla sessione' : 'Torna alle piste' }}
    </button>

    <!-- Track Header -->
    <div class="track-header">
      <div class="track-header-image">
        <img :src="getPublicPath(track.image)" :alt="track.name" />
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
          <div class="section-header-row">
            <h2 class="section-title">Migliori Tempi</h2>
            <select v-model="selectedGrip" class="grip-selector">
              <option v-for="grip in gripConditions" :key="grip" :value="grip">
                {{ grip }}
              </option>
            </select>
          </div>
          <div class="best-times-stack">
            <div class="best-time-card best-time-card--qualy">
              <span class="time-label">Best Stint Qualifying</span>
              <span class="time-value">{{ track.bestQualy || '—:—.---' }}</span>
              <span v-if="track.bestQualyConditions" class="time-conditions">
                <span>Aria {{ track.bestQualyConditions.airTemp }}°C</span>
              </span>
              <span v-else-if="!track.bestQualy" class="no-data-hint">Nessun dato per {{ selectedGrip }}</span>
            </div>
            <div class="best-time-card best-time-card--race">
              <span class="time-label">Best Stint Race</span>
              <span class="time-value">{{ track.bestRace || '—:—.---' }}</span>
              <span v-if="track.bestRaceConditions" class="time-conditions">
                <span>Aria {{ track.bestRaceConditions.airTemp }}°C</span>
              </span>
              <span v-else-if="!track.bestRace" class="no-data-hint">Nessun dato per {{ selectedGrip }}</span>
            </div>
            <div class="best-time-card best-time-card--avg">
              <span class="time-label">Best Stint Avg Race</span>
              <span class="time-value">{{ track.bestAvgRace || '—:—.---' }}</span>
              <span v-if="track.bestAvgRaceConditions" class="time-conditions">
                <span>Aria {{ track.bestAvgRaceConditions.airTemp }}°C</span>
              </span>
              <span v-else-if="!track.bestAvgRace" class="no-data-hint">Nessun dato per {{ selectedGrip }}</span>
            </div>
          </div>
        </div>

        <!-- Activity Stats Section -->
        <div class="sidebar-section">
          <h2 class="section-title">Attività Totale</h2>
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

.section-header-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
  
  .section-title {
    margin: 0;
  }
}

.grip-selector {
  padding: 6px 12px;
  border-radius: 8px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.15);
  color: #fff;
  font-size: 13px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &:hover {
    background: rgba(255, 255, 255, 0.12);
    border-color: rgba(255, 255, 255, 0.25);
  }
  
  &:focus {
    outline: none;
    border-color: $accent-info;
  }
  
  option {
    background: #1a1a2e;
    color: #fff;
  }
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

.no-data-hint {
  font-size: 11px;
  font-style: italic;
  color: rgba(255, 255, 255, 0.4);
  margin-top: 8px;
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

