<script setup lang="ts">
// ============================================
// SessionDetailPage - Master / Detail Layout
// Now connected to Firebase for real data
// ============================================

import { computed, ref, onMounted, watch } from 'vue'
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
  formatDateFull,
  formatTime,
  getSessionTypeLabel,
  type FullSession,
  type StintData,
  type LapData
} from '~/composables/useTelemetryData'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler)

const props = defineProps<{ sessionId: string }>()
const emit = defineEmits<{ back: [], 'open-track': [trackId: string] }>()

const showDetailedLaps = ref(false)
const showInfoTempi = ref(false)
const showInfoTeo = ref(false)

// ========================================
// FIREBASE DATA LOADING
// ========================================
const { fetchSessionFull, trackStats, loadSessions } = useTelemetryData()
const fullSession = ref<FullSession | null>(null)
const isLoading = ref(true)
const loadError = ref<string | null>(null)

onMounted(async () => {
  isLoading.value = true
  loadError.value = null
  try {
    // Load sessions first to populate trackStats (needed for theoretical times)
    await loadSessions()
    
    const data = await fetchSessionFull(props.sessionId)
    if (data) {
      fullSession.value = data
      console.log('[SESSION_DETAIL] Loaded session:', data.session_info.track, data.stints.length, 'stints')
    } else {
      loadError.value = 'Sessione non trovata'
    }
  } catch (e: any) {
    loadError.value = e.message || 'Errore caricamento'
  } finally {
    isLoading.value = false
  }
})

// ========================================
// COMPARE MODE STATE - Checkbox-based
// ========================================
const compareModeActive = ref(false)
const compareSelection = ref<number[]>([])
const activeTableTab = ref<'A' | 'B'>('A')

const isCompareMode = computed(() => compareModeActive.value && compareSelection.value.length === 2)
const stintA = computed(() => compareSelection.value[0] ?? selectedStintNumber.value)
const stintB = computed(() => compareSelection.value[1] ?? null)

function handleStintClick(stintNum: number) {
  if (compareModeActive.value) {
    toggleCompareSelection(stintNum)
  } else {
    selectedStintNumber.value = stintNum
  }
}

function toggleCompareSelection(stintNum: number) {
  const idx = compareSelection.value.indexOf(stintNum)
  if (idx >= 0) {
    compareSelection.value.splice(idx, 1)
  } else if (compareSelection.value.length < 2) {
    compareSelection.value.push(stintNum)
  }
}

function toggleCompareMode() {
  compareModeActive.value = !compareModeActive.value
  if (!compareModeActive.value) {
    compareSelection.value = []
    activeTableTab.value = 'A'
  }
}

function clearCompare() {
  compareSelection.value = []
  compareModeActive.value = false
  activeTableTab.value = 'A'
}

// ========================================
// TRANSFORMED SESSION DATA
// ========================================
const session = computed(() => {
  if (!fullSession.value) {
    return {
      id: props.sessionId,
      track: 'Caricamento...',
      trackId: '',
      type: 'practice' as const,
      date: '-',
      time: '-',
      car: '-',
      startConditions: { weather: '-', airTemp: 0, trackTemp: 0 },
      bestQualy: '--:--.---',
      bestRace: '--:--.---',
      theoQualy: '--:--.---',
      theoRace: '--:--.---',
      bestDeltaQ: { value: '-', stintNum: 0 },
      bestDeltaR: { value: '-', stintNum: 0 },
      stints: [] as any[],
      lapsData: {} as Record<number, any[]>
    }
  }

  const fs = fullSession.value
  const info = fs.session_info
  
  // Transform stints to expected format
  const stints = fs.stints.map(stint => {
    const validLaps = stint.laps.filter(l => l.is_valid && !l.has_pit_stop)
    const bestLapMs = validLaps.length > 0 
      ? Math.min(...validLaps.map(l => l.lap_time_ms))
      : null
    const avgLapMs = validLaps.length > 0
      ? validLaps.reduce((sum, l) => sum + l.lap_time_ms, 0) / validLaps.length
      : null
    
    return {
      number: stint.stint_number,
      type: stint.type === 'Qualify' ? 'Q' : 'R',
      intent: stint.type === 'Qualify' ? 'Qualy Push' : 'Race Pace',
      fuelStart: stint.fuel_start,
      laps: stint.laps.length,
      best: bestLapMs ? formatLapTime(bestLapMs) : '--:--.---',
      avg: avgLapMs ? formatLapTime(avgLapMs) : '--:--.---',
      theoretical: formatLapTime(info.session_best_lap), // Simplified: use session best as theo
      deltaVsTheo: bestLapMs ? `+${((bestLapMs - info.session_best_lap) / 1000).toFixed(3)}` : '-',
      conditions: { 
        weather: info.start_weather, 
        avgAirTemp: info.start_air_temp, 
        avgTrackTemp: info.start_road_temp 
      },
      breakdown: { base: '-', deltaTemp: '-', deltaGrip: '-' }
    }
  })

  // Transform laps data
  const lapsData: Record<number, any[]> = {}
  fs.stints.forEach(stint => {
    lapsData[stint.stint_number] = stint.laps.map(lap => ({
      lap: lap.lap_number,
      time: formatLapTime(lap.lap_time_ms),
      delta: `+${((lap.lap_time_ms - info.session_best_lap) / 1000).toFixed(3)}`,
      valid: lap.is_valid,
      pit: lap.has_pit_stop,
      sectors: lap.sector_times_ms?.map(s => (s / 1000).toFixed(1)) || ['-', '-', '-'],
      fuel: Math.round(lap.fuel_remaining),
      trackTemp: Math.round(lap.road_temp),
      grip: lap.track_grip_status || 'Opt'
    }))
  })

  // Find best Q and R times
  let bestQualyMs: number | null = null
  let bestRaceMs: number | null = null
  let bestQualyStintNum = 0
  let bestRaceStintNum = 0

  fs.stints.forEach(stint => {
    const validLaps = stint.laps.filter(l => l.is_valid && !l.has_pit_stop)
    if (validLaps.length === 0) return
    const bestMs = Math.min(...validLaps.map(l => l.lap_time_ms))
    
    if (stint.type === 'Qualify') {
      if (!bestQualyMs || bestMs < bestQualyMs) {
        bestQualyMs = bestMs
        bestQualyStintNum = stint.stint_number
      }
    } else {
      if (!bestRaceMs || bestMs < bestRaceMs) {
        bestRaceMs = bestMs
        bestRaceStintNum = stint.stint_number
      }
    }
  })

  return {
    id: props.sessionId,
    track: info.track,
    trackId: info.track.toLowerCase().replace(/[^a-z0-9]/g, '_'),
    type: getSessionTypeLabel(info.session_type),
    date: formatDateFull(info.date_start),
    time: formatTime(info.date_start),
    car: formatCarName(info.car),
    startConditions: { 
      weather: info.start_weather, 
      airTemp: info.start_air_temp, 
      trackTemp: info.start_road_temp 
    },
    bestQualy: bestQualyMs ? formatLapTime(bestQualyMs) : '--:--.---',
    bestRace: bestRaceMs ? formatLapTime(bestRaceMs) : '--:--.---',
    theoQualy: formatLapTime(info.session_best_lap),
    theoRace: formatLapTime(info.session_best_lap),
    bestDeltaQ: { 
      value: bestQualyMs ? `+${((bestQualyMs - info.session_best_lap) / 1000).toFixed(3)}` : '-', 
      stintNum: bestQualyStintNum 
    },
    bestDeltaR: { 
      value: bestRaceMs ? `+${((bestRaceMs - info.session_best_lap) / 1000).toFixed(3)}` : '-', 
      stintNum: bestRaceStintNum 
    },
    stints,
    lapsData
  }
})

