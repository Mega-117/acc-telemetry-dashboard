<script setup lang="ts">
// ============================================
// SessionDetailPage - Master / Detail Layout
// Now connected to Firebase for real data
// ============================================

import { computed, ref, onMounted, watch, nextTick } from 'vue'
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
import zoomPlugin from 'chartjs-plugin-zoom'
import { 
  useTelemetryData, 
  formatLapTime,
  formatCarName,
  formatTrackName,
  formatDateFull,
  formatTime,
  getSessionTypeLabel,
  getCarCategory,
  MAX_REASONABLE_LAP_MS,
  type FullSession,
  type StintData,
  type LapData
} from '~/composables/useTelemetryData'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import { runSessionValidation } from '~/composables/useDebugValidator'

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler, zoomPlugin)

// Get current user info for "Session A" label
const { currentUser, getUserProfile } = useFirebaseAuth()
const currentUserNickname = ref<string>('')

const props = defineProps<{ sessionId: string; externalUserId?: string }>()
const emit = defineEmits<{ back: [], 'go-to-track': [trackId: string] }>()

// Is this a shared session from another user?
const isSharedSession = computed(() => !!props.externalUserId)

const showDetailedLaps = ref(false)

// ========================================
// LAP EXCLUSION SYSTEM
// ========================================
const excludedLaps = ref<Set<number>>(new Set())
const excludedLapsB = ref<Set<number>>(new Set()) // For Stint B in compare mode
const excludedLapsCrossB = ref<Set<number>>(new Set()) // For Session B in cross-session mode
const showLapManager = ref(false)
const chartRef = ref<any>(null)

// Layout mode for Stint Stats Card (1-5 variants)
const stintLayoutMode = ref<1 | 2 | 3 | 4 | 5>(1)
// Racing style theme - fixed to gold
const racingStyle = ref<'gold'>('gold')
// Compare table style mode: A=Gold, B=DualColor, C=Neutral, D=Gold+Badge
const compareStyleMode = ref<'A' | 'B' | 'C' | 'D'>('A')

function toggleLapExclusion(lapNum: number) {
  const newSet = new Set(excludedLaps.value)
  if (newSet.has(lapNum)) {
    newSet.delete(lapNum)
  } else {
    newSet.add(lapNum)
  }
  excludedLaps.value = newSet
}

function toggleLapExclusionB(lapNum: number) {
  const newSet = new Set(excludedLapsB.value)
  if (newSet.has(lapNum)) {
    newSet.delete(lapNum)
  } else {
    newSet.add(lapNum)
  }
  excludedLapsB.value = newSet
}

// Cross-session exclusion toggle (uses lapNumber field)
function toggleLapExclusionCrossB(lapNum: number) {
  const newSet = new Set(excludedLapsCrossB.value)
  if (newSet.has(lapNum)) {
    newSet.delete(lapNum)
  } else {
    newSet.add(lapNum)
  }
  excludedLapsCrossB.value = newSet
}

function resetExcludedLaps() {
  excludedLaps.value = new Set()
}

function resetExcludedLapsB() {
  excludedLapsB.value = new Set()
}

function resetExcludedLapsCrossB() {
  excludedLapsCrossB.value = new Set()
}

function resetZoom() {
  if (chartRef.value?.chart) {
    chartRef.value.chart.resetZoom()
  }
}

function zoomIn() {
  if (chartRef.value?.chart) {
    chartRef.value.chart.zoom(1.2)
  }
}

function zoomOut() {
  if (chartRef.value?.chart) {
    chartRef.value.chart.zoom(0.8)
  }
}

// Auto-exclude first lap (outlap/warmup)
function applyWarmupExclusion() {
  const laps = selectedStintLaps.value
  if (laps.length > 0) {
    const firstLap = laps[0]?.lap
    excludedLaps.value = new Set(firstLap != null ? [firstLap] : [])
  } else {
    excludedLaps.value = new Set()
  }
}
// ========================================
// FIREBASE DATA LOADING
// ========================================
const { fetchSessionFull, loadSessions, getTheoreticalTimes, generateShareLink } = useTelemetryData()
const fullSession = ref<FullSession | null>(null)
const isLoading = ref(true)
const loadError = ref<string | null>(null)

// ========================================
// SESSION SHARING
// ========================================
const isSharing = ref(false)
const shareSuccess = ref(false)

async function shareSession() {
  if (!props.sessionId || isSharing.value) return
  
  isSharing.value = true
  shareSuccess.value = false
  
  try {
    const link = await generateShareLink(props.sessionId)
    await navigator.clipboard.writeText(link)
    shareSuccess.value = true
    console.log('[SHARE] Link copied:', link)
    
    // Reset success state after 2 seconds
    setTimeout(() => {
      shareSuccess.value = false
    }, 2000)
  } catch (e) {
    console.error('[SHARE] Error sharing session:', e)
  } finally {
    isSharing.value = false
  }
}

// Get pilot context (will be set when coach views a pilot)
const targetUserId = usePilotContext()

onMounted(async () => {
  isLoading.value = true
  loadError.value = null
  try {
    // Load current user's nickname from profile
    if (currentUser.value?.uid) {
      const profile = await getUserProfile(currentUser.value.uid)
      currentUserNickname.value = profile?.nickname || currentUser.value.displayName || 'Tu'
    }
    
    // Determine which user's data to load:
    // 1. If externalUserId prop is set (shared link), use it
    // 2. Otherwise use targetUserId (coach context) or current user
    const userIdToLoad = props.externalUserId || targetUserId.value || undefined
    
    // Load sessions first to populate trackStats (needed for theoretical times)
    // For external sessions, we skip this as we don't need stats
    if (!props.externalUserId) {
      await loadSessions(userIdToLoad)
    }
    
    const data = await fetchSessionFull(props.sessionId, userIdToLoad, !!targetUserId.value && !props.externalUserId)
    if (data) {
      fullSession.value = data
      console.log('[SESSION_DETAIL] Loaded session:', data.session_info.track, data.stints.length, 'stints', props.externalUserId ? '(SHARED)' : '')
    } else {
      loadError.value = 'Sessione non trovata'
    }
  } catch (e: any) {
    console.error('[SESSION_DETAIL] Load error:', e)
    loadError.value = e.code === 'permission-denied' 
      ? 'Sessione non condivisa o accesso negato'
      : (e.message || 'Errore caricamento')
  } finally {
    isLoading.value = false
    
    // DEV: Auto-run validation tests
    if (import.meta.env.DEV && fullSession.value) {
      // Use nextTick to ensure session computed is updated
      nextTick(() => {
        runSessionValidation(session.value, fullSession.value)
      })
    }
  }
})

// ========================================
// COMPARE MODE STATE - Checkbox-based
// ========================================
const compareModeActive = ref(false)
const compareSelection = ref<number[]>([])
const activeTableTab = ref<string>('COMPARE') // COMPARE, A-{stintNum}, B-{stintNum}

const isCompareMode = computed(() => compareModeActive.value && compareSelection.value.length === 2)
const stintA = computed(() => compareSelection.value[0] ?? selectedStintNumber.value)
const stintB = computed(() => compareSelection.value[1] ?? null)

function handleStintClick(stintNum: number) {
  if (compareModeActive.value) {
    toggleCompareSelection(stintNum)
  } else if (hasBuilderContent.value) {
    // When builder has content, row clicks are IGNORED
    // The right panel is now f(builder), not f(viewedStint)
    // User must use Reset to return to navigation mode
    return
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
    // Also clear cross-session
    crossSessionId.value = null
    crossSessionData.value = null
  }
}

// ========================================
// CROSS-SESSION COMPARE
// ========================================
const showSessionPicker = ref(false)
const crossSessionId = ref<string | null>(null)
const crossSessionData = ref<FullSession | null>(null)
const isCrossSessionMode = computed(() => crossSessionId.value !== null)

// External session (from shared link)
const crossSessionUserId = ref<string | null>(null)
const crossSessionNickname = ref<string | null>(null)
const isExternalSession = computed(() => crossSessionUserId.value !== null)

function openSessionPicker() {
  showSessionPicker.value = true
}

async function handleSessionBSelect(sessionId: string, userId?: string, nickname?: string) {
  crossSessionId.value = sessionId
  crossSessionUserId.value = userId || null
  crossSessionNickname.value = nickname || null
  showSessionPicker.value = false
  
  // Load the full session data (with optional external userId)
  const { fetchSessionFull } = useTelemetryData()
  const data = await fetchSessionFull(sessionId, userId)
  if (data) {
    crossSessionData.value = data
    console.log('[CROSS-SESSION] Loaded session B:', sessionId, userId ? `(external: ${nickname})` : '(own)', data.session_info.track)
  }
}

function clearCrossSession() {
  crossSessionId.value = null
  crossSessionData.value = null
  crossSessionUserId.value = null
  crossSessionNickname.value = null
  selectedCrossStintA.value = null
  selectedCrossStintB.value = null
  // Also clear multi-stint strategy selections
  strategyASecond.value = null
  strategyBSecond.value = null
}

// Cross-session stint selection (separate from same-session compare)
const selectedCrossStintA = ref<number | null>(null)  // Stint from Session A
const selectedCrossStintB = ref<number | null>(null)  // Stint from Session B

// Computed: stints from Session B formatted for display
const crossSessionStints = computed(() => {
  if (!crossSessionData.value) return []
  
  const stints = crossSessionData.value.stints || []
  return stints.map((stint: any) => ({
    number: stint.stint_number,
    type: stint.type === 'Qualify' ? 'Q' : stint.type === 'Race' ? 'R' : 'P',
    laps: stint.laps?.length || 0,
    best: stint.laps?.reduce((min: number | null, lap: any) => {
      if (!lap.is_valid || lap.has_pit_stop) return min
      return min === null ? lap.lap_time_ms : Math.min(min, lap.lap_time_ms)
    }, null),
    avgCleanLap: stint.avg_clean_lap
  }))
})

// Cross-session compare mode is active when both stints are selected
const isCrossSessionCompare = computed(() => 
  isCrossSessionMode.value && selectedCrossStintA.value !== null && selectedCrossStintB.value !== null
)

function handleCrossStintClickA(stintNum: number) {
  selectedCrossStintA.value = stintNum
}

function handleCrossStintClickB(stintNum: number) {
  selectedCrossStintB.value = stintNum
}

// ========================================
// STRATEGY MULTI-STINT (up to 2 consecutive stints per strategy)
// ========================================
// Second stint for Strategy A (first stint is selectedCrossStintA)
const strategyASecond = ref<number | null>(null)
// Second stint for Strategy B (first stint is selectedCrossStintB)
const strategyBSecond = ref<number | null>(null)

// Is strategy mode active (at least one strategy has 2 stints)
const isStrategyMode = computed(() => 
  strategyASecond.value !== null || strategyBSecond.value !== null
)

// Check if next consecutive stint exists for Strategy A
const canAddNextStintA = computed(() => {
  if (!selectedCrossStintA.value) return false
  if (strategyASecond.value !== null) return false  // Already has second
  const nextStint = selectedCrossStintA.value + 1
  return session.value.stints.some(s => s.number === nextStint)
})

// Check if next consecutive stint exists for Strategy B
const canAddNextStintB = computed(() => {
  if (!selectedCrossStintB.value || !crossSessionData.value) return false
  if (strategyBSecond.value !== null) return false
  const nextStint = selectedCrossStintB.value + 1
  const stints = crossSessionData.value.stints || []
  return stints.some((s: any) => s.stint_number === nextStint)
})

function addNextStintA() {
  if (!selectedCrossStintA.value || !canAddNextStintA.value) return
  strategyASecond.value = selectedCrossStintA.value + 1
}

function removeSecondStintA() {
  strategyASecond.value = null
}

function addNextStintB() {
  if (!selectedCrossStintB.value || !canAddNextStintB.value) return
  strategyBSecond.value = selectedCrossStintB.value + 1
}

function removeSecondStintB() {
  strategyBSecond.value = null
}

function clearCompare() {
  compareSelection.value = []
  compareModeActive.value = false
  activeTableTab.value = 'A'
}

// ========================================
// BUILDER PANEL - UX Refactor
// ========================================
// Viewing state (separate from selection - for row click navigation)
const viewingStintA = ref<number | null>(null)
const viewingStintB = ref<number | null>(null)

// Builder visibility: show when any content is added
const hasBuilderContent = computed(() => {
  return selectedCrossStintA.value !== null || selectedCrossStintB.value !== null
})

// Auto-compare: ready when both A and B have at least 1 stint
const isBuilderCompareReady = computed(() => {
  return selectedCrossStintA.value !== null && selectedCrossStintB.value !== null
})

// Builder same-session compare: active when builder is ready AND no cross-session is loaded
// This handles the case where user selects [+A] and [+B] within the same session
const isBuilderSameSessionCompare = computed(() => {
  return isBuilderCompareReady.value && !isCrossSessionMode.value
})

// Builder SINGLE STINT mode: when builder has exactly 1 stint (not compare mode yet)
// In this mode, right panel shows the single stint from builder, not viewedStint
const isBuilderSingleStintMode = computed(() => {
  return hasBuilderContent.value && !isBuilderCompareReady.value && !isCrossSessionMode.value
})

// Get the single stint from builder (whichever slot has it)
const builderSingleStint = computed(() => {
  if (!isBuilderSingleStintMode.value) return null
  const stintNum = selectedCrossStintA.value ?? selectedCrossStintB.value
  if (!stintNum) return null
  return session.value.stints.find(s => s.number === stintNum) || null
})

const builderSingleStintNumber = computed(() => {
  return selectedCrossStintA.value ?? selectedCrossStintB.value ?? null
})

const builderSingleStintLaps = computed(() => {
  const stintNum = builderSingleStintNumber.value
  if (!stintNum) return []
  return session.value.lapsData[stintNum] || []
})

// Builder stint data for same-session comparison (uses selectedCrossStintA/B but from same session)
const builderStintA = computed(() => {
  if (!selectedCrossStintA.value) return null
  return session.value.stints.find(s => s.number === selectedCrossStintA.value) || null
})

const builderStintB = computed(() => {
  if (!selectedCrossStintB.value) return null
  return session.value.stints.find(s => s.number === selectedCrossStintB.value) || null
})

const builderStintALaps = computed(() => {
  if (!selectedCrossStintA.value) return []
  return session.value.lapsData[selectedCrossStintA.value as keyof typeof session.value.lapsData] || []
})

const builderStintBLaps = computed(() => {
  if (!selectedCrossStintB.value) return []
  return session.value.lapsData[selectedCrossStintB.value as keyof typeof session.value.lapsData] || []
})

// Multi-stint strategy support: Array of all stints in each strategy
const strategyAStints = computed(() => {
  const stints: typeof session.value.stints = []
  if (selectedCrossStintA.value) {
    const stint1 = session.value.stints.find(s => s.number === selectedCrossStintA.value)
    if (stint1) stints.push(stint1)
  }
  if (strategyASecond.value) {
    const stint2 = session.value.stints.find(s => s.number === strategyASecond.value)
    if (stint2) stints.push(stint2)
  }
  return stints
})

const strategyBStints = computed(() => {
  const stints: typeof session.value.stints = []
  
  // Determine data source: cross-session or same-session
  const sourceStints = isCrossSessionMode.value && crossSessionData.value
    ? (crossSessionData.value.stints || []).map((s: any) => ({
        number: s.stint_number,
        type: s.type === 'Qualify' ? 'Q' : s.type === 'Race' ? 'R' : 'P',
        laps: s.laps?.length || 0,
        best: formatLapTime(s.laps?.reduce((min: number | null, lap: any) => {
          if (!lap.is_valid || lap.has_pit_stop) return min
          return min === null ? lap.lap_time_ms : Math.min(min, lap.lap_time_ms)
        }, null)),
        bestMs: s.laps?.reduce((min: number | null, lap: any) => {
          if (!lap.is_valid || lap.has_pit_stop) return min
          return min === null ? lap.lap_time_ms : Math.min(min, lap.lap_time_ms)
        }, null),
        avg: formatLapTime(s.avg_clean_lap),
        avgMs: s.avg_clean_lap,
        avgWarning: (s.laps?.filter((l: any) => l.is_valid && !l.has_pit_stop).length || 0) < 5,
        validLapsCount: s.laps?.filter((l: any) => l.is_valid && !l.has_pit_stop).length || 0,
        durationMs: s.laps?.reduce((sum: number, lap: any) => sum + (lap.lap_time_ms || 0), 0) || 0
      }))
    : session.value.stints
  
  if (selectedCrossStintB.value) {
    const stint1 = sourceStints.find((s: any) => s.number === selectedCrossStintB.value)
    if (stint1) stints.push(stint1 as any)
  }
  if (strategyBSecond.value) {
    const stint2 = sourceStints.find((s: any) => s.number === strategyBSecond.value)
    if (stint2) stints.push(stint2 as any)
  }
  return stints
})

// Max number of stints between strategies (for looping)
const maxStrategyStints = computed(() => {
  return Math.max(strategyAStints.value.length, strategyBStints.value.length)
})

// Total duration for each strategy (in ms)
const strategyATotalDurationMs = computed(() => {
  return strategyAStints.value.reduce((sum, s) => sum + (s.durationMs || 0), 0)
})

const strategyBTotalDurationMs = computed(() => {
  return strategyBStints.value.reduce((sum, s) => sum + (s.durationMs || 0), 0)
})

// Concatenated laps for all stints in Strategy A (with stint markers)
const strategyAAllLaps = computed(() => {
  const allLaps: any[] = []
  strategyAStints.value.forEach((stint, stintIdx) => {
    const stintLaps = session.value.lapsData[stint.number as keyof typeof session.value.lapsData] || []
    stintLaps.forEach((lap: any, lapIdx: number) => {
      allLaps.push({
        ...lap,
        _stintIndex: stintIdx,
        _stintNumber: stint.number,
        _isStintStart: lapIdx === 0,  // First lap of every stint
        _globalIndex: allLaps.length + 1
      })
    })
  })
  return allLaps
})

// Concatenated laps for all stints in Strategy B (with stint markers)
const strategyBAllLaps = computed(() => {
  const allLaps: any[] = []
  strategyBStints.value.forEach((stint, stintIdx) => {
    const stintLaps = session.value.lapsData[stint.number as keyof typeof session.value.lapsData] || []
    stintLaps.forEach((lap: any, lapIdx: number) => {
      allLaps.push({
        ...lap,
        _stintIndex: stintIdx,
        _stintNumber: stint.number,
        _isStintStart: lapIdx === 0,  // First lap of every stint
        _globalIndex: allLaps.length + 1
      })
    })
  })
  return allLaps
})

// Format duration from ms to compact format (e.g., 10m 40.100s)
function formatDuration(ms: number | undefined): string {
  if (!ms) return '—'
  const totalMs = ms
  const minutes = Math.floor(totalMs / 60000)
  const seconds = Math.floor((totalMs % 60000) / 1000)
  const millis = totalMs % 1000
  
  return `${minutes}m ${String(seconds).padStart(2, '0')}.${String(millis).padStart(3, '0')}s`
}

// Reset entire builder
function resetBuilder(): void {
  selectedCrossStintA.value = null
  strategyASecond.value = null
  selectedCrossStintB.value = null
  strategyBSecond.value = null
}


// Check if stint can be added to Builder A
function canAddToBuilderA(stintNum: number): boolean {
  // NEW RULE: stint cannot be in both strategies - check if already in B
  if (selectedCrossStintB.value === stintNum) return false
  if (strategyBSecond.value === stintNum) return false
  
  // Case 1: No stint selected yet in A - any can be added (if not in B)
  if (!selectedCrossStintA.value) return true
  
  // Case 2: Already in builder A
  if (selectedCrossStintA.value === stintNum) return false
  if (strategyASecond.value === stintNum) return false
  
  // Case 3: Can only add consecutive stint as second
  if (!strategyASecond.value) {
    return stintNum === selectedCrossStintA.value + 1
  }
  
  return false
}

// Check if stint can be added to Builder B
function canAddToBuilderB(stintNum: number): boolean {
  // NEW RULE: stint cannot be in both strategies - check if already in A
  if (selectedCrossStintA.value === stintNum) return false
  if (strategyASecond.value === stintNum) return false
  
  // Case 1: No stint selected yet in B - any can be added (if not in A)
  if (!selectedCrossStintB.value) return true
  
  // Case 2: Already in builder B
  if (selectedCrossStintB.value === stintNum) return false
  if (strategyBSecond.value === stintNum) return false
  
  // Case 3: Can only add consecutive stint as second
  if (!strategyBSecond.value) {
    return stintNum === selectedCrossStintB.value + 1
  }
  
  return false
}

// Get tooltip for [+A] button
function getAddToBuilderTooltipA(stintNum: number): string {
  // Check if in Strategy B first (new rule)
  if (selectedCrossStintB.value === stintNum) return 'Già in Strategia B'
  if (strategyBSecond.value === stintNum) return 'Già in Strategia B'
  
  if (!selectedCrossStintA.value) return 'Aggiungi a Strategia A'
  if (selectedCrossStintA.value === stintNum) return 'Già in Strategia A'
  if (strategyASecond.value === stintNum) return 'Già in Strategia A'
  if (!strategyASecond.value && stintNum === selectedCrossStintA.value + 1) {
    return 'Aggiungi come secondo stint'
  }
  if (strategyASecond.value) return 'Massimo 2 stint per strategia'
  return 'Solo stint consecutivo ammesso'
}

// Get tooltip for [+B] button
function getAddToBuilderTooltipB(stintNum: number): string {
  // Check if in Strategy A first (new rule)
  if (selectedCrossStintA.value === stintNum) return 'Già in Strategia A'
  if (strategyASecond.value === stintNum) return 'Già in Strategia A'
  
  if (!selectedCrossStintB.value) return 'Aggiungi a Strategia B'
  if (selectedCrossStintB.value === stintNum) return 'Già in Strategia B'
  if (strategyBSecond.value === stintNum) return 'Già in Strategia B'
  if (!strategyBSecond.value && stintNum === selectedCrossStintB.value + 1) {
    return 'Aggiungi come secondo stint'
  }
  if (strategyBSecond.value) return 'Massimo 2 stint per strategia'
  return 'Solo stint consecutivo ammesso'
}

// Add stint to Builder A
function addToBuilderA(stintNum: number): void {
  if (!selectedCrossStintA.value) {
    selectedCrossStintA.value = stintNum
    return
  }
  if (!strategyASecond.value && stintNum === selectedCrossStintA.value + 1) {
    strategyASecond.value = stintNum
  }
}

// Add stint to Builder B
function addToBuilderB(stintNum: number): void {
  if (!selectedCrossStintB.value) {
    selectedCrossStintB.value = stintNum
    return
  }
  if (!strategyBSecond.value && stintNum === selectedCrossStintB.value + 1) {
    strategyBSecond.value = stintNum
  }
}

