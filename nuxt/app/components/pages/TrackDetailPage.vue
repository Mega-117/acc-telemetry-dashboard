<script setup lang="ts">
// ============================================
// TrackDetailPage - Track detail with projection-first data
// ============================================

import { ref, computed, onMounted, watch } from 'vue'
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
  CAR_CATEGORIES,
  type CarCategory
} from '~/composables/useTelemetryData'
import { usePilotContext } from '~/composables/usePilotContext'
import { usePublicPath } from '~/composables/usePublicPath'
import { useTelemetryGateway } from '~/composables/useTelemetryGateway'
import type { TrackDetailProjection } from '~/types/trackProjections'

const { getPublicPath } = usePublicPath()

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

const telemetryGateway = useTelemetryGateway()
const targetUserId = usePilotContext()

function formatShortDate(isoDate: string | null): string {
  if (!isoDate) return ''
  const dateStr = isoDate.split('T')[0] ?? isoDate
  const [year = '0', month = '0', day = '0'] = dateStr.split('-')
  const months = ['gen', 'feb', 'mar', 'apr', 'mag', 'giu', 'lug', 'ago', 'set', 'ott', 'nov', 'dic']
  return `${parseInt(day, 10)} ${months[parseInt(month, 10) - 1] ?? ''} ${year}`
}

const gripConditions = ['Optimum', 'Fast', 'Green', 'Greasy', 'Damp', 'Wet', 'Flood']
const selectedGrip = ref('Optimum')
const selectedCategory = ref<CarCategory>('GT3')
const trackProjection = ref<TrackDetailProjection | null>(null)
const isProjectionLoading = ref(false)

async function loadTrackProjection() {
  isProjectionLoading.value = true
  try {
    trackProjection.value = await telemetryGateway.getTrackDetailProjection(
      props.trackId,
      targetUserId.value || undefined,
      {
        category: selectedCategory.value,
        grip: selectedGrip.value
      }
    )
  } finally {
    isProjectionLoading.value = false
  }
}

onMounted(loadTrackProjection)

watch(
  () => [props.trackId, targetUserId.value, selectedCategory.value, selectedGrip.value],
  async () => {
    await loadTrackProjection()
  }
)

const emptyTrack = {
  id: props.trackId,
  name: props.trackId.toUpperCase(),
  fullName: props.trackId,
  country: '-',
  countryCode: '??',
  length: '-',
  turns: 0,
  image: '/tracks/track_default.png',
  sessions: 0,
  lastSession: '-',
  bestQualy: null,
  bestRace: null,
  bestAvgRace: null,
  bestQualyConditions: null,
  bestRaceConditions: null,
  bestAvgRaceConditions: null,
  bestQualySessionId: null,
  bestRaceSessionId: null,
  bestAvgRaceSessionId: null,
  bestQualyDate: null,
  bestRaceDate: null,
  bestAvgRaceDate: null,
  bestQualyFuel: null,
  bestRaceFuel: null,
  hasGripData: false
}

const track = computed(() => trackProjection.value?.track || emptyTrack)
const recentSessions = computed(() => trackProjection.value?.recentSessions || [])
const activityStats = computed(() => trackProjection.value?.activity || {
  totalLaps: 0,
  validLaps: 0,
  validPercent: 0,
  totalTimeMs: 0,
  totalTimeFormatted: '0m',
  sessionCount: 0
})
const historicalTimes = computed(() => trackProjection.value?.historicalTimes || [])

const currentPage = ref(1)
const itemsPerPage = 20
const totalPages = computed(() => Math.max(1, Math.ceil(recentSessions.value.length / itemsPerPage)))
const paginatedSessions = computed(() => {
  const start = (currentPage.value - 1) * itemsPerPage
  return recentSessions.value.slice(start, start + itemsPerPage)
})