// ========================================
// THEORETICAL TIMES - Based on track historic bests + temp adjustment
// ========================================
const theoreticalTimes = computed(() => {
  if (!fullSession.value) {
    return { theoQualy: null, theoRace: null, theoAvgRace: null }
  }
  
  const fs = fullSession.value
  const info = fs.session_info
  const sessionTemp = info.start_air_temp || 23 // Default temp
  
  // Get session grip from first stint's first lap
  const firstLap = fs.stints[0]?.laps[0]
  const sessionGrip = firstLap?.track_grip_status || 'Optimum'
  
  // Find track stats for this track
  const trackId = (info.track || '').toLowerCase().replace(/[^a-z0-9]/g, '_')
  const trackStat = trackStats.value.find(t => {
    const statTrackId = t.track.toLowerCase().replace(/[^a-z0-9]/g, '_')
    return statTrackId.includes(trackId) || trackId.includes(statTrackId)
  })
  
  if (!trackStat?.bestByGrip) {
    return { theoQualy: null, theoRace: null, theoAvgRace: null, sessionGrip, sessionTemp }
  }
  
  const gripBests = trackStat.bestByGrip[sessionGrip]
  if (!gripBests) {
    return { theoQualy: null, theoRace: null, theoAvgRace: null, sessionGrip, sessionTemp }
  }
  
  // Calculate theoretical times with temperature adjustment
  // Formula: Theoretical = Historic + (SessionTemp - HistoricTemp) × 100ms per °C
  function calculateTheoretical(historicMs: number | null, historicTemp: number | null): number | null {
    if (!historicMs) return null
    const tempDiff = sessionTemp - (historicTemp || sessionTemp)
    const adjustmentMs = tempDiff * 100 // 0.1s = 100ms per degree
    return Math.round(historicMs + adjustmentMs)
  }
  
  return {
    theoQualy: calculateTheoretical(gripBests.bestQualy, gripBests.bestQualyTemp),
    theoRace: calculateTheoretical(gripBests.bestRace, gripBests.bestRaceTemp),
    theoAvgRace: calculateTheoretical(gripBests.bestAvgRace, gripBests.bestAvgRaceTemp),
    sessionGrip,
    sessionTemp,
    // Historic values for display
    historicQualy: gripBests.bestQualy,
    historicQualyTemp: gripBests.bestQualyTemp,
    historicRace: gripBests.bestRace,
    historicRaceTemp: gripBests.bestRaceTemp,
    historicAvgRace: gripBests.bestAvgRace,
    historicAvgRaceTemp: gripBests.bestAvgRaceTemp
  }
})

// ========================================
// SMART PRESELECTION - Best stint with >= 2 laps
// ========================================
const selectedStintNumber = ref(1)

watch(() => session.value.stints, (stints) => {
  if (stints.length > 0) {
    const validStints = stints.filter(s => s.laps >= 2)
    if (validStints.length > 0) {
      let best = validStints[0]!
      let bestDelta = parseFloat(best.deltaVsTheo) || 999
      validStints.forEach(s => {
        const d = parseFloat(s.deltaVsTheo) || 999
        if (d < bestDelta) { best = s; bestDelta = d }
      })
      selectedStintNumber.value = best.number
    } else {
      selectedStintNumber.value = stints[0]?.number || 1
    }
  }
}, { immediate: true })

const selectedStint = computed(() => session.value.stints.find(s => s.number === selectedStintNumber.value))
const selectedStintLaps = computed(() => session.value.lapsData[selectedStintNumber.value] || [])
const isLimitedData = computed(() => selectedStintLaps.value.length <= 1)
const isSingleStint = computed(() => session.value.stints.length === 1)

// Compare mode stint data
const compareStintA = computed(() => stintA.value ? session.value.stints.find(s => s.number === stintA.value) : null)
const compareStintB = computed(() => stintB.value ? session.value.stints.find(s => s.number === stintB.value) : null)
const compareStintALaps = computed(() => stintA.value ? (session.value.lapsData[stintA.value as keyof typeof session.value.lapsData] || []) : [])
const compareStintBLaps = computed(() => stintB.value ? (session.value.lapsData[stintB.value as keyof typeof session.value.lapsData] || []) : [])

// Current tab laps for table (in compare mode)
const currentTabLaps = computed(() => activeTableTab.value === 'A' ? compareStintALaps.value : compareStintBLaps.value)
const currentTabStint = computed(() => activeTableTab.value === 'A' ? compareStintA.value : compareStintB.value)

// Best stint info for label - separate for Q and R
const bestQualyStint = computed(() => {
  const qualyStints = session.value.stints.filter(s => s.type === 'Q' && s.laps >= 2)
  if (qualyStints.length === 0) return null
  let best = qualyStints[0]!
  qualyStints.forEach(s => {
    if (parseFloat(s.deltaVsTheo) < parseFloat(best.deltaVsTheo)) best = s
  })
  return best
})

const bestRaceStint = computed(() => {
  const raceStints = session.value.stints.filter(s => s.type === 'R' && s.laps >= 2)
  if (raceStints.length === 0) return null
  let best = raceStints[0]!
  raceStints.forEach(s => {
    if (parseFloat(s.deltaVsTheo) < parseFloat(best.deltaVsTheo)) best = s
  })
  return best
})

// Helper to check if stint is best in its category
function isBestStint(stint: typeof session.value.stints[0]): boolean {
  if (stint.type === 'Q') return bestQualyStint.value?.number === stint.number
  if (stint.type === 'R') return bestRaceStint.value?.number === stint.number
  return false
}

// Helper to check stint reliability - returns warning info or null if OK
function getStintWarning(stint: typeof session.value.stints[0]): { icon: string; message: string } | null {
  const laps = session.value.lapsData[stint.number as keyof typeof session.value.lapsData] || []
  const nonPitLaps = laps.filter(l => !l.pit)
  const validLaps = nonPitLaps.filter(l => l.valid)
  
  // All laps invalid = disaster
  if (nonPitLaps.length > 0 && validLaps.length === 0) {
    return { icon: '⚠️', message: 'Tutti i giri invalidi' }
  }
  
  // Race stint with < 5 laps = unreliable
  if (stint.type === 'R' && nonPitLaps.length < 5) {
    return { icon: '⚠️', message: `Stint gara troppo corto (${nonPitLaps.length} giri, min. 5)` }
  }
  
  // Qualy stint with only 1 lap = unreliable
  if (stint.type === 'Q' && nonPitLaps.length <= 1) {
    return { icon: '⚠️', message: 'Dati limitati (1 giro)' }
  }
  
  return null
}