// Cross-session specific: Check if stint from Source B can be added to Strategy A
// IMPORTANT: In cross-session mode, stints from different sessions are DIFFERENT entities
// Session A's Stint #1 != Session B's Stint #1, so no cross-conflict check needed
function canAddToBuilderACross(stintNum: number): boolean {
  // Only check against stints already in Strategy A (which come from Session A)
  // We do NOT check against selectedCrossStintB - different session = different stint
  
  // For Strategy A, we could allow Session B stints if we wanted cross-assignment
  // But typically, Session A stints go to A, Session B stints go to B
  // For now, just check if not already in Strategy A (from session B context, not blocking)
  
  // Actually, in cross-session mode, Session B stints should go to Strategy B,
  // and Session A stints should go to Strategy A. But if user wants to put
  // Session B stint into Strategy A, that's valid too.
  
  // Check if already in Strategy A (from this session - Session B)
  // Since Strategy A currently stores Session A stints, we need to allow new ones
  if (!selectedCrossStintA.value) return true
  
  // Strategy A already has a stint, can only add consecutive from same session
  // But wait - in cross-session, A comes from main session, not this one
  // Actually, for simplicity: Session B stints can always go to Strategy B, never to A
  // This maintains separation: A = main session, B = altra sessione
  return false  // Session B stints should use +B, not +A
}

// Cross-session specific: Tooltip for [+A] button on Source B stints  
function getAddToBuilderTooltipACross(stintNum: number): string {
  // In cross-session mode, Session B stints should go to Strategy B
  return 'Usa +B per stint da altra sessione'
}

// Cross-session specific: Check if stint from Source B can be added to Strategy B
// IMPORTANT: In cross-session mode, stints from different sessions are DIFFERENT entities
// even if they have the same number. So Session A's Stint #1 != Session B's Stint #1
function canAddToBuilderBCross(stintNum: number): boolean {
  // NOTE: We do NOT check against selectedCrossStintA here!
  // That's because selectedCrossStintA contains stints from Session A (main session),
  // while stintNum here is from Session B (altra sessione).
  // They are completely different stints even if numbers match.
  
  // Check if already in Strategy B (same session, so check makes sense)
  if (!selectedCrossStintB.value) return true
  if (selectedCrossStintB.value === stintNum) return false
  if (strategyBSecond.value === stintNum) return false
  
  // Can add consecutive stint as second
  if (!strategyBSecond.value) {
    return stintNum === selectedCrossStintB.value + 1
  }
  
  return false
}

// Cross-session specific: Tooltip for [+B] button on Source B stints
function getAddToBuilderTooltipBCross(stintNum: number): string {
  // NOTE: No cross-session conflict check - different sessions = different stints
  
  if (!selectedCrossStintB.value) return 'Aggiungi a Strategia B'
  if (selectedCrossStintB.value === stintNum) return 'Già in Strategia B'
  if (strategyBSecond.value === stintNum) return 'Già in Strategia B'
  if (!strategyBSecond.value && stintNum === selectedCrossStintB.value + 1) {
    return 'Aggiungi come secondo stint'
  }
  if (strategyBSecond.value) return 'Massimo 2 stint per strategia'
  return 'Solo stint consecutivo ammesso'
}

// Cross-session specific: Add stint from Source B to Strategy B
function addToBuilderBCross(stintNum: number): void {
  if (!selectedCrossStintB.value) {
    selectedCrossStintB.value = stintNum
    return
  }
  if (!strategyBSecond.value && stintNum === selectedCrossStintB.value + 1) {
    strategyBSecond.value = stintNum
  }
}

// Remove stint A1 (also clears A2)
function removeBuilderStintA1(): void {
  selectedCrossStintA.value = null
  strategyASecond.value = null
}

// Remove stint B1 (also clears B2)
function removeBuilderStintB1(): void {
  selectedCrossStintB.value = null
  strategyBSecond.value = null
}

// Check if stint is part of Builder A
function isStintInBuilderA(stintNum: number): boolean {
  return selectedCrossStintA.value === stintNum || strategyASecond.value === stintNum
}

// Check if stint is part of Builder B
function isStintInBuilderB(stintNum: number): boolean {
  return selectedCrossStintB.value === stintNum || strategyBSecond.value === stintNum
}

// View functions (navigation only, no selection change)
// Updates the detail panel when clicking on a stint row in cross-session mode
function viewStintA(stintNum: number): void {
  // Update the main detail view to show this stint's data
  selectedStintNumber.value = stintNum
}

function viewStintB(stintNum: number): void {
  // For Session B, we can't use selectedStintNumber (it's for Session A)
  // The cross-session compare view already shows both stints when both are selected
  // This click just provides visual feedback
}

