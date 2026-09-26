<script setup lang="ts">
// ============================================
// ActivityCard - Weekly activity with stacked bars
// DYNAMIC SVG CHART - Not an image!
// ============================================

import { computed, onMounted, onBeforeUnmount, ref } from 'vue'

// Types
type DayData = {
  date?: string
  dateLabel?: string
  day: string
  practice: number
  qualify: number
  race: number
}

const props = defineProps<{
  racing?: boolean
  data?: DayData[]
  practiceTotal?: { minutes: number; sessions: number }
  qualifyTotal?: { minutes: number; sessions: number }
  raceTotal?: { minutes: number; sessions: number }
}>()

// Animation state
const isAnimated = ref(false)
let animationTimer: ReturnType<typeof setTimeout> | undefined

onMounted(() => {
  animationTimer = setTimeout(() => {
    isAnimated.value = true
  }, 100)
})
onBeforeUnmount(() => clearTimeout(animationTimer))

// Day total
const dayTotal = (day: { practice: number; qualify: number; race: number }) => day.practice + day.qualify + day.race

// Mock data - will be replaced with real API data
const chartData = computed(() => props.data || [
  { day: 'Lun', dateLabel: '27/04', practice: 45, qualify: 0, race: 0 },
  { day: 'Mar', dateLabel: '28/04', practice: 0, qualify: 0, race: 0 },
  { day: 'Mer', dateLabel: '29/04', practice: 25, qualify: 15, race: 0 },
  { day: 'Gio', dateLabel: '30/04', practice: 12, qualify: 0, race: 95 },
  { day: 'Ven', dateLabel: '01/05', practice: 35, qualify: 8, race: 0 },
  { day: 'Sab', dateLabel: '02/05', practice: 0, qualify: 0, race: 38 },
  { day: 'Dom', dateLabel: '03/05', practice: 20, qualify: 0, race: 0 }
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

// Format Y-axis label: "0", "30", "1h", "1h30", "2h" etc.
const formatYLabel = (minutes: number): string => {
  if (minutes === 0) return '0'
  if (minutes >= 60) {
    const hours = Math.floor(minutes / 60)
    const mins = minutes % 60
    if (mins === 0) return `${hours}h`
    return `${hours}h${mins.toString().padStart(2, '0')}`
  }
  return `${minutes}min`
}
</script>

<template>
  <div class="activity-card" :class="{ 'activity-card--racing': racing }">
    <!-- Title -->
    <h2 class="card-title">{{ racing ? 'Attività · ultimi 7 giorni' : 'Attività (ultimi 7 giorni)' }}</h2>
    
    <!-- Main Content: Chart + Legend Side by Side -->
    <div class="card-content">
      <!-- Chart Area (takes most space) -->
      <div class="chart-area">
        <!-- Y-axis labels -->
        <div class="y-axis">
          <span v-for="label in yLabels.slice().reverse()" :key="label">{{ formatYLabel(label) }}</span>
        </div>
        
        <!-- Bars container -->
        <div class="bars-container">
          <div 
            v-for="(day, i) in chartData" 
            :key="day.day" 
            class="bar-column"
          >
            <!-- Total label above bar -->
            <span 
              class="bar-total"
            >{{ formatYLabel(dayTotal(day)) }}</span>
            <!-- Stacked bar (height = total percentage of max) -->
            <div 
              class="bar-stack"
              :style="{ height: `${(dayTotal(day) / maxValue) * 100}%` }"
            >
              <!-- Race (Red) - Top -->
              <div 
                v-if="day.race > 0"
                class="bar bar--race"
                :style="{ 
                  height: isAnimated ? `${(day.race / dayTotal(day)) * 100}%` : '0%',
                  transitionDelay: `${i * 40 + 200}ms`
                }"
              ></div>
              <!-- Qualify (Yellow) - Middle -->
              <div 
                v-if="day.qualify > 0"
                class="bar bar--qualify"
                :style="{ 
                  height: isAnimated ? `${(day.qualify / dayTotal(day)) * 100}%` : '0%',
                  transitionDelay: `${i * 40 + 100}ms`
                }"
              ></div>
              <!-- Practice (Blue) - Bottom -->
              <div 
                v-if="day.practice > 0"
                class="bar bar--practice"
                :style="{ 
                  height: isAnimated ? `${(day.practice / dayTotal(day)) * 100}%` : '0%',
                  transitionDelay: `${i * 40}ms`
                }"
              ></div>
            </div>
            <!-- Day label -->
            <span class="day-label">
              <span>{{ day.day }}</span>
              <small v-if="day.dateLabel">{{ day.dateLabel }}</small>
            </span>
          </div>
        </div>
      </div>
      
      <!-- Legend (compact, on the right) -->
      <div class="legend">
        <div class="legend-item legend-item--practice">
          <span class="legend-dot"></span>
          <div class="legend-text">
            <span class="legend-label">PROVE LIBERE</span>
            <span class="legend-value">{{ formatDuration(practiceSummary.minutes).value }}<small>{{ formatDuration(practiceSummary.minutes).unit }}</small></span>
            <span class="legend-sessions">{{ practiceSummary.sessions }} {{ formatSession(practiceSummary.sessions) }}</span>
          </div>
        </div>
        
        <div class="legend-item legend-item--qualify">
          <span class="legend-dot"></span>
          <div class="legend-text">
            <span class="legend-label">QUALIFICA</span>
            <span class="legend-value">{{ formatDuration(qualifySummary.minutes).value }}<small>{{ formatDuration(qualifySummary.minutes).unit }}</small></span>
            <span class="legend-sessions">{{ qualifySummary.sessions }} {{ formatSession(qualifySummary.sessions) }}</span>
          </div>
        </div>
        
        <div class="legend-item legend-item--race">
          <span class="legend-dot"></span>
          <div class="legend-text">
            <span class="legend-label">GARA</span>
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