// ========================================
// CHART - supports Compare Mode + Target Zone
// ========================================
const chartData = computed(() => {
  // Use compare stint data when in compare mode, otherwise selected stint
  const lapsA = isCompareMode.value ? compareStintALaps.value : selectedStintLaps.value
  const stintData = isCompareMode.value ? compareStintA.value : selectedStint.value
  const theoSecA = timeToSeconds(stintData?.theoretical)
  const isRace = stintData?.type === 'R'
  
  // Target Zone = Theoretical + 0.3s
  const targetLine = theoSecA + 0.3
  
  // Find best lap time in stint (for purple marker)
  const bestLapTime = stintData?.best
  const bestLapSec = timeToSeconds(bestLapTime)
  
  // Helper to check if lap TIME is on-target (under the target line) - ignores validity
  const isTimeOnTarget = (lap: typeof lapsA[0]) => {
    if (lap.pit) return false
    const lapSec = timeToSeconds(lap.time)
    return lapSec <= targetLine
  }
  
  // Helper to check if lap is valid and on-target
  const isOnTarget = (lap: typeof lapsA[0]) => {
    if (lap.pit || !lap.valid) return false
    return isTimeOnTarget(lap)
  }
  
  // Helper to check if lap is the best lap
  const isBestLap = (lap: typeof lapsA[0]) => {
    if (lap.pit || !lap.valid) return false
    return lap.time === bestLapTime
  }
  
  // Background colors: purple=best, green=on-target, blue=off-target, gray=pit, red=invalid
  const pointBackgroundColors = lapsA.map(l => {
    if (l.pit) return '#6b7280' // Gray for pit
    if (!l.valid) return '#ef4444' // Red for invalid (even if time was on-target)
    if (showTargetZone.value && isBestLap(l)) return '#a855f7' // Purple for best lap
    if (showTargetZone.value && isOnTarget(l)) return '#10b981' // Green for on-target
    return '#3b82f6' // Blue for normal
  })
  
  // Border colors: green border for invalid laps that had on-target time
  const pointBorderColors = lapsA.map(l => {
    if (l.pit) return '#6b7280' // Gray for pit
    if (!l.valid) {
      // Invalid lap - check if time was on-target to show green border
      if (showTargetZone.value && isTimeOnTarget(l)) return '#10b981' // Green border
      return '#ef4444' // Red border for normal invalid
    }
    if (showTargetZone.value && isBestLap(l)) return '#a855f7' // Purple for best lap
    if (showTargetZone.value && isOnTarget(l)) return '#10b981' // Green for on-target
    return '#3b82f6' // Blue for normal
  })
  
  // Border width: 2px for invalid on-target laps, 1px for others
  const pointBorderWidths = lapsA.map(l => {
    if (!l.valid && !l.pit && showTargetZone.value && isTimeOnTarget(l)) return 2
    return 1
  })
  
  const datasets: any[] = [
    {
      label: isCompareMode.value ? `A: Stint #${stintA.value}` : 'Tempo',
      data: lapsA.map(l => timeToSeconds(l.time)),
      borderColor: '#3b82f6',
      backgroundColor: 'rgba(59,130,246,0.1)',
      pointBackgroundColor: pointBackgroundColors,
      pointBorderColor: pointBorderColors,
      pointBorderWidth: pointBorderWidths,
      pointRadius: 5,
      tension: 0.2,
      order: 1
    },
    {
      label: `Teorico ${stintData?.type === 'Q' ? 'Q' : 'R'}`,
      data: lapsA.map(() => theoSecA),
      borderColor: '#f59e0b',
      borderDash: [5, 5],
      pointRadius: 0,
      order: 3
    }
  ]
  
  // Add target zone line for Race stints (when toggle is on)
  if (isRace && showTargetZone.value && lapsA.length > 0) {
    datasets.push({
      label: 'Target (+0.3s)',
      data: lapsA.map(() => targetLine),
      borderColor: 'rgba(16, 185, 129, 0.6)',
      borderWidth: 2,
      borderDash: [3, 3],
      backgroundColor: 'rgba(16, 185, 129, 0.05)',
      fill: 'origin', // Fill from line to bottom (Y=0)
      pointRadius: 0,
      order: 4
    })
  }
  
  // Add grip zone backgrounds (when toggle is on and there's variation)
  if (showGripZones.value && hasGripVariation.value && lapsA.length > 0) {
    // Find max Y value in the data for zone height
    const maxY = Math.max(...lapsA.map(l => timeToSeconds(l.time))) + 5
    
    gripZones.value.forEach((zone, zoneIdx) => {
      const color = gripColors[zone.gripLevel] || gripColors['Opt']
      // Create data array with null for laps outside this zone
      const zoneData = lapsA.map((_, idx) => {
        const lapNum = idx + 1
        if (lapNum >= zone.startLap && lapNum <= zone.endLap) {
          return maxY
        }
        return null
      })
      
      datasets.push({
        label: `_grip_${zoneIdx}`, // Hidden label (starts with _)
        data: zoneData,
        borderColor: 'transparent',
        backgroundColor: color?.bg,
        fill: 'origin',
        pointRadius: 0,
        order: 10 + zoneIdx, // Behind everything
        spanGaps: false
      })
    })
  }
  
  // Add stint B line if in compare mode
  if (isCompareMode.value && compareStintBLaps.value.length > 0) {
    const lapsB = compareStintBLaps.value
    datasets.splice(1, 0, {
      label: `B: Stint #${stintB.value}`,
      data: lapsB.map(l => timeToSeconds(l.time)),
      borderColor: '#8b5cf6',
      backgroundColor: 'rgba(139,92,246,0.1)',
      pointBackgroundColor: lapsB.map(l => l.pit ? '#6b7280' : !l.valid ? '#ef4444' : '#8b5cf6'),
      pointRadius: 5,
      tension: 0.2
    })
  }
  
  // Use max laps for X axis labels
  const maxLaps = isCompareMode.value 
    ? Math.max(lapsA.length, compareStintBLaps.value.length)
    : lapsA.length
  const labels = Array.from({ length: maxLaps }, (_, i) => `G${i + 1}`)
  
  return { labels, datasets }
})

const chartOptions = {
  responsive: true,
  maintainAspectRatio: false,
  plugins: {
    legend: {
      display: true,
      position: 'bottom' as const,
      labels: {
        color: 'rgba(255,255,255,0.7)',
        font: { size: 11 },
        filter: (item: any) => !item.text.startsWith('_') // Hide internal labels
      }
    },
    tooltip: {
      backgroundColor: 'rgba(15,15,25,0.95)',
      callbacks: {
        label: (ctx: any) => {
          if (ctx.dataset.label?.startsWith('_')) return '' // Hide internal tooltip
          return `${ctx.dataset.label}: ${secondsToTime(ctx.raw)}`
        }
      }
    }
  },
  scales: {
    x: { grid: { color: 'rgba(255,255,255,0.08)' }, ticks: { color: 'rgba(255,255,255,0.6)', font: { size: 11 } } },
    y: { grid: { color: 'rgba(255,255,255,0.08)' }, ticks: { color: 'rgba(255,255,255,0.6)', font: { size: 11 }, callback: (v: string | number) => typeof v === 'number' ? secondsToTime(v) : v } }
  }
}

// ========================================
// HELPERS
// ========================================
function timeToSeconds(t: string | undefined): number {
  if (!t) return 0
  const parts = t.split(':')
  const m = Number(parts[0]) || 0
  const s = Number(parts[1]) || 0
  return m * 60 + s
}
function secondsToTime(s: number): string { const m = Math.floor(s / 60); return `${m}:${(s % 60).toFixed(3).padStart(6, '0')}` }
function getTypeLabel(t: string) { return { practice: 'PRACTICE', qualify: 'QUALIFY', race: 'RACE' }[t] || t.toUpperCase() }
function getDeltaClass(d: string | undefined) { if (!d) return 'far'; const v = parseFloat(d); if (v <= 0) return 'fast'; if (v <= 0.3) return 'ok'; if (v <= 0.5) return 'margin'; return 'far' }
function getDeltaLabel(d: string) { const v = parseFloat(d); if (v <= 0) return 'FAST'; if (v <= 0.3) return 'OK'; if (v <= 0.5) return 'MARGIN'; return 'LONTANO' }

// For colored dots in comparison box
function getDeltaDotClass(d: string | undefined) {
  if (!d) return 'dot--neutral'
  const v = parseFloat(d)
  if (v <= 0) return 'dot--fast'
  if (v <= 0.3) return 'dot--ok'
  if (v <= 0.5) return 'dot--margin'
  return 'dot--far'
}

// Calculate avg delta vs theoretical avg
function getAvgDelta(): string {
  if (!selectedStint.value) return '-'
  const avgSec = timeToSeconds(selectedStint.value.avg)
  const theoSec = timeToSeconds(selectedStint.value.theoretical)
  // For avg, theo is typically +0.5-1s slower than best
  const theoAvgSec = theoSec + 0.5 // Simplified: theo avg = theo best + 0.5s
  const delta = avgSec - theoAvgSec
  return delta >= 0 ? `+${delta.toFixed(3)}` : delta.toFixed(3)
}

// Calculate theoretical average (simplified: +0.5s from theo best)
function getTheoAvg(): string {
  if (!selectedStint.value) return '-'
  const theoSec = timeToSeconds(selectedStint.value.theoretical)
  return secondsToTime(theoSec + 0.5)
}

// ========================================
// DELTA CALCULATIONS (explicit for Best and Avg)
// ========================================
const deltaBest = computed(() => {
  if (!selectedStint.value) return { value: '-', seconds: 0, class: 'neutral' }
  const actualSec = timeToSeconds(selectedStint.value.best)
  const theoSec = timeToSeconds(selectedStint.value.theoretical)
  const delta = actualSec - theoSec
  const formatted = delta >= 0 ? `+${delta.toFixed(3)}` : delta.toFixed(3)
  return { 
    value: formatted, 
    seconds: delta,
    class: getDeltaClass(formatted) 
  }
})

const deltaAvg = computed(() => {
  if (!selectedStint.value) return { value: '-', seconds: 0, class: 'neutral' }
  const actualSec = timeToSeconds(selectedStint.value.avg)
  const theoSec = timeToSeconds(selectedStint.value.theoretical)
  const theoAvgSec = theoSec + 0.5 // Theo avg = theo best + 0.5s
  const delta = actualSec - theoAvgSec
  const formatted = delta >= 0 ? `+${delta.toFixed(3)}` : delta.toFixed(3)
  return { 
    value: formatted, 
    seconds: delta,
    class: getDeltaClass(formatted) 
  }
})