// Select stint for viewing in detail panel (normal mode - no builder)
function selectStintForView(stintNum: number): void {
  selectedStintNumber.value = stintNum
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
  
  // Sanitize session_best_lap: ACC shared memory returns INT_MAX (2^31-1) when no valid laps exist
  const sessionBestLap = (info.session_best_lap && info.session_best_lap > 0 && info.session_best_lap <= MAX_REASONABLE_LAP_MS)
    ? info.session_best_lap
    : 0

  // Transform stints to expected format
  const stints = fs.stints.map(stint => {
    const validLaps = stint.laps.filter(l => l.is_valid && !l.has_pit_stop)
    const validLapsCount = validLaps.length
    const bestLapMs = validLapsCount > 0 
      ? Math.min(...validLaps.map(l => l.lap_time_ms))
      : null
    
    // Use avg_clean_lap from JSON ONLY if stint has 5+ valid laps
    // Otherwise the average is not statistically reliable
    const MIN_VALID_LAPS_FOR_AVG = 5
    const avgLapMs = validLapsCount >= MIN_VALID_LAPS_FOR_AVG && stint.avg_clean_lap 
      ? stint.avg_clean_lap 
      : null
    
    // Short warning text for display when avg is not available
    const avgWarning = validLapsCount > 0 && validLapsCount < MIN_VALID_LAPS_FOR_AVG
    const avgDisplay = avgLapMs 
      ? formatLapTime(avgLapMs) 
      : (avgWarning
          ? 'min 5 giri' 
          : '—')
    
    return {
      number: stint.stint_number,
      type: stint.type === 'Qualify' ? 'Q' : 'R',
      intent: stint.type === 'Qualify' ? 'Qualy Push' : 'Race Pace',
      fuelStart: stint.fuel_start,
      laps: stint.laps.length,
      validLapsCount, // NEW: track valid laps count for filtering
      best: bestLapMs ? formatLapTime(bestLapMs) : '—',
      bestMs: bestLapMs, // Keep raw ms for delta calculations
      avg: avgDisplay,
      avgWarning, // NEW: flag for template to style warning differently
      avgMs: avgLapMs, // Keep raw ms for calculations
      durationMs: stint.stint_drive_time_ms || 0, // Use pre-calculated duration from JSON
      theoretical: formatLapTime(sessionBestLap), // Simplified: use session best as theo
      deltaVsTheo: bestLapMs && sessionBestLap ? `+${((bestLapMs - sessionBestLap) / 1000).toFixed(3)}` : '-',
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
      lap_time_ms: lap.lap_time_ms,
      delta: sessionBestLap ? `+${((lap.lap_time_ms - sessionBestLap) / 1000).toFixed(3)}` : '-',
      valid: lap.is_valid,
      pit: lap.has_pit_stop,
      sectors: lap.sector_times_ms?.map(s => (s / 1000).toFixed(3)) || ['-', '-', '-'],
      sector_times_ms: lap.sector_times_ms || [],
      fuel: Math.round(lap.fuel_remaining),
      airTemp: lap.air_temp || 0,
      weather: lap.rain_intensity || 'No Rain',
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
    theoQualy: formatLapTime(sessionBestLap),
    theoRace: formatLapTime(sessionBestLap),
    bestDeltaQ: { 
      value: bestQualyMs && sessionBestLap ? `+${((bestQualyMs - sessionBestLap) / 1000).toFixed(3)}` : '-', 
      stintNum: bestQualyStintNum 
    },
    bestDeltaR: { 
      value: bestRaceMs && sessionBestLap ? `+${((bestRaceMs - sessionBestLap) / 1000).toFixed(3)}` : '-', 
      stintNum: bestRaceStintNum 
    },
    stints,
    lapsData
  }
})

// ========================================
// THEORETICAL TIMES - Using centralized getTheoreticalTimes with temp adjustment
// ========================================
type TheoreticalTimesData = {
  theoQualy: number | null
  theoRace: number | null
  theoAvgRace: number | null
  dominantGrip: string
  stintTemp: number
  historicQualy: number | null
  historicQualyTemp: number | null
  historicRace: number | null
  historicRaceTemp: number | null
  historicAvgRace: number | null
  historicAvgRaceTemp: number | null
}

const theoreticalTimes = ref<TheoreticalTimesData>({
  theoQualy: null, theoRace: null, theoAvgRace: null,
  dominantGrip: 'Optimum', stintTemp: 23,
  historicQualy: null, historicQualyTemp: null,
  historicRace: null, historicRaceTemp: null,
  historicAvgRace: null, historicAvgRaceTemp: null
})
// NOTE: Watch for theo recalculation is defined AFTER stintConditions (around line 550)

// ========================================
// SMART PRESELECTION - Best stint (R priority, then Q)
// ========================================
const selectedStintNumber = ref(1)
const hasPreselected = ref(false)
// NOTE: Watch is defined after bestRaceStint/bestQualyStint computeds

const selectedStint = computed(() => session.value.stints.find(s => s.number === selectedStintNumber.value))
const selectedStintLaps = computed(() => session.value.lapsData[selectedStintNumber.value] || [])

// DISPLAYED STINT: the stint shown in the right panel (single stint mode)
// Rule: if builder has content → use builder's stint, else use viewedStint
const displayedStint = computed(() => {
  if (isBuilderSingleStintMode.value) {
    return builderSingleStint.value
  }
  return selectedStint.value
})

const displayedStintNumber = computed(() => {
  if (isBuilderSingleStintMode.value) {
    return builderSingleStintNumber.value
  }
  return selectedStintNumber.value
})

const displayedStintLaps = computed(() => {
  if (isBuilderSingleStintMode.value) {
    return builderSingleStintLaps.value
  }
  return selectedStintLaps.value
})

const isLimitedData = computed(() => displayedStintLaps.value.length <= 1)
const isSingleStint = computed(() => session.value.stints.length === 1)

// Auto-apply warmup exclusion when stint changes — always exclude first lap
watch(selectedStintLaps, (laps) => {
  if (laps.length > 0) {
    const firstLap = laps[0]?.lap
    excludedLaps.value = new Set(firstLap != null ? [firstLap] : [])
  } else {
    excludedLaps.value = new Set()
  }
}, { immediate: true })

// Compare mode stint data (same-session)
const compareStintA = computed(() => stintA.value ? session.value.stints.find(s => s.number === stintA.value) : null)
const compareStintB = computed(() => stintB.value ? session.value.stints.find(s => s.number === stintB.value) : null)
const compareStintALaps = computed(() => stintA.value ? (session.value.lapsData[stintA.value as keyof typeof session.value.lapsData] || []) : [])
const compareStintBLaps = computed(() => stintB.value ? (session.value.lapsData[stintB.value as keyof typeof session.value.lapsData] || []) : [])

// CROSS-SESSION compare stint data
const crossStintA = computed(() => {
  if (!selectedCrossStintA.value) return null
  const stint = session.value.stints.find(s => s.number === selectedCrossStintA.value)
  if (!stint) return null
  
  // Return with unified structure (avgCleanLap = avg for consistency)
  return {
    ...stint,
    avgCleanLap: stint.avg  // Map avg to avgCleanLap for consistency with crossStintB
  }
})

const crossStintB = computed(() => {
  if (!selectedCrossStintB.value || !crossSessionData.value) return null
  const stints = crossSessionData.value.stints || []
  const raw = stints.find((s: any) => s.stint_number === selectedCrossStintB.value)
  if (!raw) return null
  
  // Format to match session.stints structure
  return {
    number: raw.stint_number,
    type: raw.type === 'Qualify' ? 'Q' : raw.type === 'Race' ? 'R' : 'P',
    laps: raw.laps?.length || 0,
    best: formatLapTime(raw.laps?.reduce((min: number | null, lap: any) => {
      if (!lap.is_valid || lap.has_pit_stop) return min
      return min === null ? lap.lap_time_ms : Math.min(min, lap.lap_time_ms)
    }, null)),
    avgCleanLap: formatLapTime(raw.avg_clean_lap),
    deltaVsTheo: '—'
  }
})

const crossStintALaps = computed(() => {
  if (!selectedCrossStintA.value) return []
  return session.value.lapsData[selectedCrossStintA.value as keyof typeof session.value.lapsData] || []
})

const crossStintBLaps = computed(() => {
  if (!selectedCrossStintB.value || !crossSessionData.value) return []
  const stints = crossSessionData.value.stints || []
  const stintData = stints.find((s: any) => s.stint_number === selectedCrossStintB.value)
  if (!stintData || !stintData.laps) return []
  
  // Format laps to match session.lapsData structure
  return stintData.laps.map((lap: any, idx: number) => ({
    lapNumber: lap.lap_number || idx + 1,
    lapTime: formatLapTime(lap.lap_time_ms),
    lapTimeMs: lap.lap_time_ms,
    valid: lap.is_valid && !lap.has_pit_stop,
    pit: lap.has_pit_stop,
    s1: formatLapTime(lap.sector_times_ms?.[0]),
    s2: formatLapTime(lap.sector_times_ms?.[1]),
    s3: formatLapTime(lap.sector_times_ms?.[2]),
    fuel: lap.fuel_remaining,
    air: lap.air_temp,
    road: lap.road_temp,
    grip: lap.track_grip_status
  }))
})

// Current tab laps for table (in compare mode)
const currentTabLaps = computed(() => activeTableTab.value === 'A' ? compareStintALaps.value : compareStintBLaps.value)
const currentTabStint = computed(() => activeTableTab.value === 'A' ? compareStintA.value : compareStintB.value)

// Cross-session tab laps for table
const currentCrossTabLaps = computed(() => activeTableTab.value === 'A' ? crossStintALaps.value : crossStintBLaps.value)
const currentCrossTabStint = computed(() => activeTableTab.value === 'A' ? crossStintA.value : crossStintB.value)

// Get laps for individual stint tabs (handles A-{num} and B-{num} format)
function getLapsForTable() {
  const tab = activeTableTab.value
  
  // Parse tab format: 'A-1', 'A-2', 'B-1', 'B-2', etc.
  if (tab.startsWith('A-')) {
    const stintNum = parseInt(tab.slice(2))
    if (!isNaN(stintNum)) {
      return session.value.lapsData[stintNum] || []
    }
  } else if (tab.startsWith('B-')) {
    const stintNum = parseInt(tab.slice(2))
    if (!isNaN(stintNum)) {
      // For same-session compare, B stints are also from current session
      if (isBuilderSameSessionCompare.value) {
        return session.value.lapsData[stintNum] || []
      }
      // For cross-session compare, B stints are from crossSessionData
      if (isCrossSessionCompare.value && crossSessionData.value) {
        const stints = crossSessionData.value.stints || []
        const stintData = stints.find((s: any) => s.stint_number === stintNum)
        if (stintData?.laps) {
          return stintData.laps.map((lap: any, idx: number) => ({
            lapNumber: lap.lap_number || idx + 1,
            lapTime: formatLapTime(lap.lap_time_ms),
            lapTimeMs: lap.lap_time_ms,
            valid: lap.is_valid && !lap.has_pit_stop,
            pit: lap.has_pit_stop,
            s1: formatLapTime(lap.sector_times_ms?.[0]),
            s2: formatLapTime(lap.sector_times_ms?.[1]),
            s3: formatLapTime(lap.sector_times_ms?.[2]),
            fuel: lap.fuel_remaining,
            air: lap.air_temp,
            road: lap.road_temp,
            grip: lap.track_grip_status
          }))
        }
      }
      return session.value.lapsData[stintNum] || []
    }
  }
  
  // Fallback: selected stint laps
  return selectedStintLaps.value
}

// ========================================
// BEST SECTORS & BEST LAP HIGHLIGHTING
// ========================================
// Computes best S1, S2, S3 and best lap time for the currently displayed laps.
// Uses raw ms values for accurate comparison.
const bestSectors = computed(() => {
  const laps = getLapsForTable()
  let bestS1 = Infinity
  let bestS2 = Infinity
  let bestS3 = Infinity
  let bestLapMs = Infinity

  for (const lap of laps) {
    // Solo giri validi e non-pit contano per best sectors e best lap
    if (!lap.valid || lap.pit) continue
    const sms = lap.sector_times_ms || []
    if (sms[0] && sms[0] > 0 && sms[0] < bestS1) bestS1 = sms[0]
    if (sms[1] && sms[1] > 0 && sms[1] < bestS2) bestS2 = sms[1]
    if (sms[2] && sms[2] > 0 && sms[2] < bestS3) bestS3 = sms[2]
    const ms = lap.lap_time_ms || lap.lapTimeMs
    if (ms && ms > 0 && ms < bestLapMs) {
      bestLapMs = ms
    }
  }

  return {
    s1: bestS1 === Infinity ? null : bestS1,
    s2: bestS2 === Infinity ? null : bestS2,
    s3: bestS3 === Infinity ? null : bestS3,
    lapMs: bestLapMs === Infinity ? null : bestLapMs,
  }
})

function isBestSector(lap: any, sectorIndex: number): boolean {
  const sms = lap.sector_times_ms || []
  const val = sms[sectorIndex]
  if (!val || val <= 0) return false
  const best = [bestSectors.value.s1, bestSectors.value.s2, bestSectors.value.s3][sectorIndex]
  return best !== null && val === best
}

function isBestLap(lap: any): boolean {
  const ms = lap.lap_time_ms || lap.lapTimeMs
  return bestSectors.value.lapMs !== null && ms === bestSectors.value.lapMs
}

// ========================================
// SIDE-BY-SIDE COMPARISON DATA
// ========================================
// Get aligned lap data for comparison view (A vs B side by side)
const comparisonLapsData = computed(() => {
  let lapsA: any[] = []
  let lapsB: any[] = []
  
  if (isBuilderSameSessionCompare.value) {
    // Same-session builder compare - use ALL laps from strategy (multi-stint)
    lapsA = strategyAAllLaps.value || []
    lapsB = strategyBAllLaps.value || []
  } else if (isCrossSessionCompare.value) {
    // Cross-session compare
    lapsA = crossStintALaps.value || []
    lapsB = crossStintBLaps.value || []
  } else if (isCompareMode.value) {
    // Regular compare mode
    lapsA = compareStintALaps.value || []
    lapsB = compareStintBLaps.value || []
  }
  
  const maxLaps = Math.max(lapsA.length, lapsB.length)
  const rows = []
  
  for (let i = 0; i < maxLaps; i++) {
    const lapA = lapsA[i] || null
    const lapB = lapsB[i] || null
    
    // Calculate delta between A and B lap times
    let delta = null
    if (lapA && lapB) {
      const timeA = timeToSeconds(lapA.time || lapA.lapTime || '')
      const timeB = timeToSeconds(lapB.time || lapB.lapTime || '')
      if (timeA > 0 && timeB > 0) {
        delta = timeA - timeB // Positive = A slower, Negative = A faster
      }
    }
    
    rows.push({
      index: i + 1,
      lapA,
      lapB,
      delta,
      deltaFormatted: delta !== null ? (delta >= 0 ? `+${delta.toFixed(3)}` : delta.toFixed(3)) : '—',
      deltaClass: delta !== null ? (delta < 0 ? 'faster' : delta <= 0.3 ? 'close' : delta <= 0.5 ? 'margin' : 'far') : 'neutral',
      // Stint separation markers (for visual headers in table)
      _isStintStartA: lapA?._isStintStart || false,
      _isStintStartB: lapB?._isStintStart || false,
      _stintNumberA: lapA?._stintNumber || null,
      _stintNumberB: lapB?._stintNumber || null
    })
  }
  
  return rows
})

// ========================================
// STRATEGY MULTI-STINT DATA (for A2 and B2)
// ========================================
// Second stint for Strategy A (from current session)
const crossStintA2 = computed(() => {
  if (!strategyASecond.value) return null
  const stint = session.value.stints.find(s => s.number === strategyASecond.value)
  if (!stint) return null
  return { ...stint, avgCleanLap: stint.avg }
})

const crossStintA2Laps = computed(() => {
  if (!strategyASecond.value) return []
  return session.value.lapsData[strategyASecond.value as keyof typeof session.value.lapsData] || []
})

// Second stint for Strategy B (from cross session)
const crossStintB2 = computed(() => {
  if (!strategyBSecond.value || !crossSessionData.value) return null
  const stints = crossSessionData.value.stints || []
  const raw = stints.find((s: any) => s.stint_number === strategyBSecond.value)
  if (!raw) return null
  return {
    number: raw.stint_number,
    type: raw.type === 'Qualify' ? 'Q' : raw.type === 'Race' ? 'R' : 'P',
    laps: raw.laps?.length || 0,
    best: formatLapTime(raw.laps?.reduce((min: number | null, lap: any) => {
      if (!lap.is_valid || lap.has_pit_stop) return min
      return min === null ? lap.lap_time_ms : Math.min(min, lap.lap_time_ms)
    }, null)),
    avgCleanLap: formatLapTime(raw.avg_clean_lap),
    durationMs: raw.laps?.reduce((sum: number, lap: any) => sum + (lap.lap_time_ms || 0), 0) || 0
  }
})

const crossStintB2Laps = computed(() => {
  if (!strategyBSecond.value || !crossSessionData.value) return []
  const stints = crossSessionData.value.stints || []
  const stintData = stints.find((s: any) => s.stint_number === strategyBSecond.value)
  if (!stintData || !stintData.laps) return []
  return stintData.laps.map((lap: any, idx: number) => ({
    lapNumber: lap.lap_number || idx + 1,
    lapTime: formatLapTime(lap.lap_time_ms),
    lapTimeMs: lap.lap_time_ms,
    valid: lap.is_valid && !lap.has_pit_stop,
    pit: lap.has_pit_stop,
    s1: formatLapTime(lap.sector_times_ms?.[0]),
    s2: formatLapTime(lap.sector_times_ms?.[1]),
    s3: formatLapTime(lap.sector_times_ms?.[2]),
    fuel: lap.fuel_remaining,
    air: lap.air_temp,
    grip: lap.track_grip_status
  }))
})

// Strategy total durations (sum of both stints)
const strategyATotalDuration = computed(() => {
  let total = 0
  if (crossStintA.value) {
    const duration1 = getStintDurationMinutes(crossStintA.value) || getCrossStintDurationMinutes(crossStintALaps.value)
    total += duration1
  }
  if (crossStintA2.value) {
    const duration2 = getStintDurationMinutes(crossStintA2.value) || getCrossStintDurationMinutes(crossStintA2Laps.value)
    total += duration2
  }
  return total
})

const strategyBTotalDuration = computed(() => {
  let total = 0
  if (crossStintB.value) {
    total += getCrossStintDurationMinutes(crossStintBLaps.value)
  }
  if (crossStintB2.value) {
    total += getCrossStintDurationMinutes(crossStintB2Laps.value)
  }
  return total
})

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

// Watch bestRaceStint and bestQualyStint for reliable preselection
// These computeds are stable and contain the correct best stint data
watch([bestRaceStint, bestQualyStint], ([rBest, qBest]) => {
  // Only preselect once when data first loads
  if (hasPreselected.value) return
  
  // Priority: Race stint, then Qualy stint
  if (rBest) {
    selectedStintNumber.value = rBest.number
    hasPreselected.value = true
    console.log('[PRESELECTION] Best R stint:', rBest.number, 'delta:', rBest.deltaVsTheo)
  } else if (qBest) {
    selectedStintNumber.value = qBest.number
    hasPreselected.value = true
    console.log('[PRESELECTION] Best Q stint:', qBest.number, 'delta:', qBest.deltaVsTheo)
  }
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

function getBarColor(pct: number): string {
  if (pct < 35) return '#ef4444'      // Red
  if (pct < 75) return '#f97316'       // Orange
  return '#10b981'                     // Green
}

// Dynamic gradient color based on percentage (0-100)
// 0-30%: Red to Orange, 30-70%: Orange to Yellow, 70-100%: Yellow to Green
function getGradientColor(pct: number): string {
  if (pct <= 30) {
    // Red to Orange (0-30%)
    const t = pct / 30
    const r = 239
    const g = Math.round(68 + (115 - 68) * t)  // 68 to 115
    const b = Math.round(68 + (22 - 68) * t)   // 68 to 22
    return `rgb(${r}, ${g}, ${b})`
  } else if (pct <= 70) {
    // Orange to Warm Yellow (30-70%)
    const t = (pct - 30) / 40
    const r = Math.round(249 + (251 - 249) * t)  // 249 to 251
    const g = Math.round(115 + (191 - 115) * t)  // 115 to 191 (#fbbf24)
    const b = Math.round(22 + (36 - 22) * t)     // 22 to 36
    return `rgb(${r}, ${g}, ${b})`
  } else {
    // Warm Yellow to Green (70-100%)
    const t = (pct - 70) / 30
    const r = Math.round(251 + (16 - 251) * t)   // 251 to 16
    const g = Math.round(191 + (185 - 191) * t)  // 191 to 185
    const b = Math.round(36 + (129 - 36) * t)    // 36 to 129
    return `rgb(${r}, ${g}, ${b})`
  }
}

// ========================================
// COMPARE MODE HELPER FUNCTIONS
// ========================================
function getStintTempDisplay(laps: any[]): number {
  // Support both field names: airTemp (session.lapsData) and air (crossStintBLaps)
  const validLaps = laps.filter(l => !l.pit && (l.airTemp || l.air))
  if (validLaps.length === 0) return 0
  const sum = validLaps.reduce((acc, l) => acc + (l.airTemp || l.air || 0), 0)
  return Math.round(sum / validLaps.length)
}

function getStintGripDisplay(laps: any[]): string {
  const validLaps = laps.filter(l => !l.pit && l.grip && l.grip !== 'Unknown')
  if (validLaps.length === 0) return 'Optimum'
  
  // Count grip occurrences
  const gripCounts: Record<string, number> = {}
  for (const lap of validLaps) {
    let grip = lap.grip === 'Opt' ? 'Optimum' : lap.grip
    gripCounts[grip] = (gripCounts[grip] || 0) + 1
  }
  
  // Return the dominant grip
  let dominant = 'Optimum'
  let maxCount = 0
  for (const [grip, count] of Object.entries(gripCounts)) {
    if (count > maxCount) {
      maxCount = count
      dominant = grip
    }
  }
  return dominant
}

function getStintDurationMinutes(stint: any): number {
  if (!stint?.durationMs) return 0
  return Math.floor(stint.durationMs / 60000)
}

// Precise duration format: "mm:ss.ms" (e.g., "51:34.765")
function getStintDurationPrecise(stint: any): string {
  if (!stint?.durationMs) return '0:00.000'
  return formatDurationMs(stint.durationMs)
}

// Calculate duration from laps array (for cross-session where durationMs might not be available)
function getCrossStintDurationMinutes(laps: any[]): number {
  if (!laps || laps.length === 0) return 0
  // Sum all lap times in ms
  const totalMs = laps.reduce((sum, lap) => sum + (lap.lapTimeMs || 0), 0)
  return Math.round(totalMs / 60000)
}

// Precise duration from laps: "mm:ss.ms"
function getCrossStintDurationPrecise(laps: any[]): string {
  if (!laps || laps.length === 0) return '0:00.000'
  const totalMs = laps.reduce((sum, lap) => sum + (lap.lapTimeMs || 0), 0)
  return formatDurationMs(totalMs)
}

// Helper: format milliseconds to "mm:ss.ms" or "h:mm:ss.ms"
function formatDurationMs(totalMs: number): string {
  const totalSeconds = totalMs / 1000
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = Math.floor(totalSeconds % 60)
  const milliseconds = Math.round(totalMs % 1000)
  
  if (hours > 0) {
    return `${hours}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`
  }
  return `${minutes}:${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}`
}

// Format sector time with full milliseconds precision (29.543 instead of 29.5)
function formatSectorTime(sectorTime: string | number | null | undefined): string {
  if (!sectorTime) return '—'
  
  // If it's already a string
  if (typeof sectorTime === 'string') {
    const strTime = sectorTime as string
    // Check if it already has 3 decimal places
    const parts = strTime.split('.')
    if (parts.length === 2 && parts[1]) {
      const decimals = parts[1].padEnd(3, '0').slice(0, 3)
      return `${parts[0]}.${decimals}`
    }
    return strTime
  }
  
  // If it's a number (milliseconds or seconds)
  if (typeof sectorTime === 'number') {
    // If > 1000, assume milliseconds and convert to seconds
    const secs = sectorTime > 1000 ? sectorTime / 1000 : sectorTime
    return secs.toFixed(3)
  }
  
  return '—'
}

// Format compare delta between two times (ms)
// Positive = B is slower than A, Negative = B is faster than A
function formatCompareDelta(aMs: number | undefined, bMs: number | undefined): string {
  if (!aMs || !bMs) return '—'
  const deltaMs = aMs - bMs
  const deltaSec = deltaMs / 1000
  if (deltaSec === 0) return '0.000'
  const sign = deltaSec > 0 ? '+' : ''
  return `${sign}${deltaSec.toFixed(3)}`
}

// Get delta class for coloring (A vs B)
function getCompareDeltaClass(aMs: number | undefined, bMs: number | undefined): string {
  if (!aMs || !bMs) return 'far'
  const deltaMs = aMs - bMs
  const deltaSec = deltaMs / 1000
  
  if (deltaSec < 0) return 'faster'     // A is faster (green)
  if (deltaSec === 0) return 'ontarget'
  if (deltaSec <= 0.3) return 'close'   // A is slightly slower (yellow)
  if (deltaSec <= 0.5) return 'margin'  // A is moderately slower (orange)
  return 'far'                          // A is much slower (red)
}

// CROSS-SESSION delta functions
function getCrossCompareDelta(metric: 'best' | 'avg'): string {
  const stintA = crossStintA.value
  const stintB = crossStintB.value
  if (!stintA || !stintB) return '—'
  
  // Parse lap time strings back to ms for delta calculation
  const timeA = metric === 'best' ? stintA.best : stintA.avgCleanLap
  const timeB = metric === 'best' ? stintB.best : stintB.avgCleanLap
  
  const msA = parseLapTimeToMs(timeA)
  const msB = parseLapTimeToMs(timeB)
  
  if (!msA || !msB) return '—'
  
  const deltaMs = msA - msB
  const deltaSec = deltaMs / 1000
  if (deltaSec === 0) return '0.000'
  const sign = deltaSec > 0 ? '+' : ''
  return `${sign}${deltaSec.toFixed(3)}`
}

function getCrossCompareDeltaClass(metric: 'best' | 'avg'): string {
  const stintA = crossStintA.value
  const stintB = crossStintB.value
  if (!stintA || !stintB) return 'far'
  
  const timeA = metric === 'best' ? stintA.best : stintA.avgCleanLap
  const timeB = metric === 'best' ? stintB.best : stintB.avgCleanLap
  
  const msA = parseLapTimeToMs(timeA)
  const msB = parseLapTimeToMs(timeB)
  
  if (!msA || !msB) return 'far'
  
  const deltaSec = (msA - msB) / 1000
  
  if (deltaSec < 0) return 'faster'
  if (deltaSec === 0) return 'ontarget'
  if (deltaSec <= 0.3) return 'close'
  if (deltaSec <= 0.5) return 'margin'
  return 'far'
}

// Helper to parse "M:SS.mmm" to ms
function parseLapTimeToMs(timeStr: string | undefined): number | null {
  if (!timeStr || timeStr === '—:—.---' || timeStr === '—') return null
  const match = timeStr.match(/^(\d+):(\d+)\.(\d+)$/)
  if (!match || !match[1] || !match[2] || !match[3]) return null
  const mins = match[1]
  const secs = match[2]
  const ms = match[3]
  return parseInt(mins) * 60000 + parseInt(secs) * 1000 + parseInt(ms)
}

// STINT CONDITIONS - Temp, Grip evolution with percentages
// ========================================
const stintConditions = computed(() => {
  const laps = selectedStintLaps.value.filter(l => !l.pit)
  if (laps.length === 0) {
    return {
      airTemp: { start: 0, mid: 0, end: 0, changed: false },
      grip: { dominant: 'Optimum', percentages: [], changed: false, display: 'Optimum' }
    }
  }
  
  const midIndex = Math.floor(laps.length / 2)
  const endIndex = laps.length - 1
  
  // Air Temperature (rounded to integers)
  const tempStart = Math.round(laps[0]?.airTemp || 0)
  const tempMid = Math.round(laps[midIndex]?.airTemp || tempStart)
  const tempEnd = Math.round(laps[endIndex]?.airTemp || tempStart)
  const tempChanged = Math.abs(tempStart - tempEnd) >= 2 || Math.abs(tempStart - tempMid) >= 2
  
  // Grip - count occurrences, filter Unknown, track first occurrence order
  const gripCounts: Record<string, number> = {}
  const gripOrder: string[] = []  // Track order of first occurrence
  let validGripLaps = 0
  
  // Normalize grip values (handle abbreviations)
  const normalizeGrip = (grip: string) => {
    if (grip === 'Opt') return 'Optimum'
    return grip
  }
  
  for (const lap of laps) {
    let grip = lap.grip || 'Unknown'
    grip = normalizeGrip(grip)
    
    if (grip !== 'Unknown') {
      if (!gripCounts[grip]) {
        gripOrder.push(grip)  // Add to order on first occurrence
      }
      gripCounts[grip] = (gripCounts[grip] || 0) + 1
      validGripLaps++
    }
  }
  
  // Calculate percentages and find dominant
  const percentages: { grip: string; pct: number }[] = []
  let dominant = 'Optimum'  // Default fallback
  let maxCount = 0
  
  for (const grip of gripOrder) {  // Iterate in first-occurrence order
    const count = gripCounts[grip] || 0
    if (count === 0) continue
    const pct = Math.round((count / validGripLaps) * 100)
    percentages.push({ grip, pct })
    if (count > maxCount) {
      maxCount = count
      dominant = grip
    }
  }
  
  // Build display string (already in chronological order)
  const changed = percentages.length > 1
  let display = dominant
  if (changed) {
    display = percentages.map(p => `${p.grip} (${p.pct}%)`).join(' → ')
  }
  
  // Calculate average temperature for the stint
  const avgTemp = tempChanged 
    ? Math.round((tempStart + tempMid + tempEnd) / 3)
    : tempStart
  
  return {
    airTemp: { start: tempStart, mid: tempMid, end: tempEnd, changed: tempChanged, avg: avgTemp },
    grip: { dominant, percentages, changed, display }
  }
})

// ========================================
// THEORETICAL TIMES WATCHER - Recalculate when stint/session changes
// ========================================
watch(
  [() => fullSession.value, () => stintConditions.value],
  async ([fs, conditions]) => {
    if (!fs) return
    
    const info = fs.session_info
    const trackId = (info.track || '').toLowerCase().replace(/[^a-z0-9]/g, '_')
    const dominantGrip = conditions.grip.dominant || 'Optimum'
    const stintTemp = conditions.airTemp.avg || Math.round(info.start_air_temp || 23)
    
    // Get car category from session
    const carCategory = getCarCategory(info.car || '')
    
    // Use centralized getTheoreticalTimes with temp adjustment and category
    const theo = await getTheoreticalTimes(
      trackId,
      dominantGrip,
      stintTemp,
      carCategory,
      targetUserId.value || undefined
    )
    
    theoreticalTimes.value = {
      theoQualy: theo.theoQualy,
      theoRace: theo.theoRace,
      theoAvgRace: theo.theoAvgRace,
      dominantGrip,
      stintTemp,
      historicQualy: theo.historicQualy,
      historicQualyTemp: theo.historicQualyTemp,
      historicRace: theo.historicRace,
      historicRaceTemp: theo.historicRaceTemp,
      historicAvgRace: theo.historicAvgRace,
      historicAvgRaceTemp: theo.historicAvgRaceTemp
    }
  },
  { immediate: true }
)

// ========================================
// CHART - supports Compare Mode + Target Zone + Lap Exclusion
// ========================================
// Centralized target threshold constant (0.6s = 6 decimi)
const TARGET_THRESHOLD_S = 0.6

const chartData = computed(() => {
  // Use compare stint data when in compare mode, cross-session data, or selected stint
  let allLapsA: any[] = []
  
  if (isBuilderSameSessionCompare.value) {
    // Same-session builder compare - use concatenated laps from strategyAAllLaps
    allLapsA = strategyAAllLaps.value.map((lap, idx) => ({
      ...lap,
      lap: idx + 1  // Continuous numbering for chart X-axis
    }))
  } else if (isCrossSessionCompare.value) {
    allLapsA = crossStintALaps.value
    // If in strategy mode, concatenate second stint laps
    if (isStrategyMode.value && strategyASecond.value) {
      const a2Laps = crossStintA2Laps.value
      const a1Length = allLapsA.length
      const concatenatedA2 = a2Laps.map((lap, idx) => ({
        ...lap,
        lap: a1Length + idx + 1,
        _originalLap: lap.lap,
        _isSecondStint: true
      }))
      allLapsA = [...allLapsA, ...concatenatedA2]
    }
  } else if (isCompareMode.value) {
    allLapsA = compareStintALaps.value
  } else {
    allLapsA = selectedStintLaps.value
  }
  
  // Filter out excluded laps
  const lapsA = allLapsA.filter(l => !excludedLaps.value.has(l.lap))
  const stintData = isCrossSessionCompare.value 
    ? crossStintA.value 
    : isCompareMode.value 
      ? compareStintA.value 
      : selectedStint.value
  const isQualy = stintData?.type === 'Q'
  
  // Get theoretical from computed (with temp adjustment)
  const theoMs = isQualy ? theoreticalTimes.value.theoQualy : theoreticalTimes.value.theoRace
  const theoSecA = theoMs ? theoMs / 1000 : 0
  
  // Target Zone = Theoretical + TARGET_THRESHOLD_S
  const targetLine = theoSecA > 0 ? theoSecA + TARGET_THRESHOLD_S : 0
  
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
      label: isBuilderSameSessionCompare.value 
        ? `Strategia A (${strategyAStints.value.map(s => `#${s.number}`).join('+')})` 
        : isCompareMode.value 
          ? `A: Stint #${stintA.value}` 
          : 'Tempo',
      data: lapsA.map(l => timeToSeconds(l.time)),
      borderColor: '#3b82f6',
      backgroundColor: 'rgba(59,130,246,0.1)',
      pointBackgroundColor: pointBackgroundColors,
      pointBorderColor: pointBorderColors,
      pointBorderWidth: pointBorderWidths,
      pointRadius: 5,
      tension: 0,
      order: 1,
      // Segment coloring for multi-stint strategies
      segment: isBuilderSameSessionCompare.value ? {
        borderColor: (ctx: any) => {
          const lap = lapsA[ctx.p1DataIndex]
          // Use lighter blue for 2nd stint
          return lap?._stintIndex > 0 ? '#60a5fa' : '#3b82f6'
        }
      } : undefined
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
  const isRace = !isQualy
  if (isRace && showTargetZone.value && lapsA.length > 0) {
    datasets.push({
      label: `Target (+${TARGET_THRESHOLD_S}s)`,
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
  
  // Add Strategy B line if in BUILDER SAME-SESSION compare mode
  // Calculate lapsB FIRST so we can determine max lap count for labels
  let lapsBForChart: any[] = []
  if (isBuilderSameSessionCompare.value && strategyBAllLaps.value.length > 0) {
    const allLapsB = strategyBAllLaps.value.map((lap, idx) => ({
      ...lap,
      lap: idx + 1  // Continuous numbering
    }))
    // Filter out excluded laps for Strategy B
    lapsBForChart = allLapsB.filter(l => !excludedLapsB.value.has(l.lap))
    const stintLabels = strategyBStints.value.map(s => `#${s.number}`).join('+')
    
    // Generate segment colors for multi-stint (different shade for each stint)
    const segmentColors = lapsBForChart.map(l => {
      if (l.pit) return '#6b7280'
      if (!l.valid) return '#ef4444'
      // Use lighter purple for 2nd stint
      return l._stintIndex > 0 ? '#a78bfa' : '#8b5cf6'
    })
    
    datasets.splice(1, 0, {
      label: `Strategia B (${stintLabels})`,
      data: lapsBForChart.map(l => timeToSeconds(l.time)),
      borderColor: '#8b5cf6',
      backgroundColor: 'rgba(139,92,246,0.1)',
      pointBackgroundColor: segmentColors,
      pointRadius: 5,
      tension: 0,
      segment: {
        borderColor: (ctx: any) => {
          // Change line color at stint boundaries
          const lap = lapsBForChart[ctx.p1DataIndex]
          return lap?._stintIndex > 0 ? '#a78bfa' : '#8b5cf6'
        }
      }
    })
  }
  
  // Add stint B line if in compare mode
  if (isCompareMode.value && compareStintBLaps.value.length > 0) {
    const allLapsB = compareStintBLaps.value
    // Filter out excluded laps for Stint B
    const lapsB = allLapsB.filter(l => !excludedLapsB.value.has(l.lap))
    datasets.splice(1, 0, {
      label: `B: Stint #${stintB.value}`,
      data: lapsB.map(l => timeToSeconds(l.time)),
      borderColor: '#8b5cf6',
      backgroundColor: 'rgba(139,92,246,0.1)',
      pointBackgroundColor: lapsB.map(l => l.pit ? '#6b7280' : !l.valid ? '#ef4444' : '#8b5cf6'),
      pointRadius: 5,
      tension: 0
    })
  }
  
  // Add Session B line if in CROSS-SESSION compare mode
  if (isCrossSessionCompare.value && crossStintBLaps.value.length > 0) {
    let allLapsB: any[] = crossStintBLaps.value.map((lap, idx) => ({
      ...lap,
      _chartIdx: idx + 1  // For alignment
    }))
    
    // If in strategy mode, concatenate second stint laps for B
    if (isStrategyMode.value && strategyBSecond.value) {
      const b2Laps = crossStintB2Laps.value
      const b1Length = allLapsB.length
      const concatenatedB2 = b2Laps.map((lap, idx) => ({
        ...lap,
        _chartIdx: b1Length + idx + 1,
        _isSecondStint: true
      }))
      allLapsB = [...allLapsB, ...concatenatedB2]
    }
    
    // Use null for excluded laps to maintain alignment (instead of filtering)
    // This creates "gaps" in the chart where laps are excluded
    datasets.splice(1, 0, {
      label: isStrategyMode.value 
        ? `Strategia B (${strategyBSecond.value ? 'Stint #' + selectedCrossStintB.value + '+#' + strategyBSecond.value : 'Stint #' + selectedCrossStintB.value})` 
        : `Strategia B · Stint #${selectedCrossStintB.value}`,
      data: allLapsB.map(l => excludedLapsCrossB.value.has(l.lapNumber) ? null : timeToSeconds(l.lapTime)),
      borderColor: '#8b5cf6',
      backgroundColor: 'rgba(139,92,246,0.1)',
      pointBackgroundColor: allLapsB.map(l => {
        if (excludedLapsCrossB.value.has(l.lapNumber)) return 'transparent'
        return l.pit ? '#6b7280' : !l.valid ? '#ef4444' : '#8b5cf6'
      }),
      pointRadius: allLapsB.map(l => excludedLapsCrossB.value.has(l.lapNumber) ? 0 : 5),
      tension: 0,
      spanGaps: false  // Don't connect across null values
    })
  }
  
  // Generate X-axis labels from actual lap numbers (skipping excluded laps)
  // In normal mode: labels come directly from filtered lapsA lap numbers
  // In compare modes: use max range to align both series
  let labels: string[]
  
  if (isBuilderSameSessionCompare.value || isCrossSessionCompare.value || isCompareMode.value) {
    // Compare mode: use continuous numbering for alignment
    let maxLapCount = lapsA.length
    if (isBuilderSameSessionCompare.value) {
      maxLapCount = Math.max(lapsA.length, lapsBForChart.length)
    } else if (isCrossSessionCompare.value) {
      let crossBLength = crossStintBLaps.value.length
      if (isStrategyMode.value && strategyBSecond.value) {
        crossBLength += crossStintB2Laps.value.length
      }
      maxLapCount = Math.max(lapsA.length, crossBLength)
    } else if (isCompareMode.value) {
      maxLapCount = Math.max(lapsA.length, compareStintBLaps.value.length)
    }
    labels = Array.from({ length: maxLapCount }, (_, i) => `G${i + 1}`)
  } else {
    // Normal mode: labels from actual lap numbers, skipping excluded
    labels = lapsA.map(l => `G${l.lap}`)
  }
  const maxLapCount = labels.length
  
  // Extend Strategy A data with null values if shorter than max (so line stops where data ends)
  if ((isBuilderSameSessionCompare.value || isCrossSessionCompare.value || isCompareMode.value) && lapsA.length < maxLapCount) {
    // Find Strategy A dataset and extend with nulls
    const strategyADataset = datasets.find(d => d.label?.startsWith('Strategia A') || d.label?.startsWith('A:'))
    if (strategyADataset && Array.isArray(strategyADataset.data)) {
      const currentLength = strategyADataset.data.length
      for (let i = currentLength; i < maxLapCount; i++) {
        strategyADataset.data.push(null)
        if (Array.isArray(strategyADataset.pointBackgroundColor)) {
          strategyADataset.pointBackgroundColor.push('transparent')
        }
        if (Array.isArray(strategyADataset.pointRadius)) {
          strategyADataset.pointRadius.push(0)
        }
      }
    }
    
    // Extend theo and target lines to max length
    const theoDataset = datasets.find(d => d.label?.startsWith('Teorico'))
    if (theoDataset && Array.isArray(theoDataset.data) && theoDataset.data.length < maxLapCount) {
      const theoValue = theoDataset.data[0]
      for (let i = theoDataset.data.length; i < maxLapCount; i++) {
        theoDataset.data.push(theoValue)
      }
    }
    
    const targetDataset = datasets.find(d => d.label?.startsWith('Target'))
    if (targetDataset && Array.isArray(targetDataset.data) && targetDataset.data.length < maxLapCount) {
      const targetValue = targetDataset.data[0]
      for (let i = targetDataset.data.length; i < maxLapCount; i++) {
        targetDataset.data.push(targetValue)
      }
    }
  }
  
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
        title: (items: any[]) => {
          if (!items.length) return ''
          // Show the lap label (e.g. "G5") from the X-axis labels
          return `Giro ${items[0].label?.replace('G', '') || ''}`
        },
        label: (ctx: any) => {
          if (ctx.dataset.label?.startsWith('_')) return '' // Hide internal tooltip
          return `${ctx.dataset.label}: ${secondsToTime(ctx.raw)}`
        }
      }
    },
    zoom: {
      pan: {
        enabled: true,
        mode: 'x' as const,
        modifierKey: undefined as undefined
      },
      zoom: {
        wheel: {
          enabled: true
        },
        pinch: {
          enabled: true
        },
        mode: 'x' as const,
        drag: {
          enabled: false
        }
      },
      limits: {
        x: { min: 'original' as const, max: 'original' as const }
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
// Delta color scheme: green=on-target/faster, yellow=close, orange=margin, red=far
function getDeltaClass(d: string | undefined) { 
  if (!d || d === '-') return 'far'
  const v = parseFloat(d)
  if (isNaN(v)) return 'far'
  if (v < 0) return 'faster'      // Negative = faster than theoretical (green)
  if (v === 0) return 'ontarget'  // Exact match (green, same as faster)
  if (v <= 0.3) return 'close'    // Close but slower (yellow like Q badge)
  if (v <= 0.5) return 'margin'   // Acceptable margin (orange)
  return 'far'                    // Far from target (red)
}
function getDeltaLabel(d: string) { 
  if (!d || d === '-') return '-'
  const v = parseFloat(d)
  if (isNaN(v)) return '-'
  if (v < 0) return 'FASTER'
  if (v === 0) return 'TARGET'
  if (v <= 0.3) return 'VICINO'
  if (v <= 0.5) return 'MARGINE'
  return 'LONTANO'
}

// Calculate delta vs theoretical for a stint (using correct grip-based theoretical with temp adjustment)
function getStintDeltaVsTheo(stint: typeof session.value.stints[0]): string {
  if (!stint) return '-'
  
  // Get theoretical time based on stint type
  const isQualy = stint.type === 'Q'
  const theoMs = isQualy ? theoreticalTimes.value.theoQualy : theoreticalTimes.value.theoRace
  
  if (!theoMs) return '-'
  
  // Parse actual best time from stint
  const actualSec = timeToSeconds(stint.best)
  if (actualSec === 0) return '-'
  
  const theoSec = theoMs / 1000
  const delta = actualSec - theoSec
  
  return delta >= 0 ? `+${delta.toFixed(3)}` : delta.toFixed(3)
}

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
// Uses theoreticalTimes computed for accurate comparison
// ========================================
const deltaBest = computed(() => {
  if (!selectedStint.value) return { value: '-', seconds: 0, class: 'neutral' }
  
  // Parse actual best time from stint (string format M:SS.mmm)
  const actualSec = timeToSeconds(selectedStint.value.best)
  if (actualSec === 0) return { value: '-', seconds: 0, class: 'neutral' }
  
  // Get theoretical based on stint type
  let theoMs: number | null = null
  if (selectedStint.value.type === 'Q') {
    theoMs = theoreticalTimes.value.theoQualy
  } else {
    theoMs = theoreticalTimes.value.theoRace
  }
  
  if (!theoMs) return { value: '-', seconds: 0, class: 'neutral' }
  
  const theoSec = theoMs / 1000
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
  
  // Parse actual avg time from stint
  const actualSec = timeToSeconds(selectedStint.value.avg)
  if (actualSec === 0) return { value: '-', seconds: 0, class: 'neutral' }
  
  // Avg delta only meaningful for Race stints
  if (selectedStint.value.type === 'Q') return { value: '-', seconds: 0, class: 'neutral' }
  
  const theoAvgMs = theoreticalTimes.value.theoAvgRace
  if (!theoAvgMs) return { value: '-', seconds: 0, class: 'neutral' }
  
  const theoAvgSec = theoAvgMs / 1000
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
  
  // Get theoretical time based on stint type (with temp adjustment)
  const isQualy = selectedStint.value.type === 'Q'
  const theoMs = isQualy ? theoreticalTimes.value.theoQualy : theoreticalTimes.value.theoRace
  
  if (!theoMs) {
    return { onTarget: 0, total: 0, pct: 0, targetLine: '-' }
  }
  
  // Target = Theoretical + TARGET_THRESHOLD_S
  const theoSec = theoMs / 1000
  const targetLine = theoSec + TARGET_THRESHOLD_S
  
  // Include all laps (valid and invalid), excluding only pit laps
  const allLaps = selectedStintLaps.value.filter(l => !l.pit)
  const total = allLaps.length
  
  let onTarget = 0
  allLaps.forEach(lap => {
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
// STINT DURATION (from JSON stint_drive_time_ms)
// ========================================
const stintDuration = computed(() => {
  if (!selectedStint.value) {
    return { hours: 0, minutes: 0, seconds: 0, milliseconds: 0, formatted: '0:00.000', totalMs: 0 }
  }
  
  // Use pre-calculated duration from JSON (fallback to 0 if missing)
  let totalMs = selectedStint.value.durationMs || 0
  
  if (totalMs === 0 && selectedStintLaps.value.length > 0) {
    // Fallback: sum lap times if durationMs not available
    selectedStintLaps.value.forEach(lap => {
      totalMs += timeToSeconds(lap.time) * 1000
    })
  }
  
  // Calculate precise values WITHOUT rounding
  const totalSeconds = totalMs / 1000
  const hours = Math.floor(totalSeconds / 3600)
  const minutes = Math.floor((totalSeconds % 3600) / 60)
  const seconds = Math.floor(totalSeconds % 60)
  const milliseconds = Math.round(totalMs % 1000) // Only round ms to integer
  
  // Precise format: "15m 34.465s" or "1h 04m 31.123s" for >1h
  let formatted = ''
  
  if (hours > 0) {
    // "1h 04m 31.123s" - full format with hours
    formatted = `${hours}h ${minutes.toString().padStart(2, '0')}m ${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}s`
  } else {
    // "15m 34.465s" - minutes + seconds.milliseconds
    formatted = `${minutes}m ${seconds.toString().padStart(2, '0')}.${milliseconds.toString().padStart(3, '0')}s`
  }
  
  return { hours, minutes, seconds, milliseconds, formatted, totalMs }
})

// Toggle for showing target zone on chart
const showTargetZone = ref(true)

// Toggle for showing grip zones on chart
const showGripZones = ref(false)

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
  <div class="session-detail-wrapper">
  <!-- Share Success Notification (teleported to body for fixed position) -->
  <Teleport to="body">
    <Transition name="slide-notification">
      <div v-if="shareSuccess" class="share-notification">
        <span class="share-notification-icon">✓</span>
        <span class="share-notification-text">Link copiato nella clipboard!</span>
      </div>
    </Transition>
  </Teleport>
  <LayoutPageContainer class="session-detail-page">
    <!-- NAV -->
    <div class="nav-bar">
      <button class="nav-btn" @click="emit('back')">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 18l-6-6 6-6"/></svg>
        Torna alle sessioni
      </button>
      <button class="nav-btn nav-btn--accent" @click="emit('go-to-track', session.trackId)">
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
        <button class="share-session-btn" @click="shareSession" title="Condividi questa sessione">
          🔗 Condividi
        </button>
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
        <!-- <h2 class="master-title">Stint ({{ session.stints.length }})</h2> -->
        
        <!-- CONTROL PANEL - Simplified 
        <div class="control-panel">
        </div>
        -->
        
        <!-- BUILDER PANEL: Always visible -->
        <div class="builder-panel">
          <div class="builder-panel-header">
            <span class="builder-panel-title">Strategy Builder</span>
            <!-- Combo Status/Reset Button - Option 5 -->
            <template v-if="hasBuilderContent">
              <button v-if="isBuilderCompareReady" class="builder-combo-btn builder-combo-btn--active" @click="resetBuilder" title="Confronto attivo - Clicca per resettare">
                <span class="combo-status">✓ Attivo</span>
                <span class="combo-divider">|</span>
                <span class="combo-reset">×</span>
              </button>
              <button v-else class="builder-combo-btn" @click="resetBuilder" title="Azzera selezione">
                × Reset
              </button>
            </template>
          </div>
          
          <!-- Slot A -->
          <div class="builder-slot builder-slot--a">
            <span class="builder-slot-label">A</span>
            <div class="builder-slot-content">
              <span v-if="!selectedCrossStintA" class="builder-slot-empty">Seleziona stint con [+A]</span>
              <template v-else>
                <span class="builder-chip builder-chip--a1">
                  #{{ selectedCrossStintA }}
                  <button class="chip-remove" @click="removeBuilderStintA1" :title="strategyASecond ? 'Rimuovi (rimuoverà anche +' + strategyASecond + ')' : 'Rimuovi'">×</button>
                </span>
                <span v-if="strategyASecond" class="builder-chip builder-chip--a2">
                  + #{{ strategyASecond }}
                  <button class="chip-remove" @click="removeSecondStintA" title="Rimuovi">×</button>
                </span>
              </template>
            </div>
          </div>
          
          <!-- Slot B -->
          <div class="builder-slot builder-slot--b">
            <span class="builder-slot-label">B</span>
            <div class="builder-slot-content">
              <span v-if="!selectedCrossStintB" class="builder-slot-empty">Seleziona stint con [+B]</span>
              <template v-else>
                <span class="builder-chip builder-chip--b1">
                  #{{ selectedCrossStintB }}
                  <button class="chip-remove" @click="removeBuilderStintB1" :title="strategyBSecond ? 'Rimuovi (rimuoverà anche +' + strategyBSecond + ')' : 'Rimuovi'">×</button>
                </span>
                <span v-if="strategyBSecond" class="builder-chip builder-chip--b2">
                  + #{{ strategyBSecond }}
                  <button class="chip-remove" @click="removeSecondStintB" title="Rimuovi">×</button>
                </span>
              </template>
            </div>
          </div>
        </div>
        
        <!-- Header removed per UX audit - was adding noise without value -->
        <!-- CROSS-SESSION MODE: Show two sections -->
        <template v-if="isCrossSessionMode">
          <!-- Session A Section -->
          <div class="cross-session-section">
            <div class="cross-session-header cross-session-header--a">
              <span class="cross-session-label">Sessione di {{ currentUserNickname || 'Te' }}</span>
              <span class="cross-session-date">{{ session.date }}</span>
            </div>
            
            <div class="stint-list stint-list--builder">
              <div
                v-for="stint in session.stints"
                :key="'a-' + stint.number"
                :class="['stint-item stint-item--builder', { 
                  'builder-selected': isStintInBuilderA(stint.number),
                  'viewing': selectedStintNumber === stint.number,
                  'best-stint': isBestStint(stint)
                }]"
                @click="viewStintA(stint.number)"
              >
                <!-- [+A] Button -->
                <button 
                  class="stint-add-btn stint-add-btn--a"
                  :disabled="!canAddToBuilderA(stint.number)"
                  :title="getAddToBuilderTooltipA(stint.number)"
                  @click.stop="addToBuilderA(stint.number)"
                >+A</button>
                
                <!-- [+B] Button -->
                <button 
                  class="stint-add-btn stint-add-btn--b"
                  :disabled="!canAddToBuilderB(stint.number)"
                  :title="getAddToBuilderTooltipB(stint.number)"
                  @click.stop="addToBuilderB(stint.number)"
                >+B</button>
                
                <!-- Trophy for best stint OR Warning icon OR empty space -->
                <span class="stint-icon-slot">
                  <template v-if="isBestStint(stint)">🏆</template>
                  <template v-else-if="getStintWarning(stint)">{{ getStintWarning(stint)?.icon }}</template>
                </span>
                
                <!-- Stint Number -->
                <span class="stint-number">#{{ stint.number }}</span>
                
                <!-- Stint Type badge -->
                <span :class="['stint-type', `stint-type--${stint.type.toLowerCase()}`]">{{ stint.type }}</span>
                
                <!-- Laps count -->
                <span class="stint-laps">{{ stint.laps }} Giri</span>
              </div>
            </div>
          </div>
          
          <!-- Session B Section -->
          <div class="cross-session-section">
            <div class="cross-session-header cross-session-header--b">
              <span class="cross-session-label">
                <template v-if="isExternalSession">
                  Sessione di {{ crossSessionNickname || 'Utente Esterno' }}
                </template>
                <template v-else>
                  Sessione di {{ currentUserNickname || 'Te' }} (altra)
                </template>
              </span>
              <button class="cross-session-close" @click="clearCrossSession" title="Rimuovi questa sorgente">✕</button>
            </div>
            
            <div class="stint-list stint-list--builder">
              <div
                v-for="stint in crossSessionStints"
                :key="'b-' + stint.number"
                :class="['stint-item stint-item--builder stint-item--b', { 
                  'builder-selected': isStintInBuilderB(stint.number)
                }]"
                @click="viewStintB(stint.number)"
              >
                <!-- [+A] Button - In cross-session, Session B stints should use +B -->
                <button 
                  class="stint-add-btn stint-add-btn--a"
                  :disabled="!canAddToBuilderACross(stint.number)"
                  :title="getAddToBuilderTooltipACross(stint.number)"
                  @click.stop="addToBuilderA(stint.number)"
                >+A</button>
                
                <!-- [+B] Button -->
                <button 
                  class="stint-add-btn stint-add-btn--b"
                  :disabled="!canAddToBuilderBCross(stint.number)"
                  :title="getAddToBuilderTooltipBCross(stint.number)"
                  @click.stop="addToBuilderBCross(stint.number)"
                >+B</button>
                
                <!-- Trophy for best stint OR Warning icon OR empty space -->
                <span class="stint-icon-slot">
                  <template v-if="isBestStint(stint)">🏆</template>
                  <template v-else-if="getStintWarning(stint)">{{ getStintWarning(stint)?.icon }}</template>
                </span>
                
                <!-- Stint Number -->
                <span class="stint-number">#{{ stint.number }}</span>
                
                <!-- Stint Type badge -->
                <span :class="['stint-type', `stint-type--${stint.type.toLowerCase()}`]">{{ stint.type }}</span>
                
                <!-- Laps count -->
                <span class="stint-laps">{{ stint.laps }} Giri</span>
              </div>
            </div>
          </div>
        </template>
        
        <!-- NORMAL MODE: Single stint list with [+A] [+B] buttons -->
        <template v-else>
          <h4 class="master-title">STINT</h4>
          <div class="stint-list stint-list--builder">
            <div
            v-for="stint in session.stints"
            :key="stint.number"
            :class="['stint-item stint-item--builder', { 
              selected: selectedStintNumber === stint.number,
              'builder-selected-a': isStintInBuilderA(stint.number),
              'builder-selected-b': isStintInBuilderB(stint.number),
              'best-stint': isBestStint(stint)
            }]"
            @click="selectStintForView(stint.number)"
          >
            <!-- [+A] Button -->
            <button 
              class="stint-add-btn stint-add-btn--a"
              :disabled="!canAddToBuilderA(stint.number)"
              :title="getAddToBuilderTooltipA(stint.number)"
              @click.stop="addToBuilderA(stint.number)"
            >+A</button>
            
            <!-- [+B] Button -->
            <button 
              class="stint-add-btn stint-add-btn--b"
              :disabled="!canAddToBuilderB(stint.number)"
              :title="getAddToBuilderTooltipB(stint.number)"
              @click.stop="addToBuilderB(stint.number)"
            >+B</button>
            
            <!-- Trophy for best stint OR Warning icon OR empty space -->
            <span class="stint-icon-slot">
              <template v-if="isBestStint(stint)">🏆</template>
              <template v-else-if="getStintWarning(stint)">{{ getStintWarning(stint)?.icon }}</template>
            </span>
            
            <!-- Stint Number -->
            <span class="stint-number">#{{ stint.number }}</span>
            
            <!-- Stint Type badge -->
            <span :class="['stint-type', `stint-type--${stint.type.toLowerCase()}`]">{{ stint.type }}</span>
            
            <!-- Laps count -->
            <span class="stint-laps">{{ stint.laps }} Giri</span>
            
            <!-- Delta value only (no label) -->
            <span :class="['stint-delta', `delta--${getDeltaClass(getStintDeltaVsTheo(stint))}`]">
              {{ getStintDeltaVsTheo(stint) }}
            </span>
          </div>
        </div>
        
        <!-- ALTRA SESSIONE BUTTON: Below stint list, hidden when cross-session active -->
        <button 
          class="altra-sessione-btn"
          @click="openSessionPicker"
        >
          Confronta con altra sessione
        </button>
        </template>
      </aside>

      <!-- DETAIL: Analysis Panel -->
      <section class="detail">
        <!-- Compare header removed per user request -->

        <!-- Stint Header removed per user request (RACE/BEST pills) -->

        <!-- EMPTY STATE: ONLY when session has no stints at all (rare edge case) -->
        <div v-if="!isCompareMode && !isBuilderSameSessionCompare && !isCrossSessionCompare && session.stints.length === 0" class="empty-state-panel">
          <div class="empty-state-content">
            <h3 class="empty-state-title">Nessun stint disponibile</h3>
            <p class="empty-state-text">Questa sessione non contiene dati di stint.</p>
          </div>
        </div>

        <!-- 5) Limited Data / Reliability Warning -->
        <div v-if="!isCompareMode && !isBuilderSameSessionCompare && selectedStint && getStintWarning(selectedStint)" class="limited-data">
          {{ getStintWarning(selectedStint)?.icon }} {{ getStintWarning(selectedStint)?.message }}
        </div>

        <!-- ========================================== -->
        <!-- COMPARE MODE: Layout 1 - Headers + Table  -->
        <!-- ========================================== -->
        <div v-if="isCompareMode || isBuilderSameSessionCompare || isCrossSessionCompare" class="compare-layout compare-style--A">
          <!-- Conditions Headers -->
          <div class="compare-conditions">
            <!-- A Header -->
            <div class="compare-condition-card compare-condition-card--a">
              <div class="cond-stint-label">A: Stint #{{ (isBuilderSameSessionCompare || isCrossSessionCompare) ? selectedCrossStintA : stintA }}</div>
              <div class="cond-details">
                <span class="cond-item"><span class="cond-lbl">Aria:</span> {{ getStintTempDisplay((isBuilderSameSessionCompare || isCrossSessionCompare) ? crossStintALaps : compareStintALaps) }}°</span>
                <span class="cond-item"><span class="cond-lbl">Grip:</span> {{ getStintGripDisplay((isBuilderSameSessionCompare || isCrossSessionCompare) ? crossStintALaps : compareStintALaps) }}</span>
              </div>
            </div>
            <!-- B Header -->
            <div class="compare-condition-card compare-condition-card--b">
              <div class="cond-stint-label">B: Stint #{{ (isBuilderSameSessionCompare || isCrossSessionCompare) ? selectedCrossStintB : stintB }}</div>
              <div class="cond-details">
                <span class="cond-item"><span class="cond-lbl">Aria:</span> {{ getStintTempDisplay((isBuilderSameSessionCompare || isCrossSessionCompare) ? crossStintBLaps : compareStintBLaps) }}°</span>
                <span class="cond-item"><span class="cond-lbl">Grip:</span> {{ getStintGripDisplay((isBuilderSameSessionCompare || isCrossSessionCompare) ? crossStintBLaps : compareStintBLaps) }}</span>
              </div>
            </div>
          </div>

          <!-- Comparison Table - Multi-stint strategy support -->
          <div class="compare-table-wrap">
            <div class="ssc-table">
              <div class="ssc-table-header">
                <div class="ssc-th ssc-th--label"></div>
                <div class="ssc-th">STRATEGIA A</div>
                <div class="ssc-th">STRATEGIA B</div>
                <div class="ssc-th">- DELTA</div>
              </div>
              
              <!-- Loop through each stint position -->
              <template v-for="(_, stintIndex) in maxStrategyStints" :key="stintIndex">
                <!-- Stint separator header (only if multiple stints) -->
                <div v-if="maxStrategyStints > 1" class="ssc-stint-separator">
                  <span>STINT {{ stintIndex + 1 }}</span>
                </div>
                
                <!-- BEST row -->
                <div class="ssc-table-row">
                  <div class="ssc-td ssc-td--label">BEST</div>
                  <div class="ssc-td ssc-td--value">{{ strategyAStints[stintIndex]?.best ?? '—' }}</div>
                  <div class="ssc-td ssc-td--value">{{ strategyBStints[stintIndex]?.best ?? '—' }}</div>
                  <div class="ssc-td">
                    <span v-if="strategyAStints[stintIndex] && strategyBStints[stintIndex]" 
                          :class="['ssc-delta', getCompareDeltaClass(strategyAStints[stintIndex]?.bestMs, strategyBStints[stintIndex]?.bestMs)]">
                      {{ formatCompareDelta(strategyAStints[stintIndex]?.bestMs, strategyBStints[stintIndex]?.bestMs) }}
                    </span>
                    <span v-else class="ssc-delta ssc-delta--empty">—</span>
                  </div>
                </div>
                
                <!-- AVG row -->
                <div class="ssc-table-row">
                  <div class="ssc-td ssc-td--label">AVG</div>
                  <div :class="['ssc-td', 'ssc-td--value', { 'ssc-td--warning': strategyAStints[stintIndex]?.avgWarning }]">
                    <template v-if="strategyAStints[stintIndex]?.avgWarning">⚠️ {{ strategyAStints[stintIndex]?.avg }}</template>
                    <template v-else>{{ strategyAStints[stintIndex]?.avg ?? '—' }}</template>
                  </div>
                  <div :class="['ssc-td', 'ssc-td--value', { 'ssc-td--warning': strategyBStints[stintIndex]?.avgWarning }]">
                    <template v-if="strategyBStints[stintIndex]?.avgWarning">⚠️ {{ strategyBStints[stintIndex]?.avg }}</template>
                    <template v-else>{{ strategyBStints[stintIndex]?.avg ?? '—' }}</template>
                  </div>
                  <div class="ssc-td">
                    <span v-if="strategyAStints[stintIndex] && strategyBStints[stintIndex]"
                          :class="['ssc-delta', getCompareDeltaClass(strategyAStints[stintIndex]?.avgMs, strategyBStints[stintIndex]?.avgMs)]">
                      {{ formatCompareDelta(strategyAStints[stintIndex]?.avgMs, strategyBStints[stintIndex]?.avgMs) }}
                    </span>
                    <span v-else class="ssc-delta ssc-delta--empty">—</span>
                  </div>
                </div>
                
                <!-- GIRI + DURATA combined row -->
                <div class="ssc-table-row ssc-table-row--compact">
                  <div class="ssc-td ssc-td--label">GIRI VALIDI</div>
                  <div class="ssc-td ssc-td--compact">
                    <template v-if="strategyAStints[stintIndex]">
                      {{ strategyAStints[stintIndex].validLapsCount ?? 0 }} su {{ strategyAStints[stintIndex].laps ?? 0 }}
                      <span class="compact-sep">·</span>
                      {{ formatDuration(strategyAStints[stintIndex]?.durationMs) }}
                    </template>
                    <template v-else>—</template>
                  </div>
                  <div class="ssc-td ssc-td--compact">
                    <template v-if="strategyBStints[stintIndex]">
                      {{ strategyBStints[stintIndex].validLapsCount ?? 0 }} su {{ strategyBStints[stintIndex].laps ?? 0 }}
                      <span class="compact-sep">·</span>
                      {{ formatDuration(strategyBStints[stintIndex]?.durationMs) }}
                    </template>
                    <template v-else>—</template>
                  </div>
                  <div class="ssc-td"></div>
                </div>
              </template>
              
              <!-- TOTALE row (only if more than 1 stint in either strategy) -->
              <template v-if="maxStrategyStints > 1">
                <div class="ssc-stint-separator ssc-stint-separator--total">
                  <span>TOTALE</span>
                </div>
                <div class="ssc-table-row ssc-table-row--total">
                  <div class="ssc-td ssc-td--label">DURATA</div>
                  <div class="ssc-td ssc-td--value ssc-td--duration">{{ formatDuration(strategyATotalDurationMs) }}</div>
                  <div class="ssc-td ssc-td--value ssc-td--duration">{{ formatDuration(strategyBTotalDurationMs) }}</div>
                  <div class="ssc-td"></div>
                </div>
              </template>
            </div>
          </div>
        </div>

        <!-- ========================================== -->
        <!-- SINGLE STINT: Stats Card (non-compare mode) -->
        <!-- ========================================== -->
        <div v-if="!isCompareMode && !isCrossSessionCompare && !isBuilderSameSessionCompare && displayedStint" 
             :class="['stint-stats-card', `racing-theme--${racingStyle}`]">

          <!-- Table Layout with Explicit Comparison -->
          <div class="ssc-header">
              <div class="ssc-header-left">
                <span :class="['stint-type', `stint-type--${displayedStint?.type?.toLowerCase()}`]">{{ displayedStint?.type === 'R' ? 'Race' : 'Qualifying' }}</span>
                <span class="ssc-stint-label">STINT #{{ displayedStintNumber }}</span>
                <span class="ssc-header-divider">|</span>
                <span class="ssc-condition-text">
                  <span class="ssc-cond-lbl">ARIA</span>
                  <span class="ssc-cond-val">{{ stintConditions.airTemp.avg || stintConditions.airTemp.start }}°</span>
                </span>
                <span class="ssc-condition-text">
                  <span class="ssc-cond-lbl">GRIP</span>
                  <span class="ssc-cond-val">{{ stintConditions.grip.dominant }}</span>
                </span>
              </div>
              <div class="ssc-header-right">
                <span class="ssc-duration-label">Durata: {{ stintDuration.formatted }}</span>
              </div>
            </div>
            <div class="ssc-table">
              <div class="ssc-table-header">
                <div class="ssc-th ssc-th--label"></div>
                <div class="ssc-th">TEMPI STINT</div>
                <div class="ssc-th ssc-th--theo">
                  TEORICO
                  <span class="theo-info" title="Tempo Teorico = Storico + (TempStint - TempStorico) × 100ms/°C">?</span>
                </div>
                <div class="ssc-th">- DELTA</div>
              </div>
              <div class="ssc-table-row">
                <div class="ssc-td ssc-td--label">BEST</div>
                <div class="ssc-td ssc-td--value">{{ selectedStint?.best ?? '—:—.---' }}</div>
                <div class="ssc-td ssc-td--value ssc-td--theo">
                  {{ selectedStint?.type === 'Q' 
                     ? (theoreticalTimes.theoQualy ? formatLapTime(theoreticalTimes.theoQualy) : '—:—.---')
                     : (theoreticalTimes.theoRace ? formatLapTime(theoreticalTimes.theoRace) : '—:—.---') 
                  }}
                </div>
                <div class="ssc-td">
                  <span :class="['ssc-delta', deltaBest.class]">{{ deltaBest.value }}</span>
                </div>
              </div>
              <div class="ssc-table-row">
                <div class="ssc-td ssc-td--label">AVG</div>
                <div class="ssc-td ssc-td--value">{{ selectedStint?.avg ?? '—:—.---' }}</div>
                <div class="ssc-td ssc-td--value ssc-td--theo">
                  {{ selectedStint?.type === 'Q' ? '—' : (theoreticalTimes.theoAvgRace ? formatLapTime(theoreticalTimes.theoAvgRace) : '—:—.---') }}
                </div>
                <div class="ssc-td">
                  <span v-if="selectedStint?.type !== 'Q'" :class="['ssc-delta', deltaAvg.class]">{{ deltaAvg.value }}</span>
                  <span v-else class="ssc-delta ssc-delta--na">—</span>
                </div>
              </div>
            </div>
            <div v-if="selectedStint?.type === 'R' && consistencyStats.total > 0" class="ssc-target-section">
              <div class="ssc-target-row-bottom">
                <span class="ssc-target-label">TARGET GARA:</span>
                <span class="ssc-target-value">{{ consistencyStats.targetLine }}</span>
              </div>
            </div>
            <div class="ssc-progress-section">
              <div v-if="selectedStint?.type === 'R' && consistencyStats.total > 0" class="ssc-progress-row">
                <div class="ssc-progress-label">
                  <span class="ssc-progress-title">GIRI NEL TARGET</span>
                  <span class="ssc-progress-count">{{ consistencyStats.onTarget }} su {{ consistencyStats.total }}</span>
                </div>
                <div class="ssc-progress-bar">
                  <div class="ssc-progress-fill" :style="{ width: consistencyStats.pct + '%', background: getGradientColor(consistencyStats.pct) }"></div>
                </div>
                <span class="ssc-progress-pct" :style="{ color: getGradientColor(consistencyStats.pct) }">{{ consistencyStats.pct }}%</span>
              </div>
              <div v-if="validityStats.total > 0" class="ssc-progress-row">
                <div class="ssc-progress-label">
                  <span class="ssc-progress-title">GIRI VALIDI</span>
                  <span class="ssc-progress-count">{{ validityStats.valid }} su {{ validityStats.total }}</span>
                </div>
                <div class="ssc-progress-bar">
                  <div class="ssc-progress-fill" :style="{ width: validityStats.pct + '%', background: getGradientColor(validityStats.pct) }"></div>
                </div>
                <span class="ssc-progress-pct" :style="{ color: getGradientColor(validityStats.pct) }">{{ validityStats.pct }}%</span>
              </div>
            </div>
        </div>

        <!-- Chart -->
        <div class="chart-section">
          <div class="chart-header-row">
            <h4 class="chart-title">
              <template v-if="isCompareMode">Confronto Tempi — A: Stint #{{ stintA }} vs B: Stint #{{ stintB }}</template>
              <template v-else>Tempi Giro — Stint {{ selectedStintNumber }}</template>
            </h4>
            <!-- Chart Toolbar -->
            <div class="chart-toolbar">
              <button class="toolbar-btn" @click="zoomIn" title="Zoom In">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
              </button>
              <button class="toolbar-btn" @click="zoomOut" title="Zoom Out">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
              </button>
              <button class="toolbar-btn" @click="resetZoom" title="Reset Zoom">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><polyline points="23 20 23 14 17 14"/><path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/></svg>
              </button>
              <div class="toolbar-divider"></div>
              <button :class="['toolbar-btn', { 'toolbar-btn--active': showLapManager }]" @click="showLapManager = !showLapManager" title="Gestisci Giri">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="9" y1="21" x2="9" y2="9"/></svg>
              </button>
            </div>
          </div>
          
          <!-- Lap Manager Panel -->
          <div v-if="showLapManager" class="lap-manager">
            <!-- Strategy A Laps -->
            <div class="lap-manager-section">
              <div class="lap-manager-header">
                <span class="lap-manager-title">{{ 
                  isBuilderSameSessionCompare ? 'Strategia A · ' + strategyAStints.map(s => '#' + s.number).join('+') :
                  isCrossSessionCompare ? 'Strategia A · Stint #' + selectedCrossStintA :
                  isCompareMode ? 'Strategia A · Stint #' + stintA : 'Escludi Giri' 
                }}</span>
                <button class="lap-manager-reset" @click="resetExcludedLaps" :disabled="excludedLaps.size === 0">
                  Reset
                </button>
              </div>
              
              <!-- Multi-Stint Grid (Builder Same-Session mode) -->
              <template v-if="isBuilderSameSessionCompare">
                <div v-for="stint in strategyAStints" :key="'stint-a-' + stint.number" class="lap-manager-stint-group">
                  <div class="lap-manager-stint-header">Stint #{{ stint.number }}</div>
                  <div class="lap-manager-grid">
                    <button 
                      v-for="lap in (session.lapsData[stint.number] || [])" 
                      :key="'a-' + stint.number + '-' + lap.lap"
                      :class="[
                        'lap-toggle-btn',
                        { 'lap-toggle-btn--excluded': excludedLaps.has(lap.lap) },
                        { 'lap-toggle-btn--invalid': !lap.valid && !lap.pit },
                        { 'lap-toggle-btn--pit': lap.pit }
                      ]"
                      @click="toggleLapExclusion(lap.lap)"
                      :title="`Giro ${lap.lap} - ${lap.time}${!lap.valid ? ' (Invalido)' : ''}${lap.pit ? ' (Pit)' : ''}`"
                    >
                      {{ lap.lap }}
                    </button>
                  </div>
                </div>
              </template>
              
              <!-- Single Stint Grid (other modes) -->
              <template v-else>
                <div class="lap-manager-grid">
                  <button 
                    v-for="lap in (isCrossSessionCompare ? crossStintALaps : isCompareMode ? compareStintALaps : selectedStintLaps)" 
                    :key="'a-' + lap.lap"
                    :class="[
                      'lap-toggle-btn',
                      { 'lap-toggle-btn--excluded': excludedLaps.has(lap.lap) },
                      { 'lap-toggle-btn--invalid': !lap.valid && !lap.pit },
                      { 'lap-toggle-btn--pit': lap.pit }
                    ]"
                    @click="toggleLapExclusion(lap.lap)"
                    :title="`Giro ${lap.lap} - ${lap.time}${!lap.valid ? ' (Invalido)' : ''}${lap.pit ? ' (Pit)' : ''}`"
                  >
                    {{ lap.lap }}
                  </button>
                </div>
              </template>
              
              <div v-if="excludedLaps.size > 0" class="lap-manager-info">
                {{ excludedLaps.size }} giri esclusi
              </div>
            </div>
            
            <!-- Strategy B Laps (in compare modes OR Builder Same-Session mode) -->
            <div v-if="isCompareMode || isBuilderSameSessionCompare" class="lap-manager-section lap-manager-section--b">
              <div class="lap-manager-header">
                <span class="lap-manager-title">{{ 
                  isBuilderSameSessionCompare ? 'Strategia B · ' + strategyBStints.map(s => '#' + s.number).join('+') :
                  'B: Stint #' + stintB 
                }}</span>
                <button class="lap-manager-reset" @click="resetExcludedLapsB" :disabled="excludedLapsB.size === 0">
                  Reset
                </button>
              </div>
              
              <!-- Multi-Stint Grid (Builder Same-Session mode) -->
              <template v-if="isBuilderSameSessionCompare">
                <div v-for="stint in strategyBStints" :key="'stint-b-' + stint.number" class="lap-manager-stint-group">
                  <div class="lap-manager-stint-header lap-manager-stint-header--b">Stint #{{ stint.number }}</div>
                  <div class="lap-manager-grid">
                    <button 
                      v-for="lap in (session.lapsData[stint.number] || [])" 
                      :key="'b-' + stint.number + '-' + lap.lap"
                      :class="[
                        'lap-toggle-btn lap-toggle-btn--b',
                        { 'lap-toggle-btn--excluded': excludedLapsB.has(lap.lap) },
                        { 'lap-toggle-btn--invalid': !lap.valid && !lap.pit },
                        { 'lap-toggle-btn--pit': lap.pit }
                      ]"
                      @click="toggleLapExclusionB(lap.lap)"
                      :title="`Giro ${lap.lap} - ${lap.time}${!lap.valid ? ' (Invalido)' : ''}${lap.pit ? ' (Pit)' : ''}`"
                    >
                      {{ lap.lap }}
                    </button>
                  </div>
                </div>
              </template>
              
              <!-- Single Stint Grid (compare mode) -->
              <template v-else>
                <div class="lap-manager-grid">
                  <button 
                    v-for="lap in compareStintBLaps" 
                    :key="'b-' + lap.lap"
                    :class="[
                      'lap-toggle-btn lap-toggle-btn--b',
                      { 'lap-toggle-btn--excluded': excludedLapsB.has(lap.lap) },
                      { 'lap-toggle-btn--invalid': !lap.valid && !lap.pit },
                      { 'lap-toggle-btn--pit': lap.pit }
                    ]"
                    @click="toggleLapExclusionB(lap.lap)"
                    :title="`Giro ${lap.lap} - ${lap.time}${!lap.valid ? ' (Invalido)' : ''}${lap.pit ? ' (Pit)' : ''}`"
                  >
                    {{ lap.lap }}
                  </button>
                </div>
              </template>
              
              <div v-if="excludedLapsB.size > 0" class="lap-manager-info">
                {{ excludedLapsB.size }} giri esclusi
              </div>
            </div>
            
            <!-- Session B Laps (only in CROSS-SESSION mode) -->
            <div v-if="isCrossSessionCompare" class="lap-manager-section lap-manager-section--b">
              <div class="lap-manager-header">
                <span class="lap-manager-title">Strategia B · Stint #{{ selectedCrossStintB }}</span>
                <button class="lap-manager-reset" @click="resetExcludedLapsCrossB" :disabled="excludedLapsCrossB.size === 0">
                  Reset
                </button>
              </div>
              <div class="lap-manager-grid">
                <button 
                  v-for="lap in crossStintBLaps" 
                  :key="'crossb-' + lap.lapNumber"
                  :class="[
                    'lap-toggle-btn lap-toggle-btn--b',
                    { 'lap-toggle-btn--excluded': excludedLapsCrossB.has(lap.lapNumber) },
                    { 'lap-toggle-btn--invalid': !lap.valid && !lap.pit },
                    { 'lap-toggle-btn--pit': lap.pit }
                  ]"
                  @click="toggleLapExclusionCrossB(lap.lapNumber)"
                  :title="`Giro ${lap.lapNumber} - ${lap.lapTime}${!lap.valid ? ' (Invalido)' : ''}${lap.pit ? ' (Pit)' : ''}`"
                >
                  {{ lap.lapNumber }}
                </button>
              </div>
              <div v-if="excludedLapsCrossB.size > 0" class="lap-manager-info">
                {{ excludedLapsCrossB.size }} giri esclusi
              </div>
            </div>
          </div>
          
          <div class="chart-wrap">
            <Line ref="chartRef" :data="chartData" :options="chartOptions" />
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
            <!-- Tabs with COMPARE option in comparison modes -->
            <!-- Tabs with COMPARE option in comparison modes -->
            <div v-if="isCompareMode || isCrossSessionCompare || isBuilderSameSessionCompare" class="laps-tabs">
              <button :class="['lap-tab lap-tab--compare', { 'lap-tab--active': activeTableTab === 'COMPARE' }]" @click="activeTableTab = 'COMPARE'">
                Confronto
              </button>
              <!-- All stints from Strategy A -->
              <button 
                v-for="stint in strategyAStints" 
                :key="'tab-a-' + stint.number"
                :class="['lap-tab lap-tab--a', { 'lap-tab--active': activeTableTab === 'A-' + stint.number }]" 
                @click="activeTableTab = 'A-' + stint.number"
              >
                A: Stint #{{ stint.number }}
              </button>
              <!-- All stints from Strategy B -->
              <button 
                v-for="stint in strategyBStints" 
                :key="'tab-b-' + stint.number"
                :class="['lap-tab lap-tab--b', { 'lap-tab--active': activeTableTab === 'B-' + stint.number }]" 
                @click="activeTableTab = 'B-' + stint.number"
              >
                B: Stint #{{ stint.number }}
              </button>
            </div>
            <h4 v-else class="laps-title">Tabella Giri — Stint {{ selectedStintNumber }}</h4>
          </div>
          
          <!-- COMPARISON VIEW: Side-by-side A vs B -->
          <div v-if="activeTableTab === 'COMPARE' && (isCompareMode || isCrossSessionCompare || isBuilderSameSessionCompare)" class="laps-table-wrap">
            <table class="laps-table laps-table--compare">
              <thead>
                <tr>
                  <th class="col-index">#</th>
                  <th class="col-a" colspan="4">Strategia A</th>
                  <th class="col-delta">Δ A-B</th>
                  <th class="col-b" colspan="4">Strategia B</th>
                </tr>
                <tr class="sub-header">
                  <th></th>
                  <th class="col-a">Tempo</th>
                  <th class="col-a">S1</th>
                  <th class="col-a">S2</th>
                  <th class="col-a">S3</th>
                  <th></th>
                  <th class="col-b">Tempo</th>
                  <th class="col-b">S1</th>
                  <th class="col-b">S2</th>
                  <th class="col-b">S3</th>
                </tr>
              </thead>
              <tbody>
                <template v-for="row in comparisonLapsData" :key="'cmp-' + row.index">
                <!-- Stint header row when new stint begins -->
                  <tr v-if="row._isStintStartA || row._isStintStartB" class="stint-header-row">
                    <td class="stint-header-index"></td>
                    <td colspan="4" class="stint-header-cell stint-header-cell--a">
                      <span v-if="row._isStintStartA" class="stint-header-label">A: Stint #{{ row._stintNumberA }}</span>
                    </td>
                    <td class="stint-header-delta"></td>
                    <td colspan="4" class="stint-header-cell stint-header-cell--b">
                      <span v-if="row._isStintStartB" class="stint-header-label">B: Stint #{{ row._stintNumberB }}</span>
                    </td>
                  </tr>
                  <tr>
                    <td class="col-index">{{ row.index }}</td>
                    <!-- Strategia A data -->
                    <td class="col-a time">{{ row.lapA ? (row.lapA.time || row.lapA.lapTime || '—') : '—' }}</td>
                    <td class="col-a sector">{{ row.lapA ? formatSectorTime(row.lapA.sectors?.[0] || row.lapA.s1) : '—' }}</td>
                    <td class="col-a sector">{{ row.lapA ? formatSectorTime(row.lapA.sectors?.[1] || row.lapA.s2) : '—' }}</td>
                    <td class="col-a sector">{{ row.lapA ? formatSectorTime(row.lapA.sectors?.[2] || row.lapA.s3) : '—' }}</td>
                    <!-- Delta -->
                    <td :class="['col-delta', 'delta', `delta--${row.deltaClass}`]">{{ row.deltaFormatted }}</td>
                    <!-- Strategia B data -->
                    <td class="col-b time">{{ row.lapB ? (row.lapB.time || row.lapB.lapTime || '—') : '—' }}</td>
                    <td class="col-b sector">{{ row.lapB ? formatSectorTime(row.lapB.sectors?.[0] || row.lapB.s1) : '—' }}</td>
                    <td class="col-b sector">{{ row.lapB ? formatSectorTime(row.lapB.sectors?.[1] || row.lapB.s2) : '—' }}</td>
                    <td class="col-b sector">{{ row.lapB ? formatSectorTime(row.lapB.sectors?.[2] || row.lapB.s3) : '—' }}</td>
                  </tr>
                </template>
              </tbody>
            </table>
          </div>
          
          <!-- SINGLE STINT VIEW: Original table for A or B tab -->
          <div v-else class="laps-table-wrap">
            <table class="laps-table">
              <thead>
                <tr>
                  <th>Giro</th>
                  <th>Tempo</th>
                  <th>Δ Teorico</th>
                  <th>S1</th>
                  <th>S2</th>
                  <th>S3</th>
                  <th>Fuel</th>
                  <th>Air°</th>
                  <th>Grip</th>
                  <th>Stato</th>
                </tr>
              </thead>
              <tbody>
                <tr 
                  v-for="lap in getLapsForTable()" 
                  :key="lap.lap || lap.lapNumber" 
                  :class="{ 
                    'lap-pit': lap.pit, 
                    'lap-excluded': excludedLaps.has(lap.lap || lap.lapNumber),
                    'lap-best': isBestLap(lap)
                  }"
                >
                  <td>{{ lap.lap || lap.lapNumber }}</td>
                  <td class="time">{{ lap.time || lap.lapTime }}</td>
                  <td :class="['delta', `delta--${getDeltaClass(lap.delta)}`]">{{ lap.delta || '—' }}</td>
                  <td :class="['sector', { 'sector--best': isBestSector(lap, 0) }]">{{ formatSectorTime(lap.sectors?.[0] || lap.s1) }}</td>
                  <td :class="['sector', { 'sector--best': isBestSector(lap, 1) }]">{{ formatSectorTime(lap.sectors?.[1] || lap.s2) }}</td>
                  <td :class="['sector', { 'sector--best': isBestSector(lap, 2) }]">{{ formatSectorTime(lap.sectors?.[2] || lap.s3) }}</td>
                  <td>{{ lap.fuel }}L</td>
                  <td>{{ Math.round(lap.airTemp || lap.air || 0) }}°</td>
                  <td>{{ lap.grip }}</td>
                  <td class="stato">
                    <span v-if="lap.pit" class="badge badge--pit">PIT</span>
                    <span v-else-if="!lap.valid" class="badge badge--invalid">INV</span>
                    <span v-else class="badge badge--valid">OK</span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>


      </section>
    </div>
    </template>
  </LayoutPageContainer>
  
  <!-- Session Picker Modal for cross-session compare -->
  <UiSessionPickerModal
    :is-open="showSessionPicker"
    :current-track="session?.track || ''"
    :exclude-session-id="props.sessionId"
    @close="showSessionPicker = false"
    @select="handleSessionBSelect"
  />
  </div>
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
.share-session-btn {
  margin-left: auto;
  padding: 6px 12px;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(255, 255, 255, 0.2);
  border-radius: 6px;
  color: rgba(255, 255, 255, 0.7);
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  
  &:hover {
    background: $racing-red;
    border-color: $racing-red;
    color: #fff;
    box-shadow: 0 0 12px rgba($racing-red, 0.4);
  }
}
.header-meta { display: flex; gap: 8px; font-size: 13px; color: rgba(255,255,255,0.6); margin-bottom: 10px; .sep { color: rgba(255,255,255,0.2); } .car { color: rgba(255,255,255,0.5); } }
.start-cond { display: flex; gap: 14px; font-size: 12px; color: rgba(255,255,255,0.7); }
.cond-label { font-size: 9px; font-weight: 700; letter-spacing: 1px; color: rgba(255,255,255,0.5); padding: 3px 8px; background: rgba(255,255,255,0.05); border-radius: 4px; }