watch(totalPages, (pages) => {
  if (currentPage.value > pages) {
    currentPage.value = 1
  }
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

const sessionsRef = ref<HTMLElement | null>(null)
const isChangingPage = ref(false)
function onPageChange(page?: number) {
  isChangingPage.value = true
  if (typeof page === 'number') {
    goToPage(page)
  }
}

function timeToSeconds(time: string): number {
  if (!time || !time.includes(':')) return 0
  const parts = time.split(':')
  const mins = parseInt(parts[0] || '0', 10)
  const rest = parts[1] || '0.000'
  const secParts = rest.split('.')
  const secs = parseInt(secParts[0] || '0', 10)
  const ms = parseInt(secParts[1] || '0', 10)
  return mins * 60 + secs + ms / 1000
}

function secondsToTimeString(seconds: number): string {
  const mins = Math.floor(seconds / 60)
  const secs = (seconds % 60).toFixed(3)
  return `${mins}:${secs.padStart(6, '0')}`
}

const chartJsData = computed(() => {
  const times = historicalTimes.value
  const qualyPoints: { x: number; y: number; label: string }[] = []
  const racePoints: { x: number; y: number; label: string }[] = []

  times.forEach((point, index) => {
    if (point.bestQualy) {
      qualyPoints.push({ x: index, y: timeToSeconds(point.bestQualy), label: point.date })
    }
    if (point.bestRace) {
      racePoints.push({ x: index, y: timeToSeconds(point.bestRace), label: point.date })
    }
  })

  return {
    labels: times.map((point) => point.date),
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

const chartOptions = computed(() => {
  const times = historicalTimes.value
  const qualyTimes = times.filter((t) => t.bestQualy).map((t) => timeToSeconds(t.bestQualy!))
  const raceTimes = times.filter((t) => t.bestRace).map((t) => timeToSeconds(t.bestRace!))
  const allTimes = [...qualyTimes, ...raceTimes]
  const minTime = allTimes.length > 0 ? Math.min(...allTimes) - 0.5 : 0
  const maxTime = allTimes.length > 0 ? Math.max(...allTimes) + 0.5 : 120
  const labels = times.map((t) => t.date)

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
          callback: function(value: string | number) {
            return labels[Math.round(Number(value))] || ''
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

type SessionType = 'practice' | 'qualify' | 'race'
function getTypeLabel(type: SessionType): string {
  const labels = { practice: 'PRACTICE', qualify: 'QUALIFY', race: 'RACE' }
  return labels[type]
}

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
        <div class="track-title-row">
          <h1 class="track-title">{{ track.name }}</h1>
          <span class="track-country-badge" :title="track.country">{{ track.countryCode }}</span>
        </div>
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
            {{ track.sessions }} sessioni {{ selectedCategory }}
          </span>
        </div>
      </div>
      <div class="track-header-activity" aria-label="Attivita pista">
        <div class="activity-summary-item">
          <span class="activity-summary-label">Sessioni</span>
          <span class="activity-summary-value">{{ activityStats.sessionCount }}</span>
        </div>
        <div class="activity-summary-item">
          <span class="activity-summary-label">Giri</span>
          <span class="activity-summary-value">{{ activityStats.totalLaps }}</span>
        </div>
        <div class="activity-summary-item">
          <span class="activity-summary-label">Validi {{ activityStats.validPercent }}%</span>
          <span class="activity-summary-value">{{ activityStats.validLaps }}</span>
        </div>
        <div class="activity-summary-item">
          <span class="activity-summary-label">Tempo in pista</span>
          <span class="activity-summary-value">{{ activityStats.totalTimeFormatted }}</span>
        </div>
      </div>
    </div>

    <!-- Control Bar: data filters -->
    <div class="control-bar">
      <div class="control-bar__content">
        <div class="control-bar__heading">
          <span class="control-bar__eyebrow">Filtri dati pista</span>
          <p class="control-bar__hint">La categoria filtra la pagina. Il grip filtra i migliori tempi.</p>
        </div>
        <div class="control-bar__controls">
          <div class="control-bar__group">
            <label class="control-bar__label">Categoria</label>
            <select v-model="selectedCategory" class="control-bar__select">
              <option v-for="cat in CAR_CATEGORIES" :key="cat" :value="cat">
                {{ cat }}
              </option>
            </select>
          </div>
          <div class="control-bar__group">
            <label class="control-bar__label">Grip migliori tempi</label>
            <select v-model="selectedGrip" class="control-bar__select control-bar__select--grip">
              <option v-for="grip in gripConditions" :key="grip" :value="grip">
                {{ grip }}
              </option>
            </select>
          </div>
        </div>
      </div>
    </div>

    <!-- 2-Column Layout -->
    <div class="page-layout">
      <div class="main-content">
        <!-- Historical Times Chart -->
        <div class="section">
          <div class="section-heading">
            <div>
              <h2 class="section-title">Andamento tempi</h2>
            </div>
          </div>
          <div class="chart-container">
            <div class="chart-wrapper">
              <Line :data="chartJsData" :options="chartOptions" />
            </div>
          </div>
        </div>
        <!-- /Chart -->

        <!-- Recent Sessions (same layout as SessioniPage) -->
        <div ref="sessionsRef" class="section">
          <div class="section-heading">
            <div>
              <h2 class="section-title">Sessioni recenti su {{ track.name }}</h2>
              <p class="section-subtitle">Tutte le sessioni recenti.</p>
            </div>
          </div>
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
            <h2 class="section-title">Migliori tempi</h2>
            <span class="grip-context">{{ selectedGrip }}</span>
          </div>
          <div class="best-times-stack">
            <div class="best-time-card best-time-card--qualy">
              <span class="time-label">Best qualifica</span>
              <span class="time-value">{{ track.bestQualy || '--:--.---' }}</span>
              <span v-if="track.bestQualyConditions" class="time-conditions">
                <span>{{ formatShortDate(track.bestQualyDate) }}</span>
                <span class="condition-sep">•</span>
                <span>{{ track.bestQualyConditions.airTemp }}°C</span>
                <template v-if="track.bestQualyFuel != null">
                  <span class="condition-sep">•</span>
                  <span>{{ Math.round(track.bestQualyFuel) }}L</span>
                </template>
              </span>
              <span v-else-if="!track.bestQualy" class="no-data-hint">Nessun dato {{ selectedCategory }} / {{ selectedGrip }}</span>
              <button 
                v-if="track.bestQualySessionId" 
                class="session-link-btn"
                title="Vai alla sessione"
                @click.stop="emit('go-to-session', track.bestQualySessionId!)"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                  <polyline points="15 3 21 3 21 9"></polyline>
                  <line x1="10" y1="14" x2="21" y2="3"></line>
                </svg>
              </button>
            </div>
            <div class="best-time-card best-time-card--race">
              <span class="time-label">Best gara</span>
              <span class="time-value">{{ track.bestRace || '--:--.---' }}</span>
              <span v-if="track.bestRaceConditions" class="time-conditions">
                <span>{{ formatShortDate(track.bestRaceDate) }}</span>
                <span class="condition-sep">•</span>
                <span>{{ track.bestRaceConditions.airTemp }}°C</span>
                <template v-if="track.bestRaceFuel != null">
                  <span class="condition-sep">•</span>
                  <span>{{ Math.round(track.bestRaceFuel) }}L</span>
                </template>
              </span>
              <span v-else-if="!track.bestRace" class="no-data-hint">Nessun dato {{ selectedCategory }} / {{ selectedGrip }}</span>
              <button 
                v-if="track.bestRaceSessionId" 
                class="session-link-btn"
                title="Vai alla sessione"
                @click.stop="emit('go-to-session', track.bestRaceSessionId!)"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                  <polyline points="15 3 21 3 21 9"></polyline>
                  <line x1="10" y1="14" x2="21" y2="3"></line>
                </svg>
              </button>
            </div>
            <div class="best-time-card best-time-card--avg">
              <span class="time-label">Best media gara</span>
              <span class="time-value">{{ track.bestAvgRace || '--:--.---' }}</span>
              <span v-if="track.bestAvgRaceConditions" class="time-conditions">
                <span>{{ formatShortDate(track.bestAvgRaceDate) }}</span>
                <span class="condition-sep">•</span>
                <span>{{ track.bestAvgRaceConditions.airTemp }}°C</span>

              </span>
              <span v-else-if="!track.bestAvgRace" class="no-data-hint">Nessun dato {{ selectedCategory }} / {{ selectedGrip }}</span>
              <button 
                v-if="track.bestAvgRaceSessionId" 
                class="session-link-btn"
                title="Vai alla sessione"
                @click.stop="emit('go-to-session', track.bestAvgRaceSessionId!)"
              >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path>
                  <polyline points="15 3 21 3 21 9"></polyline>
                  <line x1="10" y1="14" x2="21" y2="3"></line>
                </svg>
              </button>
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
              <span class="activity-label">Giri Validi ({{ activityStats.validPercent }}%)</span>
            </div>
            <div class="activity-item">
              <span class="activity-value">{{ activityStats.totalTimeFormatted }}</span>
              <span class="activity-label">Tempo in Pista</span>
            </div>
            <div class="activity-item">
              <span class="activity-value">{{ activityStats.sessionCount }}</span>
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

// === CONTROL BAR (Data Filters) ===
.control-bar {
  display: flex;
  align-items: stretch;
  padding: 18px 20px;
  margin-bottom: 24px;
  background:
    linear-gradient(135deg, rgba($accent-info, 0.08), rgba($racing-orange, 0.035)),
    rgba(255, 255, 255, 0.025);
  border: 1px solid rgba(255, 255, 255, 0.09);
  border-radius: 14px;

  &__content {
    width: 100%;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 24px;
  }

  &__heading {
    min-width: 0;
  }

  &__eyebrow {
    display: block;
    margin-bottom: 4px;
    font-family: $font-primary;
    font-size: 12px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 0.1em;
    color: rgba(255, 255, 255, 0.8);
  }

  &__hint {
    margin: 0;
    font-size: 13px;
    color: rgba(255, 255, 255, 0.52);
  }

  &__controls {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: 14px;
    flex-wrap: wrap;
  }

  &__group {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: 7px;
  }

  &__label {
    font-family: $font-primary;
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.08em;
    color: rgba(255, 255, 255, 0.48);
  }

  &__select {
    min-width: 120px;
    padding: 8px 34px 8px 12px;
    background-color: #1a1d2e;
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 8px;
    color: #fff;
    font-family: $font-primary;
    font-size: 13px;
    font-weight: 500;
    cursor: pointer;
    appearance: none;
    background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' viewBox='0 0 10 6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='rgba(255,255,255,0.5)' stroke-width='1.5' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
    background-repeat: no-repeat;
    background-position: right 10px center;
    transition: all 0.15s ease;

    &:hover {
      background-color: #222540;
      border-color: rgba(255, 255, 255, 0.2);
    }

    &:focus {
      outline: none;
      border-color: rgba(255, 255, 255, 0.3);
    }

    option {
      background-color: #1a1d2e;
      color: #fff;
    }

    &--grip {
      min-width: 150px;
      border-color: rgba($racing-orange, 0.34);
    }
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
  top: 138px;
}

.sidebar-section {
  margin-bottom: 24px;

  &:last-child {
    margin-bottom: 0;
  }
}

.sidebar .sidebar-section:nth-of-type(2) {
  display: none;
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
  background:
    radial-gradient(circle at 10% 0%, rgba($accent-info, 0.18), transparent 32%),
    linear-gradient(145deg, #1a2035, #151828);
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
  min-width: 0;
}

.track-header-activity {
  width: 340px;
  flex-shrink: 0;
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px;
  align-self: stretch;
}

.activity-summary-item {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 6px;
  min-height: 82px;
  padding: 14px;
  background: rgba(255, 255, 255, 0.045);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
}

.activity-summary-value {
  font-family: 'JetBrains Mono', monospace;
  font-size: 24px;
  font-weight: 800;
  color: #fff;
  line-height: 1.1;
}

.activity-summary-label {
  font-size: 10px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.48);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.track-title-row {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 4px;
}

.track-country-badge {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 34px;
  height: 24px;
  padding: 0 9px;
  background: rgba($racing-red, 0.13);
  border: 1px solid rgba($racing-red, 0.28);
  border-radius: 999px;
  color: rgba(255, 255, 255, 0.82);
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
}

.track-title {
  font-family: 'Outfit', $font-primary;
  font-size: 36px;
  font-weight: 700;
  color: #fff;
  margin: 0;
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

.section-heading {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 16px;

  .section-title {
    margin: 0;
  }
}

.section-subtitle {
  margin: 5px 0 0;
  font-size: 13px;
  line-height: 1.45;
  color: rgba(255, 255, 255, 0.5);
}

.section-pill,
.grip-context {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  font-size: 11px;
  font-weight: 800;
  color: rgba(255, 255, 255, 0.72);
  text-transform: uppercase;
  letter-spacing: 0.05em;
}

.grip-context {
  color: rgba($racing-orange, 0.95);
  border-color: rgba($racing-orange, 0.28);
  background: rgba($racing-orange, 0.08);
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

.filters-row {
  display: flex;
  gap: 8px;
}

.category-selector,
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

.category-selector {
  border-color: rgba($racing-orange, 0.4);
  
  &:hover {
    border-color: rgba($racing-orange, 0.6);
  }
  
  &:focus {
    border-color: $racing-orange;
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
  position: relative;

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

.session-link-btn {
  position: absolute;
  bottom: 8px;
  right: 8px;
  background: rgba(255, 255, 255, 0.1);
  border: none;
  border-radius: 6px;
  padding: 6px;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.5);
  transition: all 0.2s ease;
  display: flex;
  align-items: center;
  justify-content: center;

  &:hover {
    background: rgba(255, 255, 255, 0.2);
    color: #fff;
    transform: scale(1.1);
  }

  svg {
    width: 16px;
    height: 16px;
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

.condition-sep {
  opacity: 0.4;
  font-size: 10px;
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

  .track-header {
    flex-wrap: wrap;
  }

  .track-header-activity {
    width: 100%;
    grid-template-columns: repeat(4, 1fr);
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

  .track-header-activity,
  .activity-stack {
    grid-template-columns: repeat(2, 1fr);
  }

  .control-bar__content {
    align-items: stretch;
    flex-direction: column;
  }

  .control-bar__controls {
    justify-content: flex-start;
  }

  .section-heading {
    align-items: flex-start;
    flex-direction: column;
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