// === BAR TOTAL LABELS ===
.bar-total {
  font-size: 12px;
  font-weight: 600;
  font-family: $font-primary;
  color: rgba(255, 255, 255, 0.6);
  text-align: center;
  margin-bottom: 2px;
  white-space: nowrap;
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
  padding-bottom: 34px;
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
  padding-bottom: 34px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  position: relative;
}

.bar-column {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-end;
  height: 100%;
  max-width: 36px;
}

.bar-stack {
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
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  line-height: 1;

  small {
    font-size: 9px;
    color: rgba(255, 255, 255, 0.35);
  }
}

.bar-column {
  position: relative;
  
  .day-label {
    position: absolute;
    bottom: -28px;
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

<style scoped lang="scss">
.activity-card--racing {
  padding: 18px; min-height: 320px; background: transparent; border: 1px solid rgba(255, 255, 255, 0.3960784314); border-radius: 0; overflow: visible;
  &::before, .accent-glow { display: none; }
  .card-title { font: italic 700 19px/1.3 'Racer Display', sans-serif; text-transform: uppercase; margin-bottom: var(--overview-chart-title-gap, 26px); }
  .card-content { flex-direction: column; gap: 18px; }
  .chart-area { min-height: var(--overview-chart-min-height, 165px); flex: 1; }
  .y-axis { padding-bottom: 32px; min-width: 30px; span { color: #ccc; font-size: 11px; } }
  .bars-container { padding-bottom: 32px; gap: 12px; border: 0; }
  .bar-column { max-width: none; flex: 1; border-bottom: 1px solid #ccc; background: repeating-linear-gradient(to top, #ffffff09 0 1px, transparent 1px 33.33%); }
  .bar-total { font-size: 11px; color: #ddd; }
  .bar-stack { width: 72%; gap: 0; clip-path: polygon(0 0,calc(100% - 7px) 0,100% 7px,100% 100%,0 100%); }
  .bar { border-radius: 0; box-shadow: none; }
  .bar--practice { background: var(--racing-practice); }
  .bar--qualify { background: var(--racing-qualify); }
  .bar--race { background: var(--racing-race); }
  .day-label { bottom: -31px; color: #ddd; font-size: 11px; small { color: #bbb; font-size: 10px; } }
  .legend { flex-direction: row; justify-content: space-between; min-width: 0; padding: 16px 0 0; border: 0; border-top: 1px solid #ffffff18; gap: 10px; }
  .legend-item { flex: 1; min-width: 0; padding: 0; gap: 10px; }
  .legend-item + .legend-item { border-left: 1px solid #ffffff60; padding-left: 18px; }
  .legend-dot { height: 62px; width: 8px; border-radius: 0; margin: 0; box-shadow: none; clip-path: polygon(0 0,40% 0,100% 6px,100% 100%,60% 100%,0 calc(100% - 6px)); }
  .legend-item--practice .legend-dot { background: var(--racing-practice); }
  .legend-item--qualify .legend-dot { background: var(--racing-qualify); }
  .legend-item--race .legend-dot { background: var(--racing-race); }
  .legend-text { gap: 3px; }
  .legend-label { font-size: 11px; color: #ddd; font-weight: 400; letter-spacing: 0; }
  .legend-item--practice .legend-label { color: var(--racing-practice); }
  .legend-item--qualify .legend-label { color: var(--racing-qualify); }
  .legend-item--race .legend-label { color: var(--racing-race); }
  .legend-value { font-size: 22px; font-weight: 600; font-variant-numeric: tabular-nums; small { color: #ddd; font-size: 15px; } }
  .legend-sessions { color: #ccc; font-size: 12px; }
}
@media (prefers-reduced-motion: reduce) { .bar { transition: none; } }
</style>
