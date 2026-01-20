<script setup lang="ts">
// ============================================
// ActivityCard - Weekly activity with stacked bars
// DYNAMIC SVG CHART - Not an image!
// ============================================

import { computed, onMounted, ref } from 'vue'

// Types
type DayData = {
  day: string
  practice: number
  qualify: number
  race: number
}

const props = defineProps<{
  data?: DayData[]
  practiceTotal?: { minutes: number; sessions: number }
  qualifyTotal?: { minutes: number; sessions: number }
  raceTotal?: { minutes: number; sessions: number }
}>()

// Animation state
const isAnimated = ref(false)

onMounted(() => {
  setTimeout(() => {
    isAnimated.value = true
  }, 100)
})

// Mock data - will be replaced with real API data
const chartData = computed(() => props.data || [
  { day: 'Lun', practice: 45, qualify: 0, race: 0 },
  { day: 'Mar', practice: 0, qualify: 0, race: 0 },
  { day: 'Mer', practice: 25, qualify: 15, race: 0 },
  { day: 'Gio', practice: 12, qualify: 0, race: 95 },
  { day: 'Ven', practice: 35, qualify: 8, race: 0 },
  { day: 'Sab', practice: 0, qualify: 0, race: 38 },
  { day: 'Dom', practice: 20, qualify: 0, race: 0 }
])

// Max value for Y axis
const maxValue = computed(() => {
  const totals = chartData.value.map(d => d.practice + d.qualify + d.race)
  return Math.max(...totals, 60)
})

// Y-axis labels
const yLabels = computed(() => {
  const max = maxValue.value
  return [0, Math.round(max / 2), max]
})

// Session totals
const practiceSummary = computed(() => props.practiceTotal || { minutes: 137, sessions: 5 })
const qualifySummary = computed(() => props.qualifyTotal || { minutes: 23, sessions: 3 })
const raceSummary = computed(() => props.raceTotal || { minutes: 133, sessions: 2 })

const formatSession = (count: number) => count === 1 ? 'sess.' : 'sess.'

// Format duration: if >= 60min, show as "Xh" or "XhYY", else show as minutes
const formatDuration = (minutes: number): { value: string; unit: string } => {
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    if (mins === 0) {
      return { value: `${hours}`, unit: 'h' }
    }
    return { value: `${hours}h ${mins.toString().padStart(2, '0')}`, unit: '' }
  }
  return { value: `${minutes}`, unit: 'min' }
}
</script>

<template>
  <div class="activity-card">
    <!-- Title -->
    <h2 class="card-title">Attività (ultimi 7 giorni)</h2>
    
    <!-- Main Content: Chart + Legend Side by Side -->
    <div class="card-content">
      <!-- Chart Area (takes most space) -->
      <div class="chart-area">
        <!-- Y-axis labels -->
        <div class="y-axis">
          <span v-for="label in yLabels.slice().reverse()" :key="label">{{ label }}</span>
        </div>
        
        <!-- Bars container -->
        <div class="bars-container">
          <div 
            v-for="(day, i) in chartData" 
            :key="day.day" 
            class="bar-column"
          >
            <!-- Stacked bar -->
            <div class="bar-stack">
              <!-- Race (Red) - Top -->
              <div 
                v-if="day.race > 0"
                class="bar bar--race"
                :style="{ 
                  height: isAnimated ? `${(day.race / maxValue) * 100}%` : '0%',
                  transitionDelay: `${i * 40 + 200}ms`
                }"
              ></div>
              <!-- Qualify (Yellow) - Middle -->
              <div 
                v-if="day.qualify > 0"
                class="bar bar--qualify"
                :style="{ 
                  height: isAnimated ? `${(day.qualify / maxValue) * 100}%` : '0%',
                  transitionDelay: `${i * 40 + 100}ms`
                }"
              ></div>
              <!-- Practice (Blue) - Bottom -->
              <div 
                v-if="day.practice > 0"
                class="bar bar--practice"
                :style="{ 
                  height: isAnimated ? `${(day.practice / maxValue) * 100}%` : '0%',
                  transitionDelay: `${i * 40}ms`
                }"
              ></div>
            </div>
            <!-- Day label -->
            <span class="day-label">{{ day.day }}</span>
          </div>
        </div>
      </div>
      
      <!-- Legend (compact, on the right) -->
      <div class="legend">
        <div class="legend-item legend-item--practice">
          <span class="legend-dot"></span>
          <div class="legend-text">
            <span class="legend-label">PRACTICE</span>
            <span class="legend-value">{{ formatDuration(practiceSummary.minutes).value }}<small>{{ formatDuration(practiceSummary.minutes).unit }}</small></span>
            <span class="legend-sessions">{{ practiceSummary.sessions }} {{ formatSession(practiceSummary.sessions) }}</span>
          </div>
        </div>
        
        <div class="legend-item legend-item--qualify">
          <span class="legend-dot"></span>
          <div class="legend-text">
            <span class="legend-label">QUALIFY</span>
            <span class="legend-value">{{ formatDuration(qualifySummary.minutes).value }}<small>{{ formatDuration(qualifySummary.minutes).unit }}</small></span>
            <span class="legend-sessions">{{ qualifySummary.sessions }} {{ formatSession(qualifySummary.sessions) }}</span>
          </div>
        </div>
        
        <div class="legend-item legend-item--race">
          <span class="legend-dot"></span>
          <div class="legend-text">
            <span class="legend-label">RACE</span>
            <span class="legend-value">{{ formatDuration(raceSummary.minutes).value }}<small>{{ formatDuration(raceSummary.minutes).unit }}</small></span>
            <span class="legend-sessions">{{ raceSummary.sessions }} {{ formatSession(raceSummary.sessions) }}</span>
          </div>
        </div>
      </div>
    </div>

    <!-- Accent glow -->
    <div class="accent-glow"></div>
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/scss/variables' as *;
@use 'sass:color';