// === SHARE NOTIFICATION BANNER (Fixed top-right viewport) ===
.share-notification {
  position: fixed;
  top: 80px;
  right: 24px;
  z-index: 9999;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 20px;
  background: rgba(20, 30, 20, 0.95);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(34, 197, 94, 0.5);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 20px rgba(34, 197, 94, 0.2);
}

.share-notification-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  background: rgba(34, 197, 94, 0.25);
  border-radius: 50%;
  color: #22c55e;
  font-size: 14px;
  font-weight: 700;
}

.share-notification-text {
  color: #22c55e;
  font-size: 14px;
  font-weight: 600;
}

// Transition animation (slide from right)
.slide-notification-enter-active,
.slide-notification-leave-active {
  transition: all 0.3s ease;
}
.slide-notification-enter-from {
  opacity: 0;
  transform: translateX(30px);
}
.slide-notification-leave-to {
  opacity: 0;
  transform: translateX(30px);
}

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
.master-detail { display: grid; grid-template-columns: 380px 1fr; gap: 32px; flex: 1; min-height: 0; align-items: start; }

// MASTER
.master {
  display: flex; flex-direction: column;
  background: linear-gradient(145deg,#151520,#0d0d12);
  border: 1px solid rgba(255,255,255,0.06); border-radius: 12px;
  padding: 16px; overflow: hidden;
  position: sticky; top: 20px; // Resta visibile durante scroll
  max-height: calc(100vh - 140px); // Evita overflow su schermi piccoli
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

.stint-list { flex: none; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; max-height: 50vh; }

// CROSS-SESSION SECTIONS
.cross-session-section {
  margin-bottom: 12px;
  
  &:last-child { margin-bottom: 0; }
  
  .stint-list { 
    flex: none; 
    max-height: 180px;
    overflow-y: auto;
  }
}

.cross-session-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 12px;
  margin-bottom: 6px;
  border-radius: 6px;
  
  &--a {
    background: rgba(#3b82f6, 0.1);
    border: 1px solid rgba(#3b82f6, 0.25);
  }
  
  &--b {
    background: rgba(#8b5cf6, 0.1);
    border: 1px solid rgba(#8b5cf6, 0.25);
  }
}

.cross-session-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  
  .cross-session-header--a & { color: #60a5fa; }
  .cross-session-header--b & { color: #a78bfa; }
}

.cross-session-date {
  font-size: 10px;
  color: rgba(255,255,255,0.4);
}

.cross-session-close {
  width: 20px;
  height: 20px;
  padding: 0;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 4px;
  color: rgba(255,255,255,0.5);
  font-size: 10px;
  cursor: pointer;
  transition: all 0.15s;
  
  &:hover {
    background: rgba($racing-red, 0.2);
    border-color: rgba($racing-red, 0.4);
    color: $racing-red;
  }
}

.stint-item--b {
  &.selected, &.compare-b {
    background: rgba(#8b5cf6, 0.1);
    border-color: rgba(#8b5cf6, 0.35);
  }
}

.checkbox-checked--b {
  background: linear-gradient(135deg, #8b5cf6 0%, #7c3aed 100%) !important;
}

// STRATEGY MULTI-STINT STYLES
.strategy-selected {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  margin-bottom: 8px;
  background: rgba(255,255,255,0.02);
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.06);
}

.strategy-stint {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 10px;
  border-radius: 6px;
  
  &--a, &--a2 {
    background: rgba(#3b82f6, 0.1);
    border: 1px solid rgba(#3b82f6, 0.25);
  }
  
  &--b, &--b2 {
    background: rgba(#8b5cf6, 0.1);
    border: 1px solid rgba(#8b5cf6, 0.25);
  }
  
  &--a2, &--b2 {
    background: rgba(255,255,255,0.03);
  }
}

.strategy-stint-label {
  font-size: 10px;
  font-weight: 700;
  padding: 2px 6px;
  border-radius: 4px;
  
  .strategy-stint--a &, .strategy-stint--a2 & {
    background: #3b82f6;
    color: white;
  }
  
  .strategy-stint--b &, .strategy-stint--b2 & {
    background: #8b5cf6;
    color: white;
  }
}

.strategy-stint-info {
  font-size: 11px;
  color: rgba(255,255,255,0.7);
  flex: 1;
}

.strategy-add-btn {
  padding: 6px 12px;
  font-size: 11px;
  font-weight: 500;
  background: rgba(#10b981, 0.1);
  border: 1px dashed rgba(#10b981, 0.4);
  border-radius: 6px;
  color: #10b981;
  cursor: pointer;
  transition: all 0.15s;
  
  &:hover {
    background: rgba(#10b981, 0.2);
    border-style: solid;
  }
  
  &--b {
    background: rgba(#8b5cf6, 0.1);
    border-color: rgba(#8b5cf6, 0.4);
    color: #a78bfa;
    
    &:hover {
      background: rgba(#8b5cf6, 0.2);
    }
  }
}

.strategy-remove-btn {
  width: 18px;
  height: 18px;
  padding: 0;
  background: rgba(255,255,255,0.05);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 4px;
  color: rgba(255,255,255,0.5);
  font-size: 12px;
  cursor: pointer;
  
  &:hover {
    background: rgba($racing-red, 0.2);
    border-color: rgba($racing-red, 0.4);
    color: $racing-red;
  }
}

.stint-item.strategy-second {
  background: rgba(255,255,255,0.04);
  border-color: rgba(255,255,255,0.1);
}
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
  //&.best-stint { border-color: rgba($accent-success, 0.3); }
}
.stint-laps { font-size: 11px; color: rgba(255,255,255,0.5); text-align: center; }

// BEST STINT ICON
.stint-best-icon {
  font-size: 14px;
  text-align: center;
  min-width: 24px;
}

// BEST EMOJI 🏆 (no background)
.stint-best-pill,
.best-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 14px;
  line-height: 1;
}

// BUILDER ACTIVE PILL (indicates builder is source)
.builder-active-pill {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  padding: 2px 6px;
  min-width: 24px;
  background: rgba(59, 130, 246, 0.15); // blue
  border: 1px solid rgba(59, 130, 246, 0.4);
  border-radius: 4px;
  font-family: $font-primary;
  font-size: 8px;
  font-weight: 700;
  letter-spacing: 0.5px;
  color: #3b82f6; // blue
  text-transform: uppercase;
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
  &--secondary {
    border-color: rgba(#3b82f6, 0.3);
    &:hover { background: rgba(#3b82f6,0.15); border-color: rgba(#3b82f6,0.5); color: #60a5fa; }
  }
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
.delta--faster { background: rgba($accent-success,0.12); color: $accent-success; .delta-val, .delta-lbl { color: $accent-success; } }
.delta--ontarget { background: rgba($accent-success,0.12); color: $accent-success; .delta-val, .delta-lbl { color: $accent-success; } }
.delta--close { background: rgba($accent-warning,0.12); color: $accent-warning; .delta-val, .delta-lbl { color: $accent-warning; } }
.delta--margin { background: rgba(#f97316,0.1); color: #f97316; .delta-val, .delta-lbl { color: #f97316; } }
.delta--far { background: rgba(255,100,100,0.1); color: rgb(255,100,100); .delta-val, .delta-lbl { color: rgb(255,100,100); } }

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

// ============================================
// COMPARE LAYOUT - F1 / Racing Futuristic Style
// ============================================
.compare-layout {
  margin-bottom: 24px;
}

// Condition Headers - Racing style panels
.compare-conditions {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
  margin-bottom: 20px;
}

.compare-condition-card {
  position: relative;
  padding: 16px 20px;
  background: linear-gradient(135deg, rgba(15, 23, 42, 0.9) 0%, rgba(30, 41, 59, 0.7) 100%);
  border-radius: 6px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  overflow: hidden;
  
  // Top accent line
  &::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 2px;
  }
  
  &--a {
    &::before { background: linear-gradient(90deg, #3b82f6 0%, rgba(59, 130, 246, 0.3) 100%); }
    .cond-stint-label { color: #60a5fa; }
  }
  
  &--b {
    &::before { background: linear-gradient(90deg, #8b5cf6 0%, rgba(139, 92, 246, 0.3) 100%); }
    .cond-stint-label { color: #a78bfa; }
  }
}

.cond-stint-label {
  font-family: $font-primary;
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 1.5px;
  text-transform: uppercase;
  margin-bottom: 12px;
}

.cond-details {
  display: flex;
  flex-wrap: wrap;
  gap: 20px;
}

.cond-item {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.9);
  font-weight: 500;
}

.cond-lbl {
  color: rgba(255, 255, 255, 0.45);
  font-weight: 400;
  margin-right: 6px;
  text-transform: uppercase;
  font-size: 10px;
  letter-spacing: 0.5px;
}

// Compare Table - Premium Racing Data Display
.compare-table-wrap {
  background: linear-gradient(180deg, rgba(15, 23, 42, 0.95) 0%, rgba(15, 23, 42, 0.8) 100%);
  border-radius: 8px;
  border: 1px solid rgba(255, 255, 255, 0.06);
  overflow: hidden;
}

.compare-table {
  width: 100%;
  border-collapse: collapse;
  
  th, td {
    padding: 14px 20px;
  }
  
  // Header row - subtle but distinct
  thead tr {
    background: linear-gradient(90deg, rgba(255,255,255,0.03) 0%, rgba(255,255,255,0.06) 50%, rgba(255,255,255,0.03) 100%);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  }
  
  th {
    color: rgba(255, 255, 255, 0.5);
    font-size: 10px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 1px;
    text-align: left;
    
    &:first-child { width: 100px; }
  }
  
  tbody tr {
    transition: background 0.15s ease;
    
    &:hover {
      background: rgba(255, 255, 255, 0.02);
    }
    
    &:not(:last-child) td {
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
    }
  }
  
  td {
    text-align: left;
  }
  
  // Metric labels - left column
  .metric-label {
    font-family: $font-primary;
    font-size: 11px;
    font-weight: 700;
    color: rgba(255, 255, 255, 0.6);
    text-transform: uppercase;
    letter-spacing: 1px;
  }
  
  // Time values - monospace, prominent
  .metric-value {
    font-family: 'JetBrains Mono', 'Monaco', monospace;
    font-size: 15px;
    font-weight: 600;
    color: #fff;
    letter-spacing: 0.5px;
  }
  
  // Delta badges - racing style with glow
  .metric-delta {
    font-family: 'JetBrains Mono', 'Monaco', monospace;
    font-size: 12px;
    font-weight: 700;
    letter-spacing: 0.5px;
    
    // Badge container
    padding: 6px 14px;
    border-radius: 4px;
    display: inline-block;
    min-width: 80px;
    text-align: center;
    
    // Green - B is faster (negative delta)
    &.delta--faster, &.delta--ontarget {
      background: linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(16, 185, 129, 0.1) 100%);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.35);
      box-shadow: 0 0 12px rgba(16, 185, 129, 0.15);
    }
    
    // Yellow - close
    &.delta--close {
      background: linear-gradient(135deg, rgba(234, 179, 8, 0.2) 0%, rgba(234, 179, 8, 0.1) 100%);
      color: #fbbf24;
      border: 1px solid rgba(234, 179, 8, 0.35);
      box-shadow: 0 0 12px rgba(234, 179, 8, 0.15);
    }
    
    // Orange - margin
    &.delta--margin {
      background: linear-gradient(135deg, rgba(249, 115, 22, 0.2) 0%, rgba(249, 115, 22, 0.1) 100%);
      color: #fb923c;
      border: 1px solid rgba(249, 115, 22, 0.35);
      box-shadow: 0 0 12px rgba(249, 115, 22, 0.15);
    }
    
    // Red - far (B much slower)
    &.delta--far {
      background: linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(239, 68, 68, 0.1) 100%);
      color: #f87171;
      border: 1px solid rgba(239, 68, 68, 0.35);
      box-shadow: 0 0 12px rgba(239, 68, 68, 0.15);
    }
    
    // For strategy duration comparison
    &.delta--negative {
      background: linear-gradient(135deg, rgba(16, 185, 129, 0.2) 0%, rgba(16, 185, 129, 0.1) 100%);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.35);
    }
    
    &.delta--positive {
      background: linear-gradient(135deg, rgba(239, 68, 68, 0.2) 0%, rgba(239, 68, 68, 0.1) 100%);
      color: #f87171;
      border: 1px solid rgba(239, 68, 68, 0.35);
    }
  }
  
  // Strategy section rows
  .strategy-section-row {
    background: rgba(255,255,255,0.02);
    border-top: 1px solid rgba(255,255,255,0.08);
  }
  
  .strategy-section-label {
    font-size: 10px;
    font-weight: 700;
    color: rgba(255,255,255,0.4);
    text-transform: uppercase;
    letter-spacing: 1.5px;
    padding: 8px 20px !important;
  }
  
  .strategy-totale-row {
    background: rgba(59, 130, 246, 0.05);
    border-top: 2px solid rgba(59, 130, 246, 0.2);
  }
  
  .strategy-totale-data {
    background: rgba(59, 130, 246, 0.03);
  }
  
  .metric-value--bold {
    font-weight: 800;
    font-size: 17px;
  }
}

// LEGACY: Keep old compare-cards-wrapper for backwards compatibility
.compare-cards-wrapper {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
  margin-bottom: 20px;
}
.compare-card {
  flex: 1;
  
  &--a {
    border-color: rgba(#3b82f6, 0.3);
    .ssc-header { border-bottom-color: rgba(#3b82f6, 0.2); }
  }
  &--b {
    border-color: rgba(#8b5cf6, 0.3);
    .ssc-header { border-bottom-color: rgba(#8b5cf6, 0.2); }
  }
}
.ssc-label-a { color: #3b82f6; }
.ssc-label-b { color: #8b5cf6; }
.ssc-table--compact {
  padding: 12px 16px;
  
  .ssc-table-row {
    padding: 8px 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
  }
  .ssc-td--value {
    font-size: 16px;
  }
}
.laps-section--compare-b {
  margin-top: 20px;
  border-top: 1px solid rgba(#8b5cf6, 0.2);
  padding-top: 20px;
}
.laps-title--b {
  color: #8b5cf6;
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

// EMPTY STATE PANEL (when builder is empty - checklist 3️⃣)
.empty-state-panel {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 300px;
  padding: 40px;
  background: linear-gradient(145deg, rgba(26, 32, 53, 0.5), rgba(21, 24, 40, 0.5));
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 12px;
  margin-bottom: 20px;
}

.empty-state-content {
  text-align: center;
}

.empty-state-icon {
  font-size: 48px;
  display: block;
  margin-bottom: 16px;
  opacity: 0.6;
}

.empty-state-title {
  font-family: 'Outfit', $font-primary;
  font-size: 18px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.8);
  margin: 0 0 8px 0;
}

.empty-state-text {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.5);
  margin: 0;
}

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
  &.faster { color: $accent-success; text-shadow: 0 0 8px rgba($accent-success, 0.4); }
  &.ontarget { color: $accent-success; text-shadow: 0 0 8px rgba($accent-success, 0.4); }
  &.close { color: $accent-warning; }
  &.margin { color: #f97316; }
  &.far { color: #ef4444; }
}
// Inline delta (for column layout)
.tc-delta-inline {
  font-family: 'JetBrains Mono', monospace; font-size: 14px; font-weight: 700;
  &.faster { color: $accent-success; }
  &.ontarget { color: $accent-success; }
  &.close { color: $accent-warning; }
  &.margin { color: #f97316; }
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
  position: relative;
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
.tc-cons-count {
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px; font-weight: 700; color: #fff;
  white-space: nowrap;
}
.tc-cons-bar-wide {
  flex: 1; height: 12px; max-width: 140px;
  background: rgba(255,255,255,0.08);
  border-radius: 6px;
  overflow: hidden;
}
.tc-cons-fill {
  height: 100%; border-radius: 6px;
  transition: width 0.3s ease;
  &--target { background: linear-gradient(90deg, #3b82f6, #60a5fa); }
}
.tc-cons-pct {
  font-family: 'JetBrains Mono', monospace;
  font-size: 14px; font-weight: 700; color: #3b82f6;
}
// Target time display
.tc-target-time {
  display: flex; align-items: center; gap: 8px;
  margin-top: 6px;
}
.tc-target-label {
  font-size: 10px; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.5px;
  color: rgba(255,255,255,0.5);
}
.tc-target-value {
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px; font-weight: 600;
  color: #10b981;
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
.chart-wrap { height: 400px; background: rgba(0,0,0,0.25); border-radius: 8px; padding: 12px; }

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
.laps-table td { padding: 10px 12px; border-bottom: 1px solid rgba(255,255,255,0.04); color: #fff; } // Bright white for active rows
.laps-table .time { font-family: 'JetBrains Mono', monospace; color: #fff; font-weight: 600; }

// Delta column with colored badge-style backgrounds
.laps-table .delta { 
  font-family: 'JetBrains Mono', monospace;
  font-weight: 600;
  font-size: 10px;
  margin-top: 8px;
  
  // Wrapper styling - badge appearance
  span, & {
    display: inline-block;
    padding: 4px 8px;
    border-radius: 4px;
    min-width: 60px;
    text-align: center;
  }
  
  // Green: faster than target
  &.delta--faster, &.delta--ontarget {
    background: rgba(16, 185, 129, 0.15);
    color: #10b981;
    border: 1px solid rgba(16, 185, 129, 0.25);
  }
  
  // Yellow: close to target
  &.delta--close {
    background: rgba(234, 179, 8, 0.15);
    color: #eab308;
    border: 1px solid rgba(234, 179, 8, 0.25);
  }
  
  // Orange: within margin
  &.delta--margin {
    background: rgba(249, 115, 22, 0.15);
    color: #f97316;
    border: 1px solid rgba(249, 115, 22, 0.25);
  }
  
  // Red: far from target
  &.delta--far {
    background: rgba(239, 68, 68, 0.15);
    color: #ef4444;
    border: 1px solid rgba(239, 68, 68, 0.25);
  }
}
.laps-table .sector { font-family: 'JetBrains Mono', monospace; font-size: 10px; color: rgba(255,255,255,0.8); }
.laps-table .sector--best { color: #e040fb; font-weight: 700; }
.laps-table tr.lap-best .time { color: #e040fb; font-weight: 700; }
.laps-table .stato { text-align: center; }

// Badge styles for status column
.badge {
  display: inline-block;
  padding: 2px 6px;
  border-radius: 4px;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.5px;
  text-transform: uppercase;
  
  &--valid {
    background: rgba(16, 185, 129, 0.2);
    color: #10b981;
    border: 1px solid rgba(16, 185, 129, 0.3);
  }
  
  &--invalid {
    background: rgba(239, 68, 68, 0.2);
    color: #ef4444;
    border: 1px solid rgba(239, 68, 68, 0.3);
  }
  
  &--pit {
    background: rgba(245, 158, 11, 0.2);
    color: #f59e0b;
    border: 1px solid rgba(245, 158, 11, 0.3);
  }
}

// PIT lap: muted row appearance
.laps-table tr.lap-pit {
  td { color: rgba(255,255,255,0.5); }
  .time { color: rgba(255,255,255,0.5); }
}

// Excluded lap: very dimmed, appears disabled
.laps-table tr.lap-excluded {
  background: rgba(0,0,0,0.3);
  td { 
    color: rgba(255,255,255,0.25) !important; 
    text-decoration: line-through;
    text-decoration-color: rgba(255,255,255,0.15);
  }
  .time { color: rgba(255,255,255,0.25) !important; }
  .delta { opacity: 0.3; }
}

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

// ========================================
// CHART TOOLBAR
// ========================================

// === HIERARCHY SPACING: Chart Section ===
// Creates visual separation between KPI (Livello 1) and Chart (Livello 2)
.chart-section {
  margin-top: 32px; // Stacco dal blocco KPI sopra
  padding-top: 24px;
  border-top: 1px solid rgba(255,255,255,0.06);
}

// === HIERARCHY SPACING: Laps Table Section ===
// Creates visual separation between Chart (Livello 2) and Table (Livello 3)
.laps-section {
  margin-top: 40px; // Stacco forte dal grafico
  padding-top: 24px;
  border-top: 1px solid rgba(255,255,255,0.08);
}

.chart-header-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.chart-toolbar {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 6px 10px;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px;
}

.toolbar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 6px;
  color: rgba(255,255,255,0.5);
  cursor: pointer;
  transition: all 0.15s;
  
  svg { width: 16px; height: 16px; }
  
  &:hover {
    background: rgba(255,255,255,0.12);
    border-color: rgba(255,255,255,0.2);
    color: #fff;
  }
  
  &--active {
    background: rgba($racing-red, 0.2);
    border-color: rgba($racing-red, 0.4);
    color: $racing-red;
  }
}

.toolbar-divider {
  width: 1px;
  height: 22px;
  background: rgba(255,255,255,0.15);
  margin: 0 4px;
}

// ========================================
// LAP MANAGER PANEL
// ========================================
.lap-manager {
  padding: 16px;
  margin-bottom: 12px;
  background: rgba(255,255,255,0.02);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 10px;
}

.lap-manager-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

// Lap manager sections for A and B
.lap-manager-section {
  &:not(:last-child) {
    margin-bottom: 16px;
    padding-bottom: 16px;
    border-bottom: 1px solid rgba(255,255,255,0.08);
  }

  &--b {
    .lap-manager-title { color: #a78bfa; }
  }
}

.lap-manager-title {
  font-size: 12px;
  font-weight: 600;
  color: rgba(255,255,255,0.7);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.lap-manager-reset {
  padding: 4px 10px;
  background: rgba($racing-red, 0.1);
  border: 1px solid rgba($racing-red, 0.3);
  border-radius: 4px;
  color: $racing-red;
  font-size: 11px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s;
  
  &:hover:not(:disabled) {
    background: rgba($racing-red, 0.2);
  }
  
  &:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }
}

.lap-manager-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.lap-toggle-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  min-width: 36px;
  height: 32px;
  padding: 0 8px;
  background: rgba(59, 130, 246, 0.15);
  border: 1px solid rgba(59, 130, 246, 0.4);
  border-radius: 6px;
  color: #3b82f6;
  font-size: 12px;
  font-weight: 600;
  font-family: 'JetBrains Mono', monospace;
  cursor: pointer;
  transition: all 0.15s;
  
  &:hover {
    background: rgba(59, 130, 246, 0.25);
    transform: scale(1.05);
  }
  
  // Invalid lap
  &--invalid {
    background: rgba(239, 68, 68, 0.15);
    border-color: rgba(239, 68, 68, 0.4);
    color: #ef4444;
  }
  
  // Pit lap
  &--pit {
    background: rgba(107, 114, 128, 0.15);
    border-color: rgba(107, 114, 128, 0.4);
    color: #6b7280;
  }
  
  // Excluded state
  &--excluded {
    background: rgba(255,255,255,0.05);
    border-color: rgba(255,255,255,0.15);
    color: rgba(255,255,255,0.3);
    text-decoration: line-through;
    
    &:hover {
      background: rgba(255,255,255,0.1);
    }
  }
  
  // Stint B buttons (purple)
  &--b {
    background: rgba(139, 92, 246, 0.15);
    border-color: rgba(139, 92, 246, 0.4);
    color: #8b5cf6;
    
    &:hover {
      background: rgba(139, 92, 246, 0.25);
    }
  }
}

.lap-manager-info {
  margin-top: 10px;
  padding-top: 10px;
  border-top: 1px solid rgba(255,255,255,0.08);
  font-size: 11px;
  color: rgba(255,255,255,0.5);
}

// Multi-stint group container
.lap-manager-stint-group {
  margin-bottom: 12px;
  
  &:last-child {
    margin-bottom: 0;
  }
}

.lap-manager-stint-header {
  font-size: 11px;
  font-weight: 600;
  color: rgba(96, 165, 250, 0.9);
  margin-bottom: 6px;
  padding: 4px 8px;
  background: rgba(59, 130, 246, 0.1);
  border-left: 2px solid rgba(59, 130, 246, 0.5);
  border-radius: 0 4px 4px 0;
  
  &--b {
    color: rgba(192, 132, 252, 0.9);
    background: rgba(139, 92, 246, 0.1);
    border-left-color: rgba(139, 92, 246, 0.5);
  }
}

// ========================================
// EXCLUDED TABLE ROW
// ========================================
.laps-table tbody tr.excluded {
  opacity: 0.35;
  
  td {
    background: rgba(255,255,255,0.02) !important;
  }
}

// ========================================
// STINT STATS CARD - Racing Telemetry Style
// ========================================
.stint-stats-card {
  background: linear-gradient(165deg, #12151f 0%, #0d1018 50%, #151821 100%);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 4px;
  margin-bottom: 24px;
  overflow: hidden;
  position: relative;
  box-shadow: 
    0 4px 20px rgba(0,0,0,0.4),
    inset 0 1px 0 rgba(255,255,255,0.05);
  
  // Red racing stripe on left
  &::before {
    content: '';
    position: absolute;
    left: 0;
    top: 0;
    bottom: 0;
    width: 4px;
    background: linear-gradient(180deg, #ef4444 0%, #dc2626 50%, #b91c1c 100%);
  }
}

// Header row - Racing HUD style
.ssc-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 24px 14px 28px;
  background: linear-gradient(90deg, rgba(239,68,68,0.08) 0%, rgba(0,0,0,0.3) 30%, rgba(0,0,0,0.25) 100%);
  border-bottom: 2px solid rgba(239,68,68,0.3);
}
.ssc-header-left {
  display: flex;
  align-items: center;
  gap: 20px;
}
.ssc-condition-text {
  display: flex;
  align-items: center;
  gap: 6px;
}
.ssc-cond-lbl {
  font-size: 10px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: rgba(255,255,255,0.4);
}
.ssc-cond-val {
  font-size: 13px;
  font-weight: 600;
  color: rgba(255,255,255,0.8);
}
.ssc-stint-label {
  font-size: 15px;
  font-weight: 700;
  color: #fff;
  letter-spacing: 0.5px;
}
.ssc-header-divider {
  color: rgba(255,255,255,0.2);
  font-weight: 300;
  margin: 0 4px;
}
.ssc-duration {
  font-size: 14px;
  font-weight: 500;
  color: rgba(255,255,255,0.5);
}
.ssc-duration-label {
  font-size: 13px;
  font-weight: 500;
  color: rgba(255,255,255,0.6);
}
.ssc-header-right {
  display: flex;
  align-items: center;
  gap: 20px;
}
.ssc-condition {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: rgba(255,255,255,0.7);
}
.ssc-cond-icon {
  width: 16px;
  height: 16px;
  stroke: rgba(255,255,255,0.5);
}
.ssc-best-badge {
  padding: 4px 10px;
  background: linear-gradient(135deg, #a855f7, #7c3aed);
  border-radius: 6px;
  font-size: 12px;
  font-weight: 600;
  color: #fff;
}

// Target row
.ssc-target-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 24px;
  background: rgba(0,0,0,0.15);
  border-bottom: 1px solid rgba(255,255,255,0.06);
}
.ssc-target-left {
  display: flex;
  align-items: center;
  gap: 12px;
}
.ssc-target-label {
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: rgba(255,255,255,0.5);
}
.ssc-target-value {
  font-family: 'JetBrains Mono', monospace;
  font-size: 18px;
  font-weight: 700;
  color: #fff;
}

// Target section below table (separated)
.ssc-target-section {
  padding: 16px 24px;
  background: rgba(0,0,0,0.12);
  border-top: 1px solid rgba(255,255,255,0.08);
}
.ssc-target-row-bottom {
  display: flex;
  align-items: center;
  gap: 14px;
}
.ssc-badge {
  padding: 5px 12px;
  border-radius: 6px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1px;
  
  &--race {
    background: rgba(59, 130, 246, 0.2);
    color: #60a5fa;
    border: 1px solid rgba(59, 130, 246, 0.3);
  }
  &--quali {
    background: rgba(234, 179, 8, 0.2);
    color: #fbbf24;
    border: 1px solid rgba(234, 179, 8, 0.3);
  }
}

// Data table - Racing HUD
.ssc-table {
  padding: 20px 28px;
}
.ssc-table-header {
  display: grid;
  grid-template-columns: 95px 1fr 1fr 100px;
  gap: 12px;
  padding: 0 0 12px 0;
  border-bottom: 2px solid rgba(239,68,68,0.2);
  margin-bottom: 8px;
}
.ssc-th {
  font-size: 12px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 1px;
  color: rgba(255,255,255,0.85);
}
.ssc-th--theo {
  display: flex;
  align-items: center;
  gap: 6px;
}
.theo-info {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 16px;
  height: 16px;
  font-size: 11px;
  font-weight: 700;
  background: rgba(239,68,68,0.3);
  color: rgba(255,255,255,0.9);
  border-radius: 50%;
  cursor: help;
  transition: all 0.2s ease;
  
  &:hover {
    background: rgba(239,68,68,0.6);
    transform: scale(1.1);
  }
}
.ssc-table-row {
  display: grid;
  grid-template-columns: 95px 1fr 1fr 100px;
  gap: 12px;
  padding: 10px 0;
  border-bottom: 1px solid rgba(255,255,255,0.04);
  transition: background 0.15s ease;
  align-items: center;
  
  &:hover {
    background: rgba(239,68,68,0.03);
  }
  
  &:last-child {
    border-bottom: none;
  }
}
.ssc-td {
  display: flex;
  align-items: center;
  
  &--label {
    font-size: 11px;
    font-weight: 800;
    color: rgba(255,255,255,0.7);
    text-transform: uppercase;
    letter-spacing: 1px;
  }
  &--value {
    font-family: 'JetBrains Mono', monospace;
    font-size: 17px;
    font-weight: 700;
    color: #fff;
    text-shadow: 0 0 20px rgba(255,255,255,0.1);
  }
  &--warning {
    font-size: 11px;
    font-weight: 600;
    color: rgba(234, 179, 8, 0.8);
    text-shadow: none;
  }
  &--theo {
    color: rgba(255,255,255,0.5);
    font-size: 15px;
  }
  &--laps {
    font-size: 13px;
    font-weight: 700;
    color: #fff;
  }
  &--compact {
    font-family: 'JetBrains Mono', monospace;
    font-size: 13px;
    font-weight: 600;
    color: #fff;
  }
}
.compact-sep {
  color: rgba(255,255,255,0.3);
  margin: 0 6px;
}
// Stint separator for multi-stint comparison - sim racing style
.ssc-stint-separator {
  display: grid;
  grid-template-columns: 80px 1fr 1fr 80px;
  align-items: center;
  padding: 10px 0 8px;
  margin-top: 16px;
  background: linear-gradient(90deg, rgba(59,130,246,0.15) 0%, rgba(59,130,246,0.05) 50%, transparent 100%);
  border-left: 3px solid rgba(59,130,246,0.8);
  position: relative;
  
  span {
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
    letter-spacing: 1.5px;
    color: rgba(59,130,246,0.9);
    padding-left: 12px;
  }
  
  // Show which strategy has this stint
  &::after {
    content: '';
    position: absolute;
    right: 0;
    top: 0;
    bottom: 0;
    width: 50%;
    background: linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.02) 100%);
    pointer-events: none;
  }
  
  &--total {
    background: linear-gradient(90deg, rgba(245,158,11,0.15) 0%, rgba(245,158,11,0.05) 50%, transparent 100%);
    border-left: 3px solid rgba(245,158,11,0.8);
    margin-top: 20px;
    
    span {
      color: rgba(245,158,11,0.95);
      font-size: 10px;
    }
    
    &::after {
      display: none;
    }
  }
}
.ssc-table-row--total {
  .ssc-td--value {
    font-size: 18px;
    color: rgba(245,158,11,0.95);
    font-weight: 800;
  }
}
// Duration unit label (min)
.duration-unit {
  font-size: 10px;
  font-weight: 600;
  color: rgba(255,255,255,0.4);
  margin-left: 4px;
  text-transform: lowercase;
}
// Fixed width for delta boxes
.ssc-delta {
  font-family: 'JetBrains Mono', monospace;
  font-size: 14px;
  font-weight: 700;
  padding: 3px 10px;
  border-radius: 4px;
  background: transparent;
  min-width: 70px;
  text-align: center;
  display: inline-block;
  
  &.faster, &.ontarget {
    color: $accent-success;
    border: 1px solid rgba($accent-success, 0.5);
  }
  &.close {
    color: #eab308;
    border: 1px solid rgba(234, 179, 8, 0.5);
  }
  &.margin {
    color: #f97316;
    border: 1px solid rgba(249, 115, 22, 0.5);
  }
  &.far {
    color: #ef4444;
    border: 1px solid rgba(239, 68, 68, 0.5);
  }
  &--na, &--empty {
    color: rgba(255,255,255,0.3);
    border: 1px solid rgba(255,255,255,0.1);
    min-width: 70px;
  }
}

// Progress section
.ssc-progress-section {
  padding: 12px 24px;
  background: rgba(0,0,0,0.1);
  border-top: 1px solid rgba(255,255,255,0.06);
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ssc-progress-row {
  display: flex;
  align-items: center;
  gap: 16px;
}
.ssc-progress-label {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 160px;
}
.ssc-progress-title {
  font-size: 12px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: rgba(255,255,255,0.7);
}
.ssc-progress-count {
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
  font-weight: 600;
  color: #fff;
}
.ssc-progress-bar {
  flex: 1;
  height: 6px;
  max-width: 200px;
  background: rgba(255,255,255,0.08);
  border-radius: 3px;
  overflow: hidden;
  display: flex;
}
.ssc-progress-fill {
  height: 100%;
  border-radius: 5px;
  transition: width 0.3s ease;
  
  &--valid {
    background: #10b981;
  }
}
.ssc-progress-invalid {
  height: 100%;
  background: rgba(239, 68, 68, 0.4);
}
.ssc-progress-pct {
  font-family: 'JetBrains Mono', monospace;
  font-size: 14px;
  font-weight: 700;
  min-width: 50px;
  text-align: right;
}
.ssc-invalid-tag {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 12px;
  color: #ef4444;
  margin-left: auto;
}
.ssc-invalid-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: #ef4444;
}

// Layout Mode Switcher Buttons
.layout-switcher {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 4px;
  z-index: 10;
}
.layout-btn {
  width: 24px;
  height: 24px;
  border: 1px solid rgba(255,255,255,0.15);
  background: rgba(0,0,0,0.3);
  color: rgba(255,255,255,0.5);
  font-size: 11px;
  font-weight: 600;
  border-radius: 4px;
  cursor: pointer;
  transition: all 0.15s ease;
  
  &:hover {
    background: rgba(255,255,255,0.1);
    color: rgba(255,255,255,0.8);
  }
  &.active {
    background: rgba(139, 92, 246, 0.3);
    border-color: rgba(139, 92, 246, 0.6);
    color: #a78bfa;
  }
}

// Racing Theme Switcher
.racing-theme-switcher {
  position: absolute;
  top: 8px;
  right: 8px;
  display: flex;
  gap: 4px;
  z-index: 10;
}
.theme-btn {
  width: 16px;
  height: 16px;
  border: 2px solid rgba(255,255,255,0.2);
  border-radius: 50%;
  cursor: pointer;
  transition: all 0.15s ease;
  
  &:hover {
    transform: scale(1.2);
    border-color: rgba(255,255,255,0.5);
  }
  &.active {
    border-color: #fff;
    box-shadow: 0 0 8px currentColor;
  }
  
  &--red { background: linear-gradient(135deg, #ef4444, #dc2626); }
  &--gold { background: linear-gradient(135deg, #f59e0b, #d97706); }
  &--lime { background: linear-gradient(135deg, #84cc16, #65a30d); }
  &--cyan { background: linear-gradient(135deg, #06b6d4, #0891b2); }
  &--orange { background: linear-gradient(135deg, #f97316, #ea580c); }
  &--purple { background: linear-gradient(135deg, #a855f7, #9333ea); }
  &--blue { background: linear-gradient(135deg, #3b82f6, #2563eb); }
  &--white { background: linear-gradient(135deg, #f8fafc, #e2e8f0); }
}

// ═══════════════════════════════════════════
// RACING THEME VARIANTS
// ═══════════════════════════════════════════

// RED Theme (Default - Ferrari/F1 style)
.racing-theme--red {
  &::before {
    background: linear-gradient(180deg, #ef4444 0%, #dc2626 50%, #b91c1c 100%);
  }
  .ssc-header {
    background: linear-gradient(90deg, rgba(239,68,68,0.08) 0%, rgba(0,0,0,0.3) 30%, rgba(0,0,0,0.25) 100%);
    border-bottom-color: rgba(239,68,68,0.3);
  }
  .ssc-table-header {
    border-bottom-color: rgba(239,68,68,0.2);
  }
  .ssc-th {
    color: rgba(239,68,68,0.7);
  }
  .ssc-table-row:hover {
    background: rgba(239,68,68,0.03);
  }
}

// GOLD Theme (GT/Lamborghini style)
.racing-theme--gold {
  &::before {
    background: linear-gradient(180deg, #f59e0b 0%, #d97706 50%, #b45309 100%);
  }
  .ssc-header {
    background: linear-gradient(90deg, rgba(245,158,11,0.08) 0%, rgba(0,0,0,0.3) 30%, rgba(0,0,0,0.25) 100%);
    border-bottom-color: rgba(245,158,11,0.35);
  }
  .ssc-table-header {
    border-bottom-color: rgba(245,158,11,0.25);
  }
  .ssc-table-row:hover {
    background: rgba(245,158,11,0.03);
  }
}

// LIME Theme (Monster/Kawasaki style)
.racing-theme--lime {
  &::before {
    background: linear-gradient(180deg, #84cc16 0%, #65a30d 50%, #4d7c0f 100%);
  }
  .ssc-header {
    background: linear-gradient(90deg, rgba(132,204,22,0.06) 0%, rgba(0,0,0,0.3) 30%, rgba(0,0,0,0.25) 100%);
    border-bottom-color: rgba(132,204,22,0.35);
  }
  .ssc-table-header {
    border-bottom-color: rgba(132,204,22,0.25);
  }
  .ssc-th {
    color: rgba(132,204,22,0.75);
  }
  .ssc-table-row:hover {
    background: rgba(132,204,22,0.03);
  }
}

// CYAN Theme (Cyber/Futuristic racing)
.racing-theme--cyan {
  &::before {
    background: linear-gradient(180deg, #06b6d4 0%, #0891b2 50%, #0e7490 100%);
  }
  .ssc-header {
    background: linear-gradient(90deg, rgba(6,182,212,0.06) 0%, rgba(0,0,0,0.3) 30%, rgba(0,0,0,0.25) 100%);
    border-bottom-color: rgba(6,182,212,0.35);
  }
  .ssc-table-header {
    border-bottom-color: rgba(6,182,212,0.25);
  }
  .ssc-th {
    color: rgba(6,182,212,0.75);
  }
  .ssc-table-row:hover {
    background: rgba(6,182,212,0.03);
  }
}

// ORANGE Theme (McLaren/KTM style)
.racing-theme--orange {
  &::before {
    background: linear-gradient(180deg, #f97316 0%, #ea580c 50%, #c2410c 100%);
  }
  .ssc-header {
    background: linear-gradient(90deg, rgba(249,115,22,0.08) 0%, rgba(0,0,0,0.3) 30%, rgba(0,0,0,0.25) 100%);
    border-bottom-color: rgba(249,115,22,0.35);
  }
  .ssc-table-header {
    border-bottom-color: rgba(249,115,22,0.25);
  }
  .ssc-th {
    color: rgba(249,115,22,0.75);
  }
  .ssc-table-row:hover {
    background: rgba(249,115,22,0.03);
  }
}

// PURPLE Theme (Porsche/Infiniti style)
.racing-theme--purple {
  &::before {
    background: linear-gradient(180deg, #a855f7 0%, #9333ea 50%, #7e22ce 100%);
  }
  .ssc-header {
    background: linear-gradient(90deg, rgba(168,85,247,0.06) 0%, rgba(0,0,0,0.3) 30%, rgba(0,0,0,0.25) 100%);
    border-bottom-color: rgba(168,85,247,0.35);
  }
  .ssc-table-header {
    border-bottom-color: rgba(168,85,247,0.25);
  }
  .ssc-th {
    color: rgba(168,85,247,0.75);
  }
  .ssc-table-row:hover {
    background: rgba(168,85,247,0.03);
  }
}

// BLUE Theme (Alpine/Subaru style)
.racing-theme--blue {
  &::before {
    background: linear-gradient(180deg, #3b82f6 0%, #2563eb 50%, #1d4ed8 100%);
  }
  .ssc-header {
    background: linear-gradient(90deg, rgba(59,130,246,0.06) 0%, rgba(0,0,0,0.3) 30%, rgba(0,0,0,0.25) 100%);
    border-bottom-color: rgba(59,130,246,0.35);
  }
  .ssc-table-header {
    border-bottom-color: rgba(59,130,246,0.25);
  }
  .ssc-th {
    color: rgba(59,130,246,0.75);
  }
  .ssc-table-row:hover {
    background: rgba(59,130,246,0.03);
  }
}

// WHITE Theme (Mercedes/Audi style)
.racing-theme--white {
  &::before {
    background: linear-gradient(180deg, #f8fafc 0%, #e2e8f0 50%, #cbd5e1 100%);
  }
  .ssc-header {
    background: linear-gradient(90deg, rgba(248,250,252,0.06) 0%, rgba(0,0,0,0.3) 30%, rgba(0,0,0,0.25) 100%);
    border-bottom-color: rgba(248,250,252,0.25);
  }
  .ssc-table-header {
    border-bottom-color: rgba(248,250,252,0.15);
  }
  .ssc-th {
    color: rgba(248,250,252,0.7);
  }
  .ssc-table-row:hover {
    background: rgba(248,250,252,0.03);
  }
}

// ═══════════════════════════════════════════
// LAYOUT 1: Perfect Layout (Hybrid)
// ═══════════════════════════════════════════
.perfect-layout-body {
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.perfect-compare-row {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 12px;
  background: rgba(0,0,0,0.2);
  border-radius: 6px;
  border: 1px solid rgba(255,255,255,0.06);
}
.perfect-metric-label {
  font-size: 11px;
  font-weight: 700;
  color: rgba(255,255,255,0.6);
  text-transform: uppercase;
  min-width: 40px;
}
.perfect-metric-value {
  font-family: 'JetBrains Mono', monospace;
  font-size: 16px;
  font-weight: 700;
  color: #fff;
  min-width: 80px;
}
.perfect-vs-label {
  font-size: 10px;
  font-weight: 500;
  color: rgba(255,255,255,0.4);
  font-style: italic;
}
.perfect-theo-value {
  font-family: 'JetBrains Mono', monospace;
  font-size: 14px;
  color: rgba(255,255,255,0.55);
  min-width: 80px;
}
.perfect-arrow {
  font-size: 14px;
  color: rgba(255,255,255,0.35);
  margin: 0 4px;
}
.perfect-delta-label {
  font-size: 12px;
  font-weight: 600;
  color: rgba(255,255,255,0.5);
}
.perfect-target-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 6px 12px;
  border-top: 1px dashed rgba(255,255,255,0.1);
  margin-top: 4px;
}
.perfect-target-value {
  font-family: 'JetBrains Mono', monospace;
  font-size: 14px;
  font-weight: 600;
  color: rgba(255,255,255,0.7);
}
.perfect-footer {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  padding: 10px 16px;
  background: rgba(0,0,0,0.1);
  border-top: 1px solid rgba(255,255,255,0.06);
}
.perfect-progress-item {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
  min-width: 200px;
}
.perfect-progress-label {
  font-size: 10px;
  font-weight: 600;
  color: rgba(255,255,255,0.5);
  text-transform: uppercase;
  min-width: 45px;
}
.perfect-progress-count {
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  font-weight: 600;
  color: rgba(255,255,255,0.7);
  min-width: 35px;
}
.perfect-progress-pct {
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
  font-weight: 700;
  min-width: 40px;
  text-align: right;
}

// ═══════════════════════════════════════════
// LAYOUT 2 (Wireframe A): Side-by-Side Comparison
// ═══════════════════════════════════════════
.layout2-compare {
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.layout2-compare-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 14px;
  background: rgba(0,0,0,0.2);
  border-radius: 8px;
  border: 1px solid rgba(255,255,255,0.06);
}
.layout2-compare-left,
.layout2-compare-right {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 120px;
}
.layout2-compare-label {
  font-size: 10px;
  font-weight: 600;
  color: rgba(255,255,255,0.5);
  text-transform: uppercase;
}
.layout2-compare-value {
  font-family: 'JetBrains Mono', monospace;
  font-size: 18px;
  font-weight: 700;
  color: #fff;
}
.layout2-compare-value--theo {
  color: rgba(255,255,255,0.6);
}
.layout2-compare-arrow {
  font-size: 18px;
  color: rgba(255,255,255,0.3);
  margin: 0 8px;
}
.layout2-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
  padding: 12px 16px;
  background: rgba(0,0,0,0.1);
  border-top: 1px solid rgba(255,255,255,0.06);
}
.layout2-footer-target {
  font-size: 12px;
  font-weight: 600;
  color: rgba(255,255,255,0.7);
}
.layout2-footer-progress {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 11px;
  color: rgba(255,255,255,0.6);
}

// ═══════════════════════════════════════════
// LAYOUT 3 (Wireframe B): Card + Arrow Comparison
// ═══════════════════════════════════════════
.layout3-cards {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 14px 16px;
}
.layout3-cards--secondary {
  padding-top: 0;
}
.layout3-card-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 12px 16px;
  background: rgba(0,0,0,0.25);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px;
  min-width: 110px;
}
.layout3-card-box--theo {
  background: rgba(139, 92, 246, 0.1);
  border-color: rgba(139, 92, 246, 0.25);
}
.layout3-card-box--small {
  padding: 8px 12px;
  min-width: 95px;
}
.layout3-card-box--small .layout3-card-title {
  font-size: 9px;
}
.layout3-card-box--small .layout3-card-time {
  font-size: 14px;
}
.layout3-card-title {
  font-size: 10px;
  font-weight: 600;
  color: rgba(255,255,255,0.5);
  text-transform: uppercase;
  margin-bottom: 4px;
}
.layout3-card-time {
  font-family: 'JetBrains Mono', monospace;
  font-size: 17px;
  font-weight: 700;
  color: #fff;
}
.layout3-arrow {
  font-size: 14px;
  color: rgba(255,255,255,0.35);
  letter-spacing: -2px;
}
.layout3-arrow--small {
  font-size: 11px;
}
.layout3-delta-box {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  min-width: 70px;
}
.layout3-delta-label {
  font-size: 9px;
  font-weight: 600;
  color: rgba(255,255,255,0.4);
  text-transform: uppercase;
}
.layout3-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
  padding: 10px 16px;
  background: rgba(0,0,0,0.1);
  border-top: 1px solid rgba(255,255,255,0.06);
  font-size: 11px;
  color: rgba(255,255,255,0.6);
}

// ═══════════════════════════════════════════
// LAYOUT 4 (Wireframe C): Vertical Two-Column
// ═══════════════════════════════════════════
.layout4-columns {
  display: flex;
  gap: 16px;
  padding: 14px 16px;
  justify-content: center;
}
.layout4-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 14px 20px;
  background: rgba(0,0,0,0.2);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 10px;
  min-width: 150px;
}
.layout4-col-header {
  font-size: 11px;
  font-weight: 700;
  color: rgba(255,255,255,0.6);
  text-transform: uppercase;
  letter-spacing: 1px;
  margin-bottom: 10px;
  padding-bottom: 6px;
  border-bottom: 1px solid rgba(255,255,255,0.1);
  width: 100%;
  text-align: center;
}
.layout4-col-row {
  display: flex;
  justify-content: space-between;
  width: 100%;
  gap: 10px;
  padding: 4px 0;
}
.layout4-col-label {
  font-size: 11px;
  color: rgba(255,255,255,0.5);
}
.layout4-col-value {
  font-family: 'JetBrains Mono', monospace;
  font-size: 14px;
  font-weight: 700;
  color: #fff;
}
.layout4-col-value--theo {
  color: rgba(255,255,255,0.55);
}
.layout4-col-separator {
  font-size: 16px;
  color: rgba(255,255,255,0.3);
  margin: 4px 0;
}
.layout4-col-delta {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding-top: 8px;
  border-top: 1px solid rgba(255,255,255,0.08);
  width: 100%;
  justify-content: center;
}
.layout4-col-delta-label {
  font-size: 10px;
  font-weight: 600;
  color: rgba(255,255,255,0.5);
  text-transform: uppercase;
}
.layout4-footer {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 20px;
  padding: 10px 16px;
  background: rgba(0,0,0,0.1);
  border-top: 1px solid rgba(255,255,255,0.06);
  font-size: 11px;
  color: rgba(255,255,255,0.6);
}
.layout4-footer-progress {
  display: flex;
  align-items: center;
  gap: 6px;
}

// ═══════════════════════════════════════════
// LAYOUT 5 (Wireframe D): Diff Style Comparison
// ═══════════════════════════════════════════
.layout5-diff {
  padding: 12px 16px;
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.layout5-diff-section {
  background: rgba(0,0,0,0.2);
  border: 1px solid rgba(255,255,255,0.08);
  border-radius: 8px;
  padding: 12px;
}
.layout5-diff-title {
  font-size: 10px;
  font-weight: 700;
  color: rgba(255,255,255,0.5);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  margin-bottom: 8px;
  padding-bottom: 6px;
  border-bottom: 1px dashed rgba(255,255,255,0.1);
}
.layout5-diff-line {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 4px 8px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
  border-radius: 4px;
  margin: 2px 0;
}
.layout5-diff-line--minus {
  background: rgba(239, 68, 68, 0.1);
  border-left: 3px solid rgba(239, 68, 68, 0.5);
}
.layout5-diff-line--plus {
  background: rgba(16, 185, 129, 0.1);
  border-left: 3px solid rgba(16, 185, 129, 0.5);
}
.layout5-diff-prefix {
  font-weight: 700;
  font-size: 14px;
  min-width: 16px;
}
.layout5-diff-line--minus .layout5-diff-prefix {
  color: #ef4444;
}
.layout5-diff-line--plus .layout5-diff-prefix {
  color: #10b981;
}
.layout5-diff-label {
  color: rgba(255,255,255,0.6);
  min-width: 110px;
}
.layout5-diff-value {
  font-weight: 600;
  color: #fff;
}
.layout5-diff-result {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 8px;
  padding: 6px 10px;
  background: rgba(255,255,255,0.03);
  border-radius: 4px;
  font-size: 13px;
}
.layout5-diff-status {
  font-size: 11px;
  color: rgba(255,255,255,0.4);
  font-style: italic;
}
.layout5-footer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 16px;
  padding: 10px 16px;
  background: rgba(0,0,0,0.1);
  border-top: 1px solid rgba(255,255,255,0.06);
  font-size: 11px;
  color: rgba(255,255,255,0.6);
}
.layout5-footer-bars {
  display: flex;
  align-items: center;
  gap: 10px;
  flex: 1;
}

// Toggle button
.ssc-toggles {
  margin-left: 12px;
}
.ssc-toggle {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  cursor: pointer;
  
  input {
    display: none;
    
    &:checked + .ssc-toggle-slider {
      background: $accent-success;
      
      &::after {
        transform: translateX(14px);
      }
    }
  }
}
.ssc-toggle-slider {
  position: relative;
  width: 32px;
  height: 18px;
  background: rgba(255,255,255,0.2);
  border-radius: 9px;
  transition: background 0.2s;
  
  &::after {
    content: '';
    position: absolute;
    top: 2px;
    left: 2px;
    width: 14px;
    height: 14px;
    background: #fff;
    border-radius: 50%;
    transition: transform 0.2s;
  }
}

// ========================================
// BUILDER PANEL - Sticky header for strategy configuration
// ========================================
.builder-panel {
  position: sticky;
  top: 0;
  z-index: 10;
  background: rgba(25, 25, 35, 0.95);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 8px;
  padding: 16px 18px;
  margin-bottom: 32px;
  overflow: hidden;
}

.builder-panel-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 14px;
  // Altezza fissa per combo button
  min-height: 26px;
}

.builder-panel-title {
  font-size: 10px; // Più piccolo
  font-weight: 500; // Meno bold
  color: rgba(255,255,255,0.4); // Più tenue
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

// Combo Status/Reset Button - Option 5
.builder-combo-btn {
  background: rgba(239, 68, 68, 0.1);
  border: 1px solid rgba(239, 68, 68, 0.2);
  border-radius: 4px;
  color: #ef4444;
  font-size: 11px;
  padding: 4px 10px;
  cursor: pointer;
  transition: all 0.15s ease;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  
  &:hover {
    background: rgba(239, 68, 68, 0.2);
    border-color: rgba(239, 68, 68, 0.4);
  }
  
  // Stato attivo - verde con status
  &--active {
    background: rgba(34, 197, 94, 0.1);
    border-color: rgba(34, 197, 94, 0.3);
    color: #22c55e;
    
    .combo-status {
      font-weight: 600;
    }
    
    .combo-divider {
      color: rgba(34, 197, 94, 0.4);
      margin: 0 2px;
    }
    
    .combo-reset {
      color: rgba(255,255,255,0.5);
      font-size: 13px;
      
      &:hover {
        color: #ef4444;
      }
    }
    
    &:hover {
      background: rgba(34, 197, 94, 0.15);
      border-color: rgba(34, 197, 94, 0.5);
    }
  }
}

.builder-slot {
  display: flex;
  align-items: center;
  gap: 14px;
  padding: 10px 0;
  min-height: 45px;
  
  &:not(:last-child) {
    border-bottom: 1px solid rgba(255,255,255,0.05);
  }
}

.builder-slot-label {
  width: 20px;
  font-weight: 700;
  font-size: 13px;
  text-align: center;
}

.builder-slot--a .builder-slot-label { color: #3b82f6; }
.builder-slot--b .builder-slot-label { color: #a855f7; }

.builder-slot--a{
  padding-top: 0px;
}

.builder-slot--b{
  padding-bottom: 0px;
}

.builder-slot-content {
  display: flex;
  align-items: center;
  gap: 6px;
  flex: 1;
  flex-wrap: wrap;
  // Altezza fissa per evitare shift quando chip sostituisce testo
  min-height: 24px;
}

.builder-slot-empty {
  color: rgba(255,255,255,0.35);
  font-style: italic;
  font-size: 12px;
  // Altezza linea fissa per allinearsi con le chip
  line-height: 24px;
}

.builder-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 5px 5px 5px 10px;
  border-radius: 4px;
  font-size: 12px;
  font-weight: 600;
  font-family: 'JetBrains Mono', monospace;
  // Altezza fissa uguale a placeholder per evitare micro-shift
  height: 24px;
  box-sizing: border-box;
}

.builder-chip--a1, .builder-chip--a2 {
  background: rgba(59, 130, 246, 0.12); // Meno saturo
  color: rgba(96, 165, 250, 0.85);
  border: 1px solid rgba(59, 130, 246, 0.2);
}

.builder-chip--b1, .builder-chip--b2 {
  background: rgba(168, 85, 247, 0.12); // Meno saturo
  color: rgba(192, 132, 252, 0.85);
  border: 1px solid rgba(168, 85, 247, 0.2);
}

.chip-remove {
  background: none;
  border: none;
  color: inherit;
  cursor: pointer;
  padding: 0 2px;
  font-size: 14px;
  opacity: 0.6;
  line-height: 1;
  transition: opacity 0.15s;
  
  &:hover {
    opacity: 1;
  }
}

// ========================================
// CROSS-SESSION HEADERS
// ========================================
.cross-session-section {
  margin-bottom: 24px; // Aumentato per separare Questa Sessione da Altra Sessione
}

.cross-session-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 8px 10px;
  border-radius: 6px;
  margin-bottom: 6px;
  font-size: 11px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  
  &--a {
    background: rgba(59, 130, 246, 0.1);
    border: 1px solid rgba(59, 130, 246, 0.2);
    color: #60a5fa;
  }
  
  &--b {
    background: rgba(168, 85, 247, 0.1);
    border: 1px solid rgba(168, 85, 247, 0.2);
    color: #c084fc;
  }
}

.cross-session-label {
  font-size: 11px;
}

.cross-session-close {
  background: rgba(255,255,255,0.1);
  border: 1px solid rgba(255,255,255,0.15);
  border-radius: 4px;
  color: rgba(255,255,255,0.7);
  font-size: 14px;
  width: 24px;
  height: 24px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
  
  &:hover {
    background: rgba(239, 68, 68, 0.3);
    border-color: rgba(239, 68, 68, 0.5);
    color: #ef4444;
  }
}

.cross-session-date {
  font-size: 10px;
  font-weight: 400;
  opacity: 0.6;
  text-transform: none;
  letter-spacing: 0;
}

// ========================================
// BUILDER MODE - Stint list with [+] buttons
// ========================================
.stint-list--builder {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.stint-item--builder {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 6px;
  cursor: pointer;
  transition: all 0.15s ease;
  
  &:hover {
    background: rgba(255,255,255,0.06);
    border-color: rgba(255,255,255,0.1);
  }
  
  &.builder-selected {
    background: rgba(59, 130, 246, 0.12);
    border-color: rgba(59, 130, 246, 0.3);
    border-left: 3px solid #3b82f6;
  }
  
  &.builder-selected-a {
    background: rgba(59, 130, 246, 0.12);
    border-color: rgba(59, 130, 246, 0.3);
    border-left: 3px solid #3b82f6;
  }
  
  &.builder-selected-b {
    background: rgba(168, 85, 247, 0.12);
    border-color: rgba(168, 85, 247, 0.3);
    border-left: 3px solid #a855f7;
  }
  
  &.stint-item--b.builder-selected {
    background: rgba(168, 85, 247, 0.12);
    border-color: rgba(168, 85, 247, 0.3);
    border-left-color: #a855f7;
  }
  
  // Currently viewing in detail panel (not in builder)
  &.viewing:not(.builder-selected):not(.builder-selected-a):not(.builder-selected-b) {
    background: rgba(255,255,255,0.08);
    border-color: rgba(255,255,255,0.15);
  }
}

.stint-add-btn {
  width: 32px;
  height: 24px;
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 4px;
  background: rgba(255,255,255,0.05);
  color: rgba(255,255,255,0.7);
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  font-family: 'JetBrains Mono', monospace;
  
  &--a {
    border-color: rgba(59, 130, 246, 0.3);
    color: #60a5fa;
    
    &:hover:not(:disabled) {
      background: #3b82f6;
      color: white;
      border-color: #3b82f6;
    }
  }
  
  &--b {
    border-color: rgba(168, 85, 247, 0.3);
    color: #c084fc;
    
    &:hover:not(:disabled) {
      background: #a855f7;
      color: white;
      border-color: #a855f7;
    }
  }
  
  &:disabled {
    opacity: 0.2;
    cursor: not-allowed;
    
    // Slightly increase visibility on hover so tooltip is easier to see
    &:hover {
      opacity: 0.35;
    }
  }
}

// Icon slot for trophy/warning (fixed width for alignment)
.stint-icon-slot {
  width: 20px;
  text-align: center;
  font-size: 14px;
  flex-shrink: 0;
}

// Laps display - reduced visual weight per UX audit
.stint-laps {
  font-size: 11px;
  color: rgba(255,255,255,0.4); // Più tenue
  white-space: nowrap;
}

// Type badge (Race/Qualifying) - using site colors with border
.stint-type {
  font-size: 11px;
  font-weight: 600;
  padding: 4px 10px;
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  
  // Race = rosso
  &--r {
    background: rgba(239, 68, 68, 0.15);
    color: #ef4444;
    border: 1px solid rgba(239, 68, 68, 0.4);
  }
  
  // Quali = giallo
  &--q {
    background: rgba(234, 179, 8, 0.15);
    color: #fbbf24;
    border: 1px solid rgba(234, 179, 8, 0.4);
  }
}

// Stint number - secondary
.stint-num {
  font-size: 11px;
  font-weight: 600;
  color: rgba(255,255,255,0.5);
}

// Best stint emoji 🏆
.stint-best-pill {
  font-size: 14px;
  line-height: 1;
}

// Empty placeholder for non-best stints (keeps alignment)
.stint-best-icon {
  width: 32px; // Same as BEST pill
}

// Delta display (compact, no label)
.stint-delta {
  margin-left: auto;
  font-family: 'JetBrains Mono', monospace;
  font-size: 11px;
  font-weight: 600;
  padding: 2px 6px;
  border-radius: 4px;
  
  // Green: on target (perfect)
  &.delta--ontarget {
    background: rgba(16, 185, 129, 0.15);
    color: #10b981;
  }
  
  // Yellow/Gold: close to target
  &.delta--close {
    background: rgba(234, 179, 8, 0.15);
    color: #eab308;
  }
  
  // Orange: margin (mid range)
  &.delta--margin {
    background: rgba(249, 115, 22, 0.15);
    color: #f97316;
  }
  
  // Red: far from target
  &.delta--far {
    background: rgba(239, 68, 68, 0.15);
    color: #ef4444;
  }
}

// ========================================
// ALTRA SESSIONE BUTTON - Inviting CTA per UX audit
// ========================================
.altra-sessione-btn {
  width: 100%;
  padding: 14px 16px;
  margin-top: 32px;
  background: rgba(255, 255, 255, 0.04);
  border: 2px dashed rgba(255, 255, 255, 0.35);
  border-radius: 6px;
  color: #fff;
  font-size: 13px;
  font-weight: 700;
  text-align: center;
  cursor: pointer;
  transition: all 0.15s ease;
  
  &:hover {
    border-color: rgba(255, 255, 255, 0.5);
    background: rgba(255, 255, 255, 0.08);
  }
}

// ========================================
// COMPARISON TABLE - Side-by-side A vs B
// ========================================
.laps-table--compare {
  // Column coloring for A (blue) and B (purple)
  .col-a {
    background: rgba(59, 130, 246, 0.06);
    border-left: 1px solid rgba(59, 130, 246, 0.15);
    border-right: 1px solid rgba(59, 130, 246, 0.15);
  }
  
  .col-b {
    background: rgba(168, 85, 247, 0.06);
    border-left: 1px solid rgba(168, 85, 247, 0.15);
    border-right: 1px solid rgba(168, 85, 247, 0.15);
  }
  
  .col-index {
    text-align: center;
    width: 36px;
    color: rgba(255, 255, 255, 0.4);
    font-size: 11px;
  }
  
  .col-delta {
    text-align: center;
    font-weight: 600;
    width: 70px;
    background: rgba(255, 255, 255, 0.02);
  }
  
  thead {
    tr:first-child {
      th.col-a {
        background: rgba(59, 130, 246, 0.15);
        color: #60a5fa;
        font-weight: 700;
        border-bottom: 2px solid rgba(59, 130, 246, 0.4);
      }
      
      th.col-b {
        background: rgba(168, 85, 247, 0.15);
        color: #c084fc;
        font-weight: 700;
        border-bottom: 2px solid rgba(168, 85, 247, 0.4);
      }
      
      th.col-delta {
        background: rgba(255, 255, 255, 0.05);
        color: rgba(255, 255, 255, 0.7);
      }
    }
    
    .sub-header {
      th {
        font-size: 9px;
        font-weight: 500;
        padding: 4px 6px;
        text-transform: uppercase;
        letter-spacing: 0.5px;
      }
    }
  }
  
  tbody {
    tr {
      &:hover {
        .col-a { background: rgba(59, 130, 246, 0.12); }
        .col-b { background: rgba(168, 85, 247, 0.12); }
      }
    }
    
    td {
      font-size: 12px;
      padding: 6px 8px;
      
      &.time {
        font-family: 'JetBrains Mono', monospace;
        font-weight: 600;
      }
      
      &.sector {
        font-family: 'JetBrains Mono', monospace;
        font-size: 11px;
        color: rgba(255, 255, 255, 0.6);
      }
    }
  }
}

// Tab styling for Confronto
.lap-tab--compare {
  border-color: rgba(255, 255, 255, 0.3) !important;
  color: rgba(255, 255, 255, 0.7) !important;
  
  &.lap-tab--active {
    background: rgba(255, 255, 255, 0.1) !important;
    border-color: rgba(255, 255, 255, 0.5) !important;
    color: #fff !important;
  }
}

// ═══════════════════════════════════════════
// COMPARE STYLE SWITCHER
// ═══════════════════════════════════════════
.compare-layout {
  position: relative;
}
.compare-style-switcher {
  display: flex;
  justify-content: flex-end;
  gap: 4px;
  margin-bottom: 12px;
  z-index: 10;
}
.style-btn {
  width: 24px;
  height: 24px;
  border: 1px solid rgba(255,255,255,0.2);
  border-radius: 4px;
  background: rgba(0,0,0,0.3);
  color: rgba(255,255,255,0.6);
  font-size: 11px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.15s ease;
  
  &:hover {
    background: rgba(255,255,255,0.1);
    border-color: rgba(255,255,255,0.4);
    color: #fff;
  }
  &.active {
    background: rgba(245,158,11,0.2);
    border-color: rgba(245,158,11,0.6);
    color: #f59e0b;
  }
}

// ═══════════════════════════════════════════
// COMPARE STYLE A: GOLD (Same as single stint)
// ═══════════════════════════════════════════
.compare-style--A {
  position: relative;
  
  .compare-table-wrap {
    position: relative;
    border-radius: 8px;
    overflow: hidden;
    background: rgba(0,0,0,0.35);
    
    &::before {
      content: '';
      position: absolute;
      left: 0;
      top: 0;
      bottom: 0;
      width: 4px;
      background: linear-gradient(180deg, #f59e0b 0%, #d97706 50%, #b45309 100%);
    }
  }
  
  .compare-table {
    background: linear-gradient(90deg, rgba(245,158,11,0.06) 0%, rgba(0,0,0,0.3) 30%, rgba(0,0,0,0.25) 100%);
    
    th {
      font-size: 13px;
      font-weight: 800;
      text-transform: uppercase;
      letter-spacing: 1.5px;
      color: rgba(255,255,255,0.85);
      border-bottom: 2px solid rgba(245,158,11,0.25);
    }
    
    td.metric-value {
      font-size: 18px;
      font-weight: 700;
      color: #fff;
    }
    
    tr:hover {
      background: rgba(245,158,11,0.03);
    }
  }
}

// ═══════════════════════════════════════════
// STINT HEADER ROWS (for multi-stint strategies)
// ═══════════════════════════════════════════
.stint-header-row {
  background: rgba(255, 255, 255, 0.02) !important;
  border-top: 2px solid rgba(255, 255, 255, 0.08);
  
  &:hover {
    background: rgba(255, 255, 255, 0.03) !important;
  }
}

.stint-header-index,
.stint-header-delta {
  background: transparent;
}

.stint-header-cell {
  padding: 10px 12px !important;
  
  &--a {
    background: linear-gradient(90deg, rgba(59, 130, 246, 0.08) 0%, transparent 100%);
    border-bottom: 2px solid rgba(59, 130, 246, 0.3);
  }
  
  &--b {
    background: linear-gradient(270deg, rgba(139, 92, 246, 0.08) 0%, transparent 100%);
    border-bottom: 2px solid rgba(139, 92, 246, 0.3);
  }
}

.stint-header-label {
  font-size: 11px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 1.5px;
  white-space: nowrap;
  
  .stint-header-cell--a & {
    color: #3b82f6;
  }
  
  .stint-header-cell--b & {
    color: #8b5cf6;
  }
}

// ═══════════════════════════════════════════
// STINT NUMBER BADGE (in stint list items)
// ═══════════════════════════════════════════
.stint-number {
  font-size: 11px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.75);
  min-width: 24px;
  text-align: center;
}


</style>

<!-- Global styles for Teleported notification banner -->
<style lang="scss">
// === SHARE NOTIFICATION BANNER (Teleported to body) ===
.share-notification {
  position: fixed;
  top: 80px;
  right: 24px;
  z-index: 99999;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 20px;
  background: rgba(20, 30, 20, 0.95);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(34, 197, 94, 0.5);
  border-radius: 12px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.4), 0 0 20px rgba(34, 197, 94, 0.2);
}

.share-notification-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  background: rgba(34, 197, 94, 0.25);
  border-radius: 50%;
  color: #22c55e;
  font-size: 14px;
  font-weight: 700;
}

.share-notification-text {
  color: #22c55e;
  font-size: 14px;
  font-weight: 600;
}

// Transition animation (slide from right)
.slide-notification-enter-active,
.slide-notification-leave-active {
  transition: all 0.3s ease;
}
.slide-notification-enter-from {
  opacity: 0;
  transform: translateX(30px);
}
.slide-notification-leave-to {
  opacity: 0;
  transform: translateX(30px);
}
</style>