// ========================================
// CONSISTENCY STATS (laps under target threshold)
// ========================================
const consistencyStats = computed(() => {
  if (!selectedStint.value || selectedStintLaps.value.length === 0) {
    return { onTarget: 0, total: 0, pct: 0, targetLine: '-' }
  }
  
  // Target = Theoretical + 0.3s
  const theoSec = timeToSeconds(selectedStint.value.theoretical)
  const targetLine = theoSec + 0.3
  
  const validLaps = selectedStintLaps.value.filter(l => l.valid && !l.pit)
  const total = validLaps.length
  
  let onTarget = 0
  validLaps.forEach(lap => {
    const lapSec = timeToSeconds(lap.time)
    if (lapSec <= targetLine) onTarget++
  })
  
  return {
    onTarget,
    total,
    pct: total > 0 ? Math.round((onTarget / total) * 100) : 0,
    targetLine: secondsToTime(targetLine)
  }
})

// ========================================
// VALIDITY STATS (percentage of valid laps)
// ========================================
const validityStats = computed(() => {
  const allLaps = selectedStintLaps.value.filter(l => !l.pit) // Exclude pit laps from count
  const total = allLaps.length
  const valid = allLaps.filter(l => l.valid).length
  const invalid = total - valid
  
  return {
    valid,
    invalid,
    total,
    pct: total > 0 ? Math.round((valid / total) * 100) : 100
  }
})

// ========================================
// STINT DURATION (sum of all lap times)
// ========================================
const stintDuration = computed(() => {
  if (!selectedStintLaps.value || selectedStintLaps.value.length === 0) {
    return { minutes: 0, seconds: 0, formatted: '0:00' }
  }
  
  // Sum all lap times in seconds
  let totalSeconds = 0
  selectedStintLaps.value.forEach(lap => {
    totalSeconds += timeToSeconds(lap.time)
  })
  
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = Math.floor(totalSeconds % 60)
  const formatted = `${minutes}:${seconds.toString().padStart(2, '0')}`
  
  return { minutes, seconds, formatted }
})

// Toggle for showing target zone on chart
const showTargetZone = ref(true)

// Toggle for showing grip zones on chart
const showGripZones = ref(true)

// Grip level colors for visualization
const gripColors: Record<string, { bg: string; border: string; label: string }> = {
  'Opt': { bg: 'rgba(16, 185, 129, 0.15)', border: '#10b981', label: 'Optimum' },
  'Green': { bg: 'rgba(132, 204, 22, 0.15)', border: '#84cc16', label: 'Green' },
  'Greasy': { bg: 'rgba(234, 179, 8, 0.15)', border: '#eab308', label: 'Greasy' },
  'Damp': { bg: 'rgba(249, 115, 22, 0.15)', border: '#f97316', label: 'Damp' },
  'Wet': { bg: 'rgba(59, 130, 246, 0.15)', border: '#3b82f6', label: 'Wet' },
  'Flooded': { bg: 'rgba(139, 92, 246, 0.15)', border: '#8b5cf6', label: 'Flooded' }
}

// Check if current stint has grip variation
const hasGripVariation = computed(() => {
  const laps = selectedStintLaps.value
  if (laps.length < 2) return false
  const firstGrip = laps[0]?.grip
  return laps.some(l => l.grip !== firstGrip)
})

