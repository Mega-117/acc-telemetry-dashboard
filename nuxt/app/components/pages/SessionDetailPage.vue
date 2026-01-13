<script setup lang="ts">
// ============================================
// SessionDetailPage - Master / Detail Layout
// Master: Stint list (always visible, scrolls internally)
// Detail: Analysis panel (updates on stint selection)
// ============================================

import { computed, ref, onMounted } from 'vue'
import { Line } from 'vue-chartjs'
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend
} from 'chart.js'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend)

const props = defineProps<{ sessionId: string }>()
const emit = defineEmits<{ back: [], 'open-track': [trackId: string] }>()

const showDetailedLaps = ref(false)

// ========================================
// MOCK DATA
// ========================================
const session = computed(() => ({
  id: props.sessionId,
  track: 'Monza',
  trackId: 'monza',
  type: 'practice' as const,
  date: '6 Gennaio 2026',
  time: '19:12',
  car: 'Ford Mustang GT3',
  startConditions: { weather: 'Clear', airTemp: 12, trackTemp: 17 },
  bestQualy: '1:47.234',
  bestRace: '1:49.123',
  stints: [
    { number: 1, type: 'Q', intent: 'Qualy Push', fuelStart: 10, laps: 6, best: '1:47.234', avg: '1:48.890', theoretical: '1:46.900', deltaVsTheo: '+0.334', conditions: { weather: 'Dry', avgTrackTemp: 18 }, breakdown: { base: '1:46.500', deltaTemp: '+0.250', deltaGrip: '+0.150' } },
    { number: 2, type: 'R', intent: 'Race Pace', fuelStart: 55, laps: 12, best: '1:49.123', avg: '1:50.456', theoretical: '1:49.500', deltaVsTheo: '-0.377', conditions: { weather: 'Dry', avgTrackTemp: 22 }, breakdown: { base: '1:49.100', deltaTemp: '+0.300', deltaGrip: '+0.100' } },
    { number: 3, type: 'Q', intent: 'Qualy Push', fuelStart: 8, laps: 5, best: '1:47.890', avg: '1:49.012', theoretical: '1:46.900', deltaVsTheo: '+0.990', conditions: { weather: 'Dry', avgTrackTemp: 24 }, breakdown: { base: '1:46.500', deltaTemp: '+0.300', deltaGrip: '+0.100' } },
    { number: 4, type: 'R', intent: 'Race Pace', fuelStart: 60, laps: 15, best: '1:49.567', avg: '1:50.890', theoretical: '1:49.500', deltaVsTheo: '+0.067', conditions: { weather: 'Dry', avgTrackTemp: 25 }, breakdown: { base: '1:49.100', deltaTemp: '+0.300', deltaGrip: '+0.100' } },
    { number: 5, type: 'Q', intent: 'Qualy Push', fuelStart: 6, laps: 4, best: '1:47.012', avg: '1:47.890', theoretical: '1:46.900', deltaVsTheo: '+0.112', conditions: { weather: 'Dry', avgTrackTemp: 23 }, breakdown: { base: '1:46.500', deltaTemp: '+0.250', deltaGrip: '+0.150' } },
    { number: 6, type: 'R', intent: 'Long Run', fuelStart: 45, laps: 10, best: '1:49.234', avg: '1:50.123', theoretical: '1:49.500', deltaVsTheo: '-0.266', conditions: { weather: 'Dry', avgTrackTemp: 21 }, breakdown: { base: '1:49.100', deltaTemp: '+0.250', deltaGrip: '+0.150' } },
    { number: 7, type: 'Q', intent: 'Qualy Push', fuelStart: 5, laps: 1, best: '1:48.456', avg: '1:48.456', theoretical: '1:46.900', deltaVsTheo: '+1.556', conditions: { weather: 'Dry', avgTrackTemp: 19 }, breakdown: { base: '1:46.500', deltaTemp: '+0.250', deltaGrip: '+0.150' } },
    { number: 8, type: 'R', intent: 'Race Pace', fuelStart: 70, laps: 18, best: '1:50.012', avg: '1:51.234', theoretical: '1:49.500', deltaVsTheo: '+0.512', conditions: { weather: 'Dry', avgTrackTemp: 26 }, breakdown: { base: '1:49.100', deltaTemp: '+0.300', deltaGrip: '+0.100' } },
  ],
  lapsData: {
    1: [
      { lap: 1, time: '1:52.456', delta: '+5.556', valid: true, pit: false, sectors: ['32.1', '42.3', '38.0'], fuel: 12, trackTemp: 17, grip: 'Opt' },
      { lap: 2, time: '1:48.123', delta: '+1.223', valid: true, pit: false, sectors: ['31.2', '41.0', '35.9'], fuel: 11, trackTemp: 18, grip: 'Opt' },
      { lap: 3, time: '1:47.890', delta: '+0.990', valid: true, pit: false, sectors: ['31.0', '40.8', '36.1'], fuel: 10, trackTemp: 18, grip: 'Opt' },
      { lap: 4, time: '1:47.234', delta: '+0.334', valid: true, pit: false, sectors: ['30.8', '40.4', '36.0'], fuel: 9, trackTemp: 19, grip: 'Opt' },
      { lap: 5, time: '1:48.012', delta: '+1.112', valid: false, pit: false, sectors: ['30.9', '41.1', '36.0'], fuel: 8, trackTemp: 19, grip: 'Opt' },
      { lap: 6, time: '1:49.340', delta: '+2.440', valid: true, pit: true, sectors: ['31.2', '41.8', '36.3'], fuel: 8, trackTemp: 19, grip: 'Opt' }
    ],
    2: [
      { lap: 1, time: '1:51.234', delta: '+1.734', valid: true, pit: false, sectors: ['32.5', '42.0', '36.7'], fuel: 55, trackTemp: 21, grip: 'Opt' },
      { lap: 2, time: '1:50.012', delta: '+0.512', valid: true, pit: false, sectors: ['32.0', '41.5', '36.5'], fuel: 53, trackTemp: 22, grip: 'Opt' },
      { lap: 3, time: '1:49.567', delta: '+0.067', valid: true, pit: false, sectors: ['31.8', '41.2', '36.6'], fuel: 51, trackTemp: 22, grip: 'Opt' },
      { lap: 4, time: '1:49.123', delta: '-0.377', valid: true, pit: false, sectors: ['31.5', '41.0', '36.6'], fuel: 49, trackTemp: 22, grip: 'Opt' }
    ],
    7: [
      { lap: 1, time: '1:48.456', delta: '+1.556', valid: true, pit: false, sectors: ['31.5', '41.0', '36.0'], fuel: 5, trackTemp: 19, grip: 'Opt' }
    ]
  }
}))