// Session colors
$color-practice: $accent-info;    // Blue
$color-qualify: $accent-warning;  // Yellow
$color-race: $racing-red;         // Red

// === MAIN CARD ===
.activity-card {
  position: relative;
  background: linear-gradient(145deg, #1a1a24 0%, #12121a 100%);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 20px;
  overflow: hidden;
  min-height: 280px;
  padding: 24px;
  display: flex;
  flex-direction: column;

  &::before {
    content: '';
    position: absolute;
    inset: 0;
    border-radius: 20px;
    padding: 1px;
    background: linear-gradient(135deg, rgba($racing-red, 0.3) 0%, transparent 50%, rgba($racing-orange, 0.2) 100%);
    -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
    -webkit-mask-composite: xor;
    mask-composite: exclude;
    pointer-events: none;
    z-index: 5;
  }
}

.card-title {
  font-family: 'Outfit', $font-primary;
  font-size: 18px;
  font-weight: 700;
  color: #fff;
  margin: 0 0 20px 0;
}

// === MAIN CONTENT LAYOUT ===
.card-content {
  flex: 1;
  display: flex;
  gap: 20px;
  min-height: 0;
}

// === CHART AREA ===
.chart-area {
  flex: 1;
  display: flex;
  gap: 8px;
  min-height: 160px;
}

.y-axis {
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  align-items: flex-end;
  padding-bottom: 24px;
  min-width: 28px;

  span {
    font-size: 10px;
    color: rgba(255, 255, 255, 0.4);
    font-family: $font-primary;
  }
}

.bars-container {
  flex: 1;
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 6px;
  padding-bottom: 24px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  position: relative;
}

.bar-column {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  height: 100%;
  max-width: 36px;
}

.bar-stack {
  flex: 1;
  width: 100%;
  display: flex;
  flex-direction: column-reverse;
  justify-content: flex-start;
  align-items: stretch;
  gap: 2px;
}

.bar {
  width: 100%;
  min-height: 0;
  border-radius: 4px 4px 2px 2px;
  transition: height 0.5s cubic-bezier(0.16, 1, 0.3, 1);

  &--practice {
    background: linear-gradient(180deg, color.adjust($color-practice, $lightness: 8%) 0%, $color-practice 100%);
    box-shadow: 0 2px 8px rgba($color-practice, 0.4);
  }

  &--qualify {
    background: linear-gradient(180deg, color.adjust($color-qualify, $lightness: 8%) 0%, $color-qualify 100%);
    box-shadow: 0 2px 8px rgba($color-qualify, 0.4);
  }

  &--race {
    background: linear-gradient(180deg, color.adjust($color-race, $lightness: 8%) 0%, $color-race 100%);
    box-shadow: 0 2px 8px rgba($color-race, 0.4);
  }
}

.day-label {
  position: absolute;
  bottom: 4px;
  font-size: 10px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.5);
  font-family: $font-primary;
}

.bar-column {
  position: relative;
  
  .day-label {
    position: absolute;
    bottom: -20px;
  }
}

// === LEGEND (Right side, vertical) ===
.legend {
  display: flex;
  flex-direction: column;
  justify-content: space-around;
  gap: 0;
  min-width: 130px;
  padding-left: 24px;
  border-left: 1px solid rgba(255, 255, 255, 0.06);
}

.legend-item {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 8px 0;
}

.legend-dot {
  width: 12px;
  height: 12px;
  border-radius: 4px;
  margin-top: 4px;
  flex-shrink: 0;

  .legend-item--practice & { 
    background: $color-practice; 
    box-shadow: 0 0 8px rgba($color-practice, 0.5);
  }
  .legend-item--qualify & { 
    background: $color-qualify; 
    box-shadow: 0 0 8px rgba($color-qualify, 0.5);
  }
  .legend-item--race & { 
    background: $color-race; 
    box-shadow: 0 0 8px rgba($color-race, 0.5);
  }
}

.legend-text {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.legend-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.8px;
  color: rgba(255, 255, 255, 0.6);
}

.legend-value {
  font-size: 24px;
  font-weight: 700;
  color: #fff;
  line-height: 1;

  small {
    font-size: 12px;
    font-weight: 500;
    color: rgba(255, 255, 255, 0.5);
    margin-left: 3px;
  }
}

.legend-sessions {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.45);
}

// === ACCENT GLOW ===
.accent-glow {
  position: absolute;
  bottom: -50px;
  left: 50%;
  transform: translateX(-50%);
  width: 80%;
  height: 100px;
  background: radial-gradient(ellipse, rgba($racing-red, 0.15) 0%, transparent 70%);
  pointer-events: none;
  z-index: 1;
}

// === RESPONSIVE ===
@media (max-width: 768px) {
  .activity-card {
    padding: 20px;
  }

  .card-content {
    flex-direction: column;
  }

  .legend {
    flex-direction: row;
    flex-wrap: wrap;
    border-left: none;
    border-top: 1px solid rgba(255, 255, 255, 0.06);
    padding-left: 0;
    padding-top: 16px;
    min-width: unset;
  }

  .legend-item {
    flex: 1;
    min-width: 90px;
  }
}
</style>