// Get grip zones for current stint (groups of consecutive laps with same grip)
const gripZones = computed(() => {
  const laps = selectedStintLaps.value
  if (laps.length === 0) return []
  
  const zones: { gripLevel: string; startLap: number; endLap: number }[] = []
  let currentGrip = laps[0]?.grip || 'Opt'
  let startLap = 1
  
  laps.forEach((lap, idx) => {
    if (lap.grip !== currentGrip) {
      zones.push({ gripLevel: currentGrip, startLap, endLap: idx })
      currentGrip = lap.grip
      startLap = idx + 1
    }
  })
  // Add final zone
  zones.push({ gripLevel: currentGrip, startLap, endLap: laps.length })
  
  return zones
})
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

    <!-- LOADING STATE -->
    <div v-if="isLoading" class="loading-state">
      <div class="loading-spinner"></div>
      <p>Caricamento sessione...</p>
    </div>

    <!-- ERROR STATE -->
    <div v-else-if="loadError" class="error-state">
      <p class="error-icon">⚠️</p>
      <p class="error-text">{{ loadError }}</p>
      <button class="nav-btn" @click="emit('back')">Torna alle sessioni</button>
    </div>

    <template v-else>

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
    </header>

    <!-- KPI section removed - now dynamic in detail panel -->

    <!-- ========================================== -->
    <!-- MASTER / DETAIL LAYOUT -->
    <!-- ========================================== -->
    <div class="master-detail">
      <!-- MASTER: Stint List with Header -->
      <aside class="master">
        <h2 class="master-title">Stint ({{ session.stints.length }})</h2>
        
        <!-- CONTROL PANEL -->
        <div class="control-panel">
          <button 
            class="control-btn control-btn--disabled"
            disabled
            title="Coming soon"
          >
            <span class="control-icon">⚖️</span>
            <span class="control-label">Confronta stint</span>
          </button>
          <span class="control-hint">Coming soon</span>
        </div>
        
        <!-- 1) HEADER LEGENDA LISTA STINT -->
        <div :class="['stint-header', { 'stint-header--compare': compareModeActive }]">
          <span v-if="compareModeActive" class="sh-checkbox">✓</span>
          <span class="sh-best-icon"></span>
          <span class="sh-type">Tipo</span>
          <span class="sh-num">#</span>
          <span class="sh-laps">Giri</span>
          <span class="sh-delta">Δ Theo</span>
        </div>
        
        <!-- Caso limite: 1 solo stint -->
        <div v-if="isSingleStint" class="single-stint-note">
          1 stint in sessione · Nessun confronto interno disponibile
        </div>
        
        <div class="stint-list">
          <button
            v-for="stint in session.stints"
            :key="stint.number"
            :class="['stint-item', { 
              'stint-item--compare': compareModeActive,
              selected: !compareModeActive && selectedStintNumber === stint.number,
              'compare-selected': compareModeActive && compareSelection.includes(stint.number),
              'compare-a': compareModeActive && compareSelection[0] === stint.number,
              'compare-b': compareModeActive && compareSelection[1] === stint.number,
              'best-stint': isBestStint(stint)
            }]"
            @click="handleStintClick(stint.number)"
          >
            <!-- Checkbox in compare mode -->
            <span v-if="compareModeActive" class="stint-checkbox">
              <span v-if="compareSelection.includes(stint.number)" class="checkbox-checked">
                {{ compareSelection[0] === stint.number ? 'A' : 'B' }}
              </span>
              <span v-else class="checkbox-empty"></span>
            </span>
            <!-- Best stint indicator OR Warning icon -->
            <span class="stint-best-icon" :title="getStintWarning(stint)?.message">
              <template v-if="isBestStint(stint)">🏆</template>
              <template v-else-if="getStintWarning(stint)">{{ getStintWarning(stint)?.icon }}</template>
            </span>
            <span :class="['stint-type', `stint-type--${stint.type.toLowerCase()}`]">{{ stint.type }}</span>
            <span class="stint-num">#{{ stint.number }}</span>
            <span class="stint-laps">{{ stint.laps }}</span>
            <span :class="['stint-delta', `delta--${getDeltaClass(stint.deltaVsTheo)}`]">
              <span class="delta-val">{{ stint.deltaVsTheo }}</span>
              <span class="delta-lbl">{{ getDeltaLabel(stint.deltaVsTheo) }}</span>
            </span>
          </button>
        </div>
      </aside>

      <!-- DETAIL: Analysis Panel -->
      <section class="detail">
        <!-- COMPARE MODE HEADER -->
        <div v-if="isCompareMode" class="compare-header">
          <div class="compare-info">
            <span class="compare-label">Confronto Stint:</span>
            <span class="compare-a">A: #{{ stintA }} {{ compareStintA?.type }}</span>
            <span class="compare-vs">vs</span>
            <span class="compare-b">B: #{{ stintB }} {{ compareStintB?.type }}</span>
          </div>
          <button class="compare-close" @click="clearCompare">✕ Chiudi confronto</button>
        </div>

        <!-- Stint Header - Clean minimal style -->
        <div v-if="!isCompareMode" class="detail-header">
          <span :class="['stint-type-tag', `stint-type-tag--${selectedStint?.type?.toLowerCase()}`]">
            {{ selectedStint?.type === 'Q' ? 'QUALY' : 'RACE' }}
          </span>
          <h3 class="detail-title">Stint #{{ selectedStintNumber }} · {{ selectedStint?.intent ?? 'Seleziona uno stint' }}</h3>
          <span v-if="selectedStint && isBestStint(selectedStint)" class="best-tag">🏆 Best</span>
        </div>

        <!-- 5) Limited Data / Reliability Warning -->
        <div v-if="selectedStint && getStintWarning(selectedStint)" class="limited-data">
          {{ getStintWarning(selectedStint)?.icon }} {{ getStintWarning(selectedStint)?.message }}
        </div>

        <!-- ========================================== -->
        <!-- CONFRONTO DINAMICO: TEMPI vs TEMPI TEORICI -->
        <!-- ========================================== -->
        <div class="times-comparison">
          <!-- Weather conditions bar -->
          <div class="tc-conditions">
            <span class="tc-cond-item">
              <span class="tc-cond-icon">☀️</span>
              <span class="tc-cond-val">{{ selectedStint?.conditions?.weather ?? 'Dry' }}</span>
            </span>
            <span class="tc-cond-item">
              <span class="tc-cond-lbl">Aria</span>
              <span class="tc-cond-val">{{ session.startConditions.airTemp }}°</span>
            </span>
            <span class="tc-cond-item">
              <span class="tc-cond-lbl">Asfalto</span>
              <span class="tc-cond-val">{{ selectedStint?.conditions?.avgTrackTemp ?? '-' }}°</span>
            </span>
            <span class="tc-cond-item">
              <span class="tc-cond-lbl">Grip</span>
              <span class="tc-cond-val">{{ selectedStintLaps[0]?.grip ?? 'Opt' }}</span>
            </span>
          </div>
          
          <div class="tc-main">
            <div class="tc-column tc-actual">
              <h5 class="tc-header">
                TEMPI STINT
                <span class="info-icon" @click="showInfoTempi = !showInfoTempi">
                  <svg width="14" height="14" viewBox="0 0 512 512">
                    <circle cx="256" cy="256" r="256" fill="currentColor"/>
                    <text x="256" y="380" text-anchor="middle" font-size="340" font-weight="700" font-family="Arial" fill="#1a1a2e">i</text>
                  </svg>
                </span>
                <div v-if="showInfoTempi" class="info-popup">
                  <strong>Tempi Stint</strong><br>
                  <b>BEST:</b> Giro più veloce tra i giri validi dello stint.<br>
                  <b>AVG:</b> Media dei giri "puliti" (validi, no pit, no outlap, entro 115% del best).<br>
                  <span class="info-close" @click.stop="showInfoTempi = false">✕</span>
                </div>
              </h5>
              <div class="tc-row">
                <span class="tc-label">BEST:</span>
                <span class="tc-value">{{ selectedStint?.best ?? '-' }}</span>
              </div>
              <div class="tc-row">
                <span class="tc-label">AVG:</span>
                <span class="tc-value">{{ selectedStint?.avg ?? '-' }}</span>
              </div>
            </div>
            <div class="tc-divider"></div>
            <div class="tc-column tc-theo">
              <h5 class="tc-header">
                TEORICI ({{ theoreticalTimes.sessionGrip || 'Optimum' }})
                <span class="info-icon" @click="showInfoTeo = !showInfoTeo">
                  <svg width="14" height="14" viewBox="0 0 512 512">
                    <circle cx="256" cy="256" r="256" fill="currentColor"/>
                    <text x="256" y="380" text-anchor="middle" font-size="340" font-weight="700" font-family="Arial" fill="#1a1a2e">i</text>
                  </svg>
                </span>
                <div v-if="showInfoTeo" class="info-popup info-popup-right">
                  <strong>Tempi Teorici</strong><br>
                  Best storico per questo grip + aggiustamento temperatura:<br>
                  <code>Teorico = Storico + (TempSessione - TempStorico) × 0.1s/°C</code><br>
                  <span class="info-close" @click.stop="showInfoTeo = false">✕</span>
                </div>
              </h5>
              <!-- Qualify stint: show only Theo Best Qualifying -->
              <template v-if="selectedStint?.type === 'Q'">
                <div class="tc-row">
                  <span class="tc-label">THEO BEST Q:</span>
                  <span class="tc-value">{{ theoreticalTimes.theoQualy ? formatLapTime(theoreticalTimes.theoQualy) : '—:—.---' }}</span>
                </div>
              </template>
              <!-- Race/Practice stint: show Theo Best Race + Theo Avg -->
              <template v-else>
                <div class="tc-row">
                  <span class="tc-label">THEO BEST R:</span>
                  <span class="tc-value">{{ theoreticalTimes.theoRace ? formatLapTime(theoreticalTimes.theoRace) : '—:—.---' }}</span>
                </div>
                <div class="tc-row">
                  <span class="tc-label">THEO AVG:</span>
                  <span class="tc-value">{{ theoreticalTimes.theoAvgRace ? formatLapTime(theoreticalTimes.theoAvgRace) : '—:—.---' }}</span>
                </div>
              </template>
            </div>
            <div class="tc-divider"></div>
            <div class="tc-column tc-deltas">
              <h5 class="tc-header">DELTA</h5>
              <div class="tc-row">
                <span :class="['tc-delta-inline', deltaBest.class]">{{ deltaBest.value }}</span>
              </div>
              <div class="tc-row">
                <span :class="['tc-delta-inline', deltaAvg.class]">{{ deltaAvg.value }}</span>
              </div>
            </div>
          </div>
          
          <!-- Stint Duration -->
          <div class="tc-duration">
            <span class="tc-duration-label">DURATA STINT:</span>
            <span class="tc-duration-value">{{ stintDuration.minutes }}</span>
            <span class="tc-duration-unit">min</span>
            <span class="tc-duration-value">{{ stintDuration.seconds.toString().padStart(2, '0') }}</span>
            <span class="tc-duration-unit">sec</span>
          </div>
          
          <!-- Consistency Stats (Race stints only) - simplified -->
          <div v-if="selectedStint?.type === 'R' && consistencyStats.total > 0" class="tc-consistency">
            <span class="tc-cons-title">COSTANZA</span>
            <div class="tc-cons-simple">
              <span class="tc-cons-number">{{ consistencyStats.onTarget }}/{{ consistencyStats.total }}</span>
              <span class="tc-cons-desc">giri sotto target (theo +0.3s)</span>
              <div class="tc-cons-bar-wide">
                <div class="tc-cons-fill tc-cons-fill--target" :style="{ width: consistencyStats.pct + '%' }"></div>
              </div>
              <span class="tc-cons-pct">{{ consistencyStats.pct }}%</span>
            </div>
            <div class="tc-toggles-row">
              <label class="tc-toggle" title="Mostra target zone sul grafico">
                <input type="checkbox" v-model="showTargetZone" />
                <span class="tc-toggle-slider"></span>
                <span class="tc-toggle-label">Target</span>
              </label>
              <label v-if="hasGripVariation" class="tc-toggle" title="Mostra zone grip sul grafico">
                <input type="checkbox" v-model="showGripZones" />
                <span class="tc-toggle-slider"></span>
                <span class="tc-toggle-label">Grip</span>
              </label>
            </div>
          </div>
          
          <!-- Validity Stats -->
          <div v-if="validityStats.total > 0" class="tc-validity">
            <span class="tc-cons-title">VALIDITÀ</span>
            <div class="tc-cons-simple">
              <span class="tc-cons-number">{{ validityStats.valid }}/{{ validityStats.total }}</span>
              <span class="tc-cons-desc">giri validi</span>
              <div class="tc-cons-bar-wide">
                <div class="tc-cons-fill tc-cons-fill--validity" :style="{ width: validityStats.pct + '%' }"></div>
              </div>
              <span :class="['tc-cons-pct', validityStats.pct < 100 ? 'tc-cons-pct--warning' : '']">{{ validityStats.pct }}%</span>
            </div>
            <span v-if="validityStats.invalid > 0" class="tc-invalid-badge">
              <span class="tc-invalid-dot"></span>
              {{ validityStats.invalid }} invalidi
            </span>
          </div>
        </div>

        <!-- Chart -->
        <div class="chart-section">
          <h4 class="chart-title">
            <template v-if="isCompareMode">Confronto Tempi — A: Stint #{{ stintA }} vs B: Stint #{{ stintB }}</template>
            <template v-else>Tempi Giro — Stint {{ selectedStintNumber }}</template>
          </h4>
          <div class="chart-wrap">
            <Line :data="chartData" :options="chartOptions" />
          </div>
          <!-- Grip Legend -->
          <div v-if="hasGripVariation && showGripZones" class="grip-legend">
            <span class="grip-legend-title">Grip:</span>
            <div v-for="zone in gripZones" :key="`${zone.gripLevel}-${zone.startLap}`" class="grip-legend-item">
              <span class="grip-legend-dot" :style="{ backgroundColor: gripColors[zone.gripLevel]?.border || '#fff' }"></span>
              <span class="grip-legend-label">{{ gripColors[zone.gripLevel]?.label || zone.gripLevel }}</span>
              <span class="grip-legend-laps">(G{{ zone.startLap }}-G{{ zone.endLap }})</span>
            </div>
          </div>
        </div>

        <!-- Laps Table -->
        <div class="laps-section">
          <div class="laps-header-row">
            <!-- Tabs A|B in compare mode -->
            <div v-if="isCompareMode" class="laps-tabs">
              <button :class="['lap-tab', { 'lap-tab--active': activeTableTab === 'A' }]" @click="activeTableTab = 'A'">
                A: Stint #{{ stintA }}
              </button>
              <button :class="['lap-tab', { 'lap-tab--active': activeTableTab === 'B' }]" @click="activeTableTab = 'B'">
                B: Stint #{{ stintB }}
              </button>
            </div>
            <h4 v-else class="laps-title">Tabella Giri — Stint {{ selectedStintNumber }}</h4>
            
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
                <tr v-for="lap in (isCompareMode ? currentTabLaps : selectedStintLaps)" :key="lap.lap" :class="{ invalid: !lap.valid, pit: lap.pit }">
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
    </template>
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