// ========================================
// SMART PRESELECTION
// ========================================
const selectedStintNumber = ref(1)

onMounted(() => {
  // Find best valid stint (not 1 lap, valid delta)
  const validStints = session.value.stints.filter(s => s.laps >= 2)
  if (validStints.length > 0) {
    let best = validStints[0]
    let bestDelta = parseFloat(best.deltaVsTheo)
    validStints.forEach(s => {
      const d = parseFloat(s.deltaVsTheo)
      if (d < bestDelta) { best = s; bestDelta = d }
    })
    selectedStintNumber.value = best.number
  }
})

const selectedStint = computed(() => session.value.stints.find(s => s.number === selectedStintNumber.value))
const selectedStintLaps = computed(() => session.value.lapsData[selectedStintNumber.value as keyof typeof session.value.lapsData] || session.value.lapsData[1])
const isLimitedData = computed(() => selectedStintLaps.value.length <= 1)

// ========================================
// CHART
// ========================================
const chartData = computed(() => {
  const laps = selectedStintLaps.value
  const theoSec = timeToSeconds(selectedStint.value?.theoretical || '1:47.000')
  return {
    labels: laps.map(l => `G${l.lap}`),
    datasets: [
      {
        label: 'Tempo',
        data: laps.map(l => timeToSeconds(l.time)),
        borderColor: '#3b82f6',
        backgroundColor: 'rgba(59,130,246,0.1)',
        pointBackgroundColor: laps.map(l => l.pit ? '#6b7280' : !l.valid ? '#ef4444' : parseFloat(l.delta) <= 0.3 ? '#10b981' : '#3b82f6'),
        pointRadius: 5,
        tension: 0.2
      },
      {
        label: `Teorico ${selectedStint.value?.type}`,
        data: laps.map(() => theoSec),
        borderColor: '#f59e0b',
        borderDash: [5, 5],
        pointRadius: 0
      }
    ]
  }
})

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: { display: true, position: 'bottom' as const, labels: { color: 'rgba(255,255,255,0.6)', font: { size: 10 } } },
    tooltip: {
      backgroundColor: 'rgba(15,15,25,0.95)',
      callbacks: { label: (ctx: any) => `${ctx.dataset.label}: ${secondsToTime(ctx.raw)}` }
    }
  },
  scales: {
    x: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: 'rgba(255,255,255,0.5)', font: { size: 10 } } },
    y: { grid: { color: 'rgba(255,255,255,0.05)' }, ticks: { color: 'rgba(255,255,255,0.5)', callback: (v: number) => secondsToTime(v) } }
  }
}

// ========================================
// HELPERS
// ========================================
function timeToSeconds(t: string): number { const [m, s] = t.split(':').map(Number); return m * 60 + s }
function secondsToTime(s: number): string { const m = Math.floor(s / 60); return `${m}:${(s % 60).toFixed(3).padStart(6, '0')}` }
function getTypeLabel(t: string) { return { practice: 'PRACTICE', qualify: 'QUALIFY', race: 'RACE' }[t] || t.toUpperCase() }
function getDeltaClass(d: string) { const v = parseFloat(d); if (v <= 0) return 'fast'; if (v <= 0.3) return 'ok'; if (v <= 0.5) return 'margin'; return 'far' }
function getDeltaLabel(d: string) { const v = parseFloat(d); if (v <= 0) return 'FAST'; if (v <= 0.3) return 'OK'; if (v <= 0.5) return 'MARGIN'; return 'LONTANO' }
</script>

<template>
  <LayoutPageContainer class="session-detail-page">
    <!-- NAV -->
    <div class="nav-bar">
      <button class="nav-btn" @click="emit('back')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
        Torna alle sessioni
      </button>
      <button class="nav-btn nav-btn--accent" @click="emit('open-track', session.trackId)">
        Apri pista
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 18l6-6-6-6"/></svg>
      </button>
    </div>

    <!-- HEADER SESSIONE -->
    <header class="session-header">
      <div class="header-row">
        <h1 class="track-name">{{ session.track.toUpperCase() }}</h1>
        <span :class="['type-badge', `type-badge--${session.type}`]">{{ getTypeLabel(session.type) }}</span>
      </div>
      <div class="header-meta">
        <span>{{ session.date }}</span>
        <span class="sep">•</span>
        <span>{{ session.time }}</span>
        <span class="sep">•</span>
        <span class="car">{{ session.car }}</span>
      </div>
      <div class="start-cond">
        <span class="cond-label">CONDIZIONI DI PARTENZA</span>
        <span>☀️ {{ session.startConditions.weather }}</span>
        <span>Aria {{ session.startConditions.airTemp }}°</span>
        <span>Asfalto {{ session.startConditions.trackTemp }}°</span>
      </div>
    </header>

    <!-- RIEPILOGO SESSIONE -->
    <section class="summary">
      <div v-if="session.bestQualy" class="summary-box">
        <span class="label">Best Qualify</span>
        <span class="value">{{ session.bestQualy }}</span>
      </div>
      <div v-if="session.bestRace" class="summary-box">
        <span class="label">Best Race</span>
        <span class="value">{{ session.bestRace }}</span>
      </div>
    </section>

    <!-- ========================================== -->
    <!-- MASTER / DETAIL LAYOUT -->
    <!-- ========================================== -->
    <div class="master-detail">
      <!-- MASTER: Stint List -->
      <aside class="master">
        <h2 class="master-title">Stint ({{ session.stints.length }})</h2>
        <div class="stint-list">
          <button
            v-for="stint in session.stints"
            :key="stint.number"
            :class="['stint-item', { selected: selectedStintNumber === stint.number }]"
            @click="selectedStintNumber = stint.number"
          >
            <span :class="['stint-type', `stint-type--${stint.type.toLowerCase()}`]">{{ stint.type }}</span>
            <span class="stint-num">#{{ stint.number }}</span>
            <span class="stint-fuel">{{ stint.fuelStart }}L</span>
            <span class="stint-laps">{{ stint.laps }}g</span>
            <span class="stint-best">{{ stint.best }}</span>
            <span class="stint-avg">{{ stint.avg }}</span>
            <span :class="['stint-delta', `delta--${getDeltaClass(stint.deltaVsTheo)}`]">
              <span class="delta-val">{{ stint.deltaVsTheo }}</span>
              <span class="delta-lbl">{{ getDeltaLabel(stint.deltaVsTheo) }}</span>
            </span>
          </button>
        </div>
      </aside>

      <!-- DETAIL: Analysis Panel -->
      <section class="detail">
        <!-- Stint Header -->
        <div class="detail-header">
          <h3 class="detail-title">{{ selectedStint?.intent }}</h3>
          <span class="detail-badge">Stint {{ selectedStintNumber }} · {{ selectedStint?.type === 'Q' ? 'Qualy' : 'Race' }}</span>
          <span class="detail-cond">{{ selectedStint?.conditions.weather }} · Track {{ selectedStint?.conditions.avgTrackTemp }}°</span>
        </div>

        <!-- Theoretical Breakdown -->
        <div class="theo-box">
          <span class="theo-main">
            <span class="theo-lbl">Teorico {{ selectedStint?.type }}:</span>
            <span class="theo-val">{{ selectedStint?.theoretical }}</span>
          </span>
          <span class="theo-detail">Base: {{ selectedStint?.breakdown.base }}</span>
          <span class="theo-detail">ΔTemp: {{ selectedStint?.breakdown.deltaTemp }}</span>
          <span class="theo-detail">ΔGrip: {{ selectedStint?.breakdown.deltaGrip }}</span>
        </div>

        <!-- Limited Data Warning -->
        <div v-if="isLimitedData" class="limited-data">
          ⚠️ Dati limitati ({{ selectedStintLaps.length }} giro)
        </div>

        <!-- Chart -->
        <div class="chart-section">
          <h4 class="chart-title">Tempi Giro — Stint {{ selectedStintNumber }}</h4>
          <div class="chart-wrap">
            <Line :data="chartData" :options="chartOptions" />
          </div>
        </div>

        <!-- Laps Table -->
        <div class="laps-section">
          <div class="laps-header">
            <h4 class="laps-title">Tabella Giri — Stint {{ selectedStintNumber }}</h4>
            <button class="toggle-btn" @click="showDetailedLaps = !showDetailedLaps">
              {{ showDetailedLaps ? 'Vista semplice' : 'Dettagli' }}
            </button>
          </div>
          <div class="laps-table-wrap">
            <table class="laps-table">
              <thead>
                <tr>
                  <th>Giro</th>
                  <th>Tempo</th>
                  <th>Δ Teorico</th>
                  <th>Stato</th>
                  <template v-if="showDetailedLaps">
                    <th>S1</th><th>S2</th><th>S3</th><th>Fuel</th><th>Track°</th><th>Grip</th>
                  </template>
                </tr>
              </thead>
              <tbody>
                <tr v-for="lap in selectedStintLaps" :key="lap.lap" :class="{ invalid: !lap.valid, pit: lap.pit }">
                  <td>{{ lap.lap }}</td>
                  <td class="time">{{ lap.time }}</td>
                  <td :class="['delta', `delta--${getDeltaClass(lap.delta)}`]">{{ lap.delta }}</td>
                  <td class="status">{{ lap.pit ? 'PIT' : !lap.valid ? 'INV' : '✓' }}</td>
                  <template v-if="showDetailedLaps">
                    <td>{{ lap.sectors[0] }}</td>
                    <td>{{ lap.sectors[1] }}</td>
                    <td>{{ lap.sectors[2] }}</td>
                    <td>{{ lap.fuel }}L</td>
                    <td>{{ lap.trackTemp }}°</td>
                    <td>{{ lap.grip }}</td>
                  </template>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  </LayoutPageContainer>