// LOADING & ERROR STATES
.loading-state, .error-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 400px;
  color: rgba(255,255,255,0.6);
  p { margin: 16px 0; font-size: 14px; }
}
.loading-spinner {
  width: 40px;
  height: 40px;
  border: 3px solid rgba(255,255,255,0.1);
  border-top-color: $racing-red;
  border-radius: 50%;
  animation: spin 1s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.error-state {
  .error-icon { font-size: 48px; margin-bottom: 8px; }
  .error-text { color: rgba(255,100,100,0.8); }
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
.header-meta { display: flex; gap: 8px; font-size: 13px; color: rgba(255,255,255,0.6); margin-bottom: 10px; .sep { color: rgba(255,255,255,0.2); } .car { color: rgba(255,255,255,0.5); } }
.start-cond { display: flex; gap: 14px; font-size: 12px; color: rgba(255,255,255,0.7); }
.cond-label { font-size: 9px; font-weight: 700; letter-spacing: 1px; color: rgba(255,255,255,0.5); padding: 3px 8px; background: rgba(255,255,255,0.05); border-radius: 4px; }

// === KPI SESSIONE CON DELTA ===
.summary { display: flex; gap: 16px; margin-bottom: 20px; }
.summary-box {
  display: flex; flex-direction: column; gap: 4px;
  padding: 16px 24px; background: linear-gradient(145deg,#1a1a24,#12121a);
  border: 1px solid rgba(255,255,255,0.08); border-radius: 12px;
  min-width: 180px;
}
.kpi-label { font-size: 10px; font-weight: 600; text-transform: uppercase; letter-spacing: 1px; color: rgba(255,255,255,0.5); }
.kpi-value { font-family: 'JetBrains Mono', monospace; font-size: 20px; font-weight: 700; color: #fff; }
.kpi-theo { font-size: 11px; color: rgba(255,255,255,0.5); }
.kpi-delta {
  font-family: 'JetBrains Mono', monospace; font-size: 13px; font-weight: 600;
  small { font-weight: 400; opacity: 0.7; }
}

// MASTER / DETAIL
.master-detail { display: grid; grid-template-columns: 380px 1fr; gap: 20px; flex: 1; min-height: 0; }

// MASTER
.master {
  display: flex; flex-direction: column;
  background: linear-gradient(145deg,#151520,#0d0d12);
  border: 1px solid rgba(255,255,255,0.06); border-radius: 12px;
  padding: 16px; overflow: hidden;
}
.master-title { font-size: 12px; font-weight: 700; color: rgba(255,255,255,0.6); text-transform: uppercase; letter-spacing: 1px; margin: 0 0 12px 0; }

// 1) STINT HEADER LEGENDA
.stint-header {
  display: grid; grid-template-columns: 24px 32px 32px 32px 1fr;
  align-items: center; gap: 8px;
  padding: 8px 12px;
  background: rgba(255,255,255,0.04);
  border-radius: 6px;
  margin-bottom: 8px;
  font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px;
  color: rgba(255,255,255,0.6);
  &--compare { grid-template-columns: 28px 24px 32px 32px 32px 1fr; }
}
.sh-best-icon { width: 24px; }
.sh-type, .sh-num, .sh-laps { text-align: center; }
.sh-delta { text-align: right; }

.single-stint-note {
  padding: 8px 12px;
  background: rgba($accent-info, 0.08);
  border: 1px solid rgba($accent-info, 0.2);
  border-radius: 6px;
  font-size: 11px;
  color: rgba($accent-info, 0.8);
  margin-bottom: 8px;
  text-align: center;
}

.stint-list { flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; }
.stint-item {
  display: grid; grid-template-columns: 24px 32px 32px 32px 1fr;
  align-items: center; gap: 8px;
  padding: 10px 12px; background: rgba(255,255,255,0.02);
  border: 1px solid rgba(255,255,255,0.04); border-radius: 6px;
  cursor: pointer; transition: all 0.12s; text-align: left;
  &--compare { grid-template-columns: 28px 24px 32px 32px 32px 1fr; }
  &:hover { background: rgba(255,255,255,0.04); }
  &.selected { background: rgba($racing-red,0.1); border-color: rgba($racing-red,0.3); }
  &.compare-selected { background: rgba(#8b5cf6,0.08); border-color: rgba(#8b5cf6,0.25); }
  &.compare-a { background: rgba(#3b82f6,0.1); border-color: rgba(#3b82f6,0.35); }
  &.compare-b { background: rgba(#8b5cf6,0.1); border-color: rgba(#8b5cf6,0.35); }
  &.best-stint { border-color: rgba($accent-success, 0.3); }
}
.stint-laps { font-size: 11px; color: rgba(255,255,255,0.5); text-align: center; }

// BEST STINT ICON
.stint-best-icon {
  font-size: 14px;
  text-align: center;
  min-width: 24px;
}

// CONTROL PANEL
.control-panel {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 12px;
  background: rgba(0,0,0,0.2);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 6px;
  margin-bottom: 10px;
}
.control-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 6px 12px;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 6px;
  font-family: $font-primary;
  font-size: 11px; font-weight: 600;
  color: rgba(255,255,255,0.7);
  cursor: pointer;
  transition: all 0.15s;
  &:hover:not(:disabled) { background: rgba(#8b5cf6,0.15); border-color: rgba(#8b5cf6,0.4); color: #fff; }
  &--active { background: rgba(#8b5cf6,0.2); border-color: rgba(#8b5cf6,0.5); color: #8b5cf6; }
  &:disabled { opacity: 0.3; cursor: not-allowed; }
}
.control-icon { font-size: 14px; }
.control-label { white-space: nowrap; }
.control-hint {
  font-size: 10px;
  color: rgba(255,255,255,0.4);
  &--ready { color: $accent-success; font-weight: 600; }
}

// CHECKBOX FOR COMPARE MODE
.stint-checkbox {
  display: flex; align-items: center; justify-content: center;
  width: 22px; height: 22px;
  border: 2px solid rgba(255,255,255,0.15);
  border-radius: 4px;
  background: rgba(0,0,0,0.2);
  transition: all 0.15s;
}
.checkbox-empty {
  width: 100%; height: 100%;
}
.checkbox-checked {
  width: 100%; height: 100%;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, #8b5cf6, #6366f1);
  border-radius: 2px;
  font-size: 10px; font-weight: 700;
  color: #fff;
}
.stint-item.compare-selected .stint-checkbox {
  border-color: #8b5cf6;
}
.stint-item.compare-a .stint-checkbox { border-color: #3b82f6; }
.stint-item.compare-a .checkbox-checked { background: linear-gradient(135deg, #3b82f6, #2563eb); }
.stint-item.compare-b .stint-checkbox { border-color: #8b5cf6; }

// Header checkbox column
.sh-checkbox {
  width: 22px;
  font-size: 10px;
  color: rgba(255,255,255,0.4);
  text-align: center;
}
.stint-type { padding: 3px 6px; border-radius: 3px; font-size: 9px; font-weight: 700; text-align: center;
  &--q { background: rgba($accent-warning,0.15); color: $accent-warning; }
  &--r { background: rgba(255,100,100,0.15); color: rgb(255,100,100); }
  &--l { background: rgba($accent-info,0.15); color: $accent-info; }
}
.stint-num { font-size: 11px; font-weight: 600; color: #fff; text-align: center; }
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

// DETAIL HEADER - Clean minimal style
.detail-header {
  display: flex; align-items: center; gap: 12px;
  margin-bottom: 16px;
}
.stint-type-tag {
  padding: 4px 10px;
  border-radius: 4px;
  font-size: 10px; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.5px;
  &--q { background: rgba($accent-warning, 0.15); color: $accent-warning; border: 1px solid rgba($accent-warning, 0.3); }
  &--r { background: rgba(255, 100, 100, 0.15); color: rgb(255, 100, 100); border: 1px solid rgba(255, 100, 100, 0.3); }
}
.detail-title { font-size: 16px; font-weight: 600; color: #fff; margin: 0; }
.best-tag {
  font-size: 11px; font-weight: 600; color: $accent-success;
  padding: 4px 8px;
  background: rgba($accent-success, 0.1);
  border-radius: 4px;
  margin-left: auto;
}

// COMPARE MODE HEADER
.compare-header {
  display: flex; justify-content: space-between; align-items: center;
  padding: 12px 16px;
  background: rgba(#8b5cf6, 0.1);
  border: 1px solid rgba(#8b5cf6, 0.3);
  border-radius: 8px;
  margin-bottom: 16px;
}
.compare-info { display: flex; align-items: center; gap: 10px; }
.compare-label { font-size: 11px; font-weight: 600; color: rgba(255,255,255,0.6); }
.compare-a { font-size: 12px; font-weight: 700; color: #3b82f6; }
.compare-vs { font-size: 10px; color: rgba(255,255,255,0.4); }
.compare-b { font-size: 12px; font-weight: 700; color: #8b5cf6; }
.compare-close {
  padding: 6px 12px;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 4px;
  font-size: 10px; color: rgba(255,255,255,0.6);
  cursor: pointer;
  &:hover { color: #fff; border-color: rgba(255,255,255,0.2); }
}

// 4) THEO BOX - IMPROVED CONTRAST WITH CHIPS
.theo-box { display: flex; gap: 10px; margin-bottom: 16px; flex-wrap: wrap; }
.theo-chip {
  display: flex; flex-direction: column; gap: 2px;
  padding: 8px 12px;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 6px;
}
.theo-chip--adj {
  background: rgba($accent-warning, 0.08);
  border-color: rgba($accent-warning, 0.2);
}
.theo-lbl { font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; color: rgba(255,255,255,0.6); }
.theo-val { font-family: 'JetBrains Mono', monospace; font-size: 12px; font-weight: 600; color: #fff; }

// 5) LIMITED DATA
.limited-data { padding: 10px 14px; background: rgba($accent-warning,0.1); border: 1px solid rgba($accent-warning,0.3); border-radius: 6px; font-size: 12px; color: $accent-warning; margin-bottom: 16px; }

// ========================================
// TEMPI vs TEMPI TEORICI COMPARISON BOX
// ========================================
.times-comparison {
  display: flex; flex-direction: column;
  background: linear-gradient(145deg, #1a2035, #151828);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 10px;
  margin-bottom: 20px;
  overflow: hidden;
}

// Weather conditions bar
.tc-conditions {
  display: flex; gap: 24px;
  padding: 10px 20px;
  background: rgba(0,0,0,0.2);
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
.tc-cond-item { display: flex; align-items: center; gap: 6px; }
.tc-cond-icon { font-size: 14px; }
.tc-cond-lbl { font-size: 10px; font-weight: 500; color: rgba(255,255,255,0.4); text-transform: uppercase; }
.tc-cond-val { font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.8); }

// Main comparison content
.tc-main {
  display: grid; grid-template-columns: 1fr auto 1fr auto auto;
  gap: 16px; align-items: start;
  padding: 16px 20px;
}
.tc-column { display: flex; flex-direction: column; gap: 8px; }
.tc-header {
  position: relative;
  font-size: 11px; font-weight: 700;
  text-transform: uppercase; letter-spacing: 1px;
  color: rgba(255,255,255,0.6);
  margin: 0 0 4px 0;
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(255,255,255,0.08);
}
.tc-row { display: flex; align-items: center; gap: 10px; }
.tc-label { font-size: 11px; font-weight: 500; color: rgba(255,255,255,0.5); min-width: 90px; }
.tc-value { font-family: 'JetBrains Mono', monospace; font-size: 16px; font-weight: 700; color: #fff; }
.tc-dot {
  width: 12px; height: 12px; border-radius: 50%; flex-shrink: 0;
  &.dot--fast { background: $accent-success; box-shadow: 0 0 6px rgba($accent-success, 0.5); }
  &.dot--ok { background: #22c55e; }
  &.dot--margin { background: $accent-warning; }
  &.dot--far { background: #ef4444; }
  &.dot--neutral { background: rgba(255,255,255,0.2); }
}
.tc-divider {
  width: 1px;
  background: linear-gradient(180deg, transparent, rgba(255,255,255,0.15), transparent);
  margin: 0 4px;
}
.tc-delta-box {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  padding: 12px 16px;
  background: rgba(0,0,0,0.3);
  border-radius: 8px;
  gap: 4px;
  border: 1px solid rgba(255,255,255,0.05);
}
.tc-delta-label { font-size: 10px; font-weight: 600; color: rgba(255,255,255,0.5); letter-spacing: 1px; }
.tc-delta-value {
  font-family: 'JetBrains Mono', monospace; font-size: 18px; font-weight: 700;
  &.fast { color: $accent-success; text-shadow: 0 0 8px rgba($accent-success, 0.4); }
  &.ok { color: #22c55e; }
  &.margin { color: $accent-warning; }
  &.far { color: #ef4444; }
}
// Inline delta (for column layout)
.tc-delta-inline {
  font-family: 'JetBrains Mono', monospace; font-size: 14px; font-weight: 700;
  &.fast { color: $accent-success; }
  &.ok { color: #22c55e; }
  &.margin { color: $accent-warning; }
  &.far { color: #ef4444; }
  &.neutral { color: rgba(255,255,255,0.4); }
}

// ========================================
// STINT DURATION
// ========================================
.tc-duration {
  display: flex; align-items: center; gap: 10px;
  padding: 10px 20px;
  background: rgba(0,0,0,0.1);
  border-top: 1px solid rgba(255,255,255,0.04);
}
.tc-duration-icon { font-size: 14px; }
.tc-duration-label {
  font-size: 10px; font-weight: 700;
  text-transform: uppercase; letter-spacing: 1px;
  color: rgba(255,255,255,0.4);
}
.tc-duration-value {
  font-family: 'JetBrains Mono', monospace;
  font-size: 16px; font-weight: 700;
  color: #fff;
}
.tc-duration-unit {
  font-size: 10px;
  color: rgba(255,255,255,0.4);
}

// ========================================
// CONSISTENCY STATS - Simplified
// ========================================
.tc-consistency {
  display: flex; align-items: center; gap: 16px;
  padding: 12px 20px;
  background: rgba(0,0,0,0.15);
  border-top: 1px solid rgba(255,255,255,0.06);
}
.tc-cons-title {
  font-size: 10px; font-weight: 700;
  text-transform: uppercase; letter-spacing: 1px;
  color: rgba(255,255,255,0.4);
  min-width: 70px;
}
.tc-cons-simple { display: flex; align-items: center; gap: 12px; flex: 1; }
.tc-cons-number {
  font-family: 'JetBrains Mono', monospace;
  font-size: 16px; font-weight: 700; color: #fff;
}
.tc-cons-desc { font-size: 11px; color: rgba(255,255,255,0.5); }
.tc-cons-bar-wide {
  flex: 1; height: 8px; max-width: 120px;
  background: rgba(255,255,255,0.08);
  border-radius: 4px;
  overflow: hidden;
}
.tc-cons-fill {
  height: 100%; border-radius: 4px;
  transition: width 0.3s ease;
  &--target { background: linear-gradient(90deg, #3b82f6, #60a5fa); }
}
.tc-cons-pct {
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px; font-weight: 600; color: #3b82f6;
}
// Toggle switch for chart visualization
.tc-toggle {
  display: flex; align-items: center; gap: 6px;
  cursor: pointer;
  input { display: none; }
}
.tc-toggle-slider {
  width: 32px; height: 18px;
  background: rgba(255,255,255,0.1);
  border-radius: 9px;
  position: relative;
  transition: background 0.2s ease;
  &::after {
    content: '';
    position: absolute;
    width: 14px; height: 14px;
    background: rgba(255,255,255,0.5);
    border-radius: 50%;
    top: 2px; left: 2px;
    transition: all 0.2s ease;
  }
  input:checked + & {
    background: rgba(16, 185, 129, 0.4);
    &::after {
      left: 16px;
      background: #10b981;
    }
  }
}
.tc-toggle-label { font-size: 10px; color: rgba(255,255,255,0.4); }
.tc-toggles-row { display: flex; gap: 16px; align-items: center; }

// Validity section
.tc-validity {
  display: flex; align-items: center; gap: 16px;
  padding: 10px 20px;
  background: rgba(0,0,0,0.1);
  border-top: 1px solid rgba(255,255,255,0.04);
}
.tc-cons-fill--validity { background: linear-gradient(90deg, #22c55e, #4ade80); }
.tc-cons-pct--warning { color: #ef4444 !important; }
.tc-invalid-badge {
  display: flex; align-items: center; gap: 6px;
  font-size: 11px; color: #ef4444;
  padding: 4px 10px;
  background: rgba(239, 68, 68, 0.1);
  border-radius: 4px;
}
.tc-invalid-dot {
  width: 8px; height: 8px;
  background: #ef4444;
  border-radius: 50%;
}

// CHART - IMPROVED CONTRAST
.chart-section { margin-bottom: 20px; }
.chart-title { font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.7); text-transform: uppercase; letter-spacing: 0.5px; margin: 0 0 10px 0; }
.chart-wrap { height: 220px; background: rgba(0,0,0,0.25); border-radius: 8px; padding: 12px; }

// LAPS TABLE - IMPROVED CONTRAST
.laps-section { flex: 1; display: flex; flex-direction: column; min-height: 0; }
.laps-header-row { display: flex; justify-content: space-between; align-items: center; margin-bottom: 10px; gap: 12px; }
.laps-title { font-size: 12px; font-weight: 600; color: rgba(255,255,255,0.7); text-transform: uppercase; margin: 0; }

// A|B TABS
.laps-tabs { display: flex; gap: 4px; }
.lap-tab {
  padding: 6px 12px;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 4px;
  font-size: 11px; font-weight: 600;
  color: rgba(255,255,255,0.5);
  cursor: pointer;
  transition: all 0.15s;
  &:hover { color: rgba(255,255,255,0.8); }
  &--active { background: rgba(#3b82f6,0.15); border-color: rgba(#3b82f6,0.4); color: #3b82f6; }
  &:last-child.lap-tab--active { background: rgba(#8b5cf6,0.15); border-color: rgba(#8b5cf6,0.4); color: #8b5cf6; }
}

.toggle-btn { padding: 5px 10px; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1); border-radius: 4px; font-size: 10px; color: rgba(255,255,255,0.6); cursor: pointer; &:hover { color: #fff; } }
.laps-table-wrap { flex: 1; overflow-y: auto; background: rgba(0,0,0,0.25); border-radius: 8px; }
.laps-table { width: 100%; border-collapse: collapse; font-size: 11px; }
.laps-table th { padding: 10px 12px; background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.7); font-weight: 600; text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px; text-align: left; position: sticky; top: 0; }
.laps-table td { padding: 10px 12px; border-bottom: 1px solid rgba(255,255,255,0.04); color: rgba(255,255,255,0.7); }
.laps-table .time { font-family: 'JetBrains Mono', monospace; color: #fff; }
.laps-table .delta { font-family: 'JetBrains Mono', monospace; }
.laps-table .status { text-align: center; color: $accent-success; }
.laps-table tr.invalid { opacity: 0.5; .status { color: #ef4444; } }
.laps-table tr.pit { opacity: 0.6; .status { color: #6b7280; } }

// GRIP LEGEND
.grip-legend {
  display: flex; align-items: center; gap: 16px;
  margin-top: 12px; padding: 8px 12px;
  background: rgba(0,0,0,0.2);
  border-radius: 6px;
}
.grip-legend-title {
  font-size: 10px; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.5px;
  color: rgba(255,255,255,0.5);
}
.grip-legend-item { display: flex; align-items: center; gap: 6px; }
.grip-legend-dot {
  width: 10px; height: 10px;
  border-radius: 50%;
}
.grip-legend-label {
  font-size: 11px; font-weight: 500; color: rgba(255,255,255,0.8);
}
.grip-legend-laps {
  font-size: 10px; color: rgba(255,255,255,0.4);
  font-family: 'JetBrains Mono', monospace;
}

// RESPONSIVE
@media (max-width: 1000px) {
  .master-detail { grid-template-columns: 1fr; grid-template-rows: auto 1fr; }
  .master { max-height: 220px; }
  .stint-item { grid-template-columns: 32px 32px 1fr auto; }
  .stint-fuel, .stint-laps, .stint-avg { display: none; }
  .stint-header { grid-template-columns: 32px 32px 1fr auto; }
  .sh-fuel, .sh-laps, .sh-avg { display: none; }
}

// INFO ICON & POPUP
.info-icon {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: rgba(255, 255, 255, 0.35);
  cursor: pointer;
  margin-left: 6px;
  transition: color 0.2s, transform 0.2s;
  vertical-align: middle;
  
  svg {
    display: block;
  }
  
  &:hover {
    color: rgba(255, 255, 255, 0.9);
    transform: scale(1.1);
  }
}

.info-popup {
  position: absolute;
  top: 100%;
  left: 0;
  z-index: 100;
  width: 280px;
  padding: 12px 14px;
  margin-top: 8px;
  background: linear-gradient(145deg, #1e1e2a, #15151d);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
  font-size: 11px;
  font-weight: 400;
  line-height: 1.6;
  color: rgba(255, 255, 255, 0.8);
  text-transform: none;
  letter-spacing: 0;
  
  strong {
    display: block;
    margin-bottom: 6px;
    font-size: 12px;
    color: #fff;
  }
  
  b {
    color: $accent-info;
  }
  
  code {
    display: block;
    margin-top: 6px;
    padding: 6px 8px;
    background: rgba(0, 0, 0, 0.3);
    border-radius: 4px;
    font-family: 'JetBrains Mono', monospace;
    font-size: 10px;
    color: $accent-success;
  }
}

.info-popup-right {
  left: auto;
  right: 0;
}

.info-close {
  position: absolute;
  top: 8px;
  right: 10px;
  cursor: pointer;
  color: rgba(255, 255, 255, 0.4);
  font-size: 12px;
  
  &:hover {
    color: rgba(255, 255, 255, 0.8);
  }
}
</style>