</template>

<style lang="scss" scoped>
@use '@/assets/scss/variables' as *;

.session-detail-page { display: flex; flex-direction: column; height: 100%; }

// NAV
.nav-bar { display: flex; justify-content: space-between; margin-bottom: 20px; }
.nav-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 8px 14px; background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.1); border-radius: 6px;
  color: rgba(255,255,255,0.7); font-family: $font-primary; font-size: 12px;
  cursor: pointer; transition: all 0.15s;
  svg { width: 14px; height: 14px; }
  &:hover { background: rgba(255,255,255,0.08); color: #fff; }
  &--accent { border-color: rgba($racing-red,0.3); color: rgba($racing-red,0.8); &:hover { border-color: $racing-red; color: $racing-red; } }
}

// HEADER
.session-header { margin-bottom: 20px; }
.header-row { display: flex; align-items: center; gap: 12px; margin-bottom: 8px; }
.track-name { font-family: 'Outfit', $font-primary; font-size: 28px; font-weight: 800; color: #fff; letter-spacing: 2px; margin: 0; }
.type-badge {
  padding: 5px 12px; border-radius: 5px; font-size: 10px; font-weight: 700;
  &--practice { background: rgba($accent-info,0.15); border: 1px solid rgba($accent-info,0.4); color: $accent-info; }
  &--qualify { background: rgba($accent-warning,0.15); border: 1px solid rgba($accent-warning,0.4); color: $accent-warning; }
  &--race { background: rgba(255,100,100,0.15); border: 1px solid rgba(255,100,100,0.4); color: rgb(255,100,100); }
}
.header-meta { display: flex; gap: 8px; font-size: 13px; color: rgba(255,255,255,0.5); margin-bottom: 10px; .sep { color: rgba(255,255,255,0.2); } .car { color: rgba(255,255,255,0.4); } }
.start-cond { display: flex; gap: 14px; font-size: 12px; color: rgba(255,255,255,0.6); }
.cond-label { font-size: 9px; font-weight: 700; letter-spacing: 1px; color: rgba(255,255,255,0.4); padding: 3px 8px; background: rgba(255,255,255,0.05); border-radius: 4px; }

// SUMMARY
.summary { display: flex; gap: 12px; margin-bottom: 20px; }
.summary-box { padding: 14px 20px; background: linear-gradient(145deg,#1a1a24,#12121a); border: 1px solid rgba(255,255,255,0.08); border-radius: 10px; text-align: center; }
.summary-box .label { display: block; font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: rgba(255,255,255,0.4); margin-bottom: 4px; }
.summary-box .value { font-family: 'JetBrains Mono', monospace; font-size: 18px; font-weight: 700; color: #fff; }

// MASTER / DETAIL
.master-detail { display: grid; grid-template-columns: 340px 1fr; gap: 20px; flex: 1; min-height: 0; }

// MASTER
.master {
  display: flex; flex-direction: column;
  background: linear-gradient(145deg,#151520,#0d0d12);
  border: 1px solid rgba(255,255,255,0.06); border-radius: 12px;
  padding: 16px; overflow: hidden;
}
.master-title { font-size: 12px; font-weight: 700; color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 1px; margin: 0 0 12px 0; }
.stint-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; }
.stint-item {
  display: grid; grid-template-columns: 28px 32px 38px 32px 68px 68px 1fr;
  align-items: center; gap: 8px;
  padding: 10px 12px; background: rgba(255,255,255,0.02);
  border: 1px solid rgba(255,255,255,0.04); border-radius: 6px;
  cursor: pointer; transition: all 0.12s; text-align: left;
  &:hover { background: rgba(255,255,255,0.04); }
  &.selected { background: rgba($racing-red,0.1); border-color: rgba($racing-red,0.3); }
}
.stint-type { padding: 3px 6px; border-radius: 3px; font-size: 9px; font-weight: 700; text-align: center;
  &--q { background: rgba($accent-warning,0.15); color: $accent-warning; }
  &--r { background: rgba(255,100,100,0.15); color: rgb(255,100,100); }
  &--l { background: rgba($accent-info,0.15); color: $accent-info; }
}
.stint-num { font-size: 11px; font-weight: 600; color: #fff; }
.stint-fuel, .stint-laps { font-size: 10px; color: rgba(255,255,255,0.4); }
.stint-best, .stint-avg { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: rgba(255,255,255,0.7); }
.stint-delta { display: flex; align-items: center; gap: 6px; justify-self: end; padding: 4px 8px; border-radius: 4px; }
.delta-val { font-family: 'JetBrains Mono', monospace; font-size: 11px; font-weight: 700; }
.delta-lbl { font-size: 8px; font-weight: 700; opacity: 0.8; }
.delta--fast { background: rgba($accent-success,0.12); .delta-val, .delta-lbl { color: $accent-success; } }
.delta--ok { background: rgba(#22c55e,0.1); .delta-val, .delta-lbl { color: #22c55e; } }
.delta--margin { background: rgba($accent-warning,0.1); .delta-val, .delta-lbl { color: $accent-warning; } }
.delta--far { background: rgba(255,100,100,0.1); .delta-val, .delta-lbl { color: rgb(255,100,100); } }

// DETAIL
.detail {
  display: flex; flex-direction: column;
  background: linear-gradient(145deg,#151520,#0d0d12);
  border: 1px solid rgba(255,255,255,0.06); border-radius: 12px;
  padding: 20px; overflow-y: auto;
}
.detail-header { display: flex; align-items: center; gap: 12px; margin-bottom: 16px; flex-wrap: wrap; }
.detail-title { font-size: 16px; font-weight: 700; color: #fff; margin: 0; }
.detail-badge { padding: 5px 12px; background: rgba($racing-red,0.15); border: 1px solid rgba($racing-red,0.3); border-radius: 5px; font-size: 11px; font-weight: 600; color: $racing-red; }
.detail-cond { font-size: 11px; color: rgba(255,255,255,0.4); }

.theo-box { display: flex; gap: 16px; padding: 10px 14px; background: rgba(255,255,255,0.02); border-radius: 6px; margin-bottom: 16px; flex-wrap: wrap; }
.theo-main { font-size: 12px; color: #fff; }
.theo-lbl { color: rgba(255,255,255,0.5); margin-right: 6px; }
.theo-val { font-family: 'JetBrains Mono', monospace; font-weight: 600; }
.theo-detail { font-size: 11px; color: rgba(255,255,255,0.35); }

.limited-data { padding: 10px 14px; background: rgba($accent-warning,0.1); border: 1px solid rgba($accent-warning,0.3); border-radius: 6px; font-size: 12px; color: $accent-warning; margin-bottom: 16px; }

// CHART
.chart-section { margin-bottom: 20px; }
.chart-title { font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 10px 0; }
.chart-wrap { height: 220px; background: rgba(0,0,0,0.2); border-radius: 8px; padding: 12px; }

// LAPS TABLE
.laps-section { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.laps-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; }
.laps-title { font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.4); text-transform: uppercase; margin: 0; }
.toggle-btn { padding: 5px 10px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; font-size: 10px; color: rgba(255,255,255,0.5); cursor: pointer; &:hover { color: #fff; } }
.laps-table-wrap { flex: 1; overflow-y: auto; background: rgba(0,0,0,0.2); border-radius: 8px; }
.laps-table { width: 100%; border-collapse: collapse; font-size: 11px; }
.laps-table th { padding: 8px 10px; background: rgba(255,255,255,0.03); color: rgba(255,255,255,0.4); font-weight: 600; text-transform: uppercase; font-size: 9px; letter-spacing: 0.5px; text-align: left; position: sticky; top: 0; }
.laps-table td { padding: 8px 10px; border-bottom: 1px solid rgba(255,255,255,0.03); color: rgba(255,255,255,0.6); }
.laps-table .time { font-family: 'JetBrains Mono', monospace; color: #fff; }
.laps-table .delta { font-family: 'JetBrains Mono', monospace; }
.laps-table .status { text-align: center; }
.laps-table tr.invalid { opacity: 0.5; .status { color: #ef4444; } }
.laps-table tr.pit { opacity: 0.6; .status { color: #6b7280; } }

// RESPONSIVE
@media (max-width: 900px) {
  .master-detail { grid-template-columns: 1fr; grid-template-rows: auto 1fr; }
  .master { max-height: 200px; }
  .stint-item { grid-template-columns: 28px 28px 1fr auto; }
  .stint-fuel, .stint-laps, .stint-avg { display: none; }
}
</style>
