<script setup lang="ts">
// ============================================
// Pilot Detail View - Coach shadowing a pilot
// ============================================

import { ref, onMounted, computed, watch } from 'vue'
import { doc } from 'firebase/firestore'
import { db } from '~/config/firebase'
import CoachLessonsPanel from '~/components/coach/CoachLessonsPanel.vue'
import { providePilotContext } from '~/composables/usePilotContext'
import { useGameContext } from '~/composables/useGameContext'
import { endFirebaseScenario, startFirebaseScenario, trackedGetDoc } from '~/composables/useFirebaseTracker'
import { provideHeaderBack } from '~/composables/useHeaderBack'
import { formatTrackName } from '~/utils/telemetryFormat'
import { pilotTrail } from '~/utils/pilotTrail'

definePageMeta({
  layout: 'coach',
  middleware: ['coach-or-admin']
})

const route = useRoute()
const { consultedGame } = useGameContext()
const pilotId = route.params.id as string

// Provide pilot context to all child components
// This makes child components load this pilot's data instead of the coach's
providePilotContext(pilotId)

interface PilotData {
  firstName?: string
  lastName?: string
  nickname: string
}

const pilot = ref<PilotData | null>(null)
const isLoading = ref(true)
const activeTab = ref<'panoramica' | 'sessioni' | 'piste' | 'lezioni'>('panoramica')

// Detail view state (inline navigation within pilot context)
const detailView = ref<'none' | 'track' | 'session' | 'stats'>('none')
const selectedTrackId = ref<string | null>(null)
const selectedSessionId = ref<string | null>(null)
watch(consultedGame, () => {
  if (detailView.value === 'track') activeTab.value = 'piste'
  if (detailView.value === 'session') activeTab.value = 'sessioni'
  detailView.value = 'none'; selectedTrackId.value = null; selectedSessionId.value = null
})

// Pilot navigation tabs
const pilotTabs = [
  { id: 'panoramica', label: 'PANORAMICA' },
  { id: 'sessioni', label: 'SESSIONI' },
  { id: 'piste', label: 'PISTE' },
  { id: 'lezioni', label: 'PILOTA' }
]

// Load pilot data
onMounted(async () => {
  const scenarioId = startFirebaseScenario('coach.pilot.detail.open', { pilotId })
  try {
    const snap = await trackedGetDoc(doc(db, 'pilotDirectory', pilotId), 'CoachPilotDetail')
    if (snap.exists()) {
      pilot.value = snap.data() as PilotData
    }
  } catch (e) {
    console.error('Error loading pilot:', e)
  } finally {
    isLoading.value = false
    endFirebaseScenario(scenarioId)
  }
})

// Get display name (firstName + lastName, fallback to nickname)
const pilotName = computed(() => {
  if (pilot.value?.firstName && pilot.value?.lastName) {
    return `${pilot.value.firstName} ${pilot.value.lastName}`
  }
  return pilot.value?.nickname || 'Pilota'
})

// === NAVIGATION HANDLERS ===
// Handle navigation within pilot context (don't leave pilot view)

function handleGoToTrack(trackId: string) {
  selectedTrackId.value = trackId
  selectedSessionId.value = null
  detailView.value = 'track'
}

function handleGoToSession(sessionId: string) {
  selectedSessionId.value = sessionId
  selectedTrackId.value = null
  detailView.value = 'session'
}

// PIP-619: Statistiche of this pilot, inside the pilot context (the route would lose it).
function handleGoToStats() {
  selectedTrackId.value = null
  selectedSessionId.value = null
  detailView.value = 'stats'
}

function goBackToList() {
  detailView.value = 'none'
  selectedTrackId.value = null
  selectedSessionId.value = null
}

// PIP-637: un solo percorso in alto ("Piloti › Enrico Saiani › Sessioni › Sessione") al posto dei bottoni
// "Torna…" sparsi. Le pagine figlie trovano qui il "torna indietro" e non disegnano piu' il loro.
provideHeaderBack()
const trail = computed(() => pilotTrail({
  pilotName: pilotName.value,
  tabLabel: pilotTabs.find(t => t.id === activeTab.value)?.label ?? '',
  detail: detailView.value,
  trackName: selectedTrackId.value ? formatTrackName(selectedTrackId.value) : null,
}))
function goToCrumb(target: 'pilot' | 'tab') {
  if (target === 'pilot') activeTab.value = 'panoramica'
  goBackToList()
}
</script>

<template>
  <div class="pilot-view">
    <!-- Pilot Context Header -->
    <!-- PIP-637: percorso unico a sinistra (il pilota in arancio: stai guardando i suoi dati), gioco a destra. -->
    <div class="pilot-header">
      <nav class="pilot-trail" aria-label="Percorso">
        <template v-for="(crumb, i) in trail" :key="i">
          <span v-if="i" class="pilot-trail__sep" aria-hidden="true">›</span>
          <NuxtLink v-if="crumb.target === 'pilots'" to="/piloti" class="pilot-trail__link">{{ crumb.label }}</NuxtLink>
          <button v-else-if="crumb.target" type="button" class="pilot-trail__link" :class="{ 'pilot-trail__pilot': crumb.target === 'pilot' }" @click="goToCrumb(crumb.target)">
            <svg v-if="crumb.target === 'pilot'" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
            {{ crumb.label }}
          </button>
          <span v-else class="pilot-trail__here" aria-current="page">{{ crumb.label }}</span>
        </template>
      </nav>
      <LayoutGameSelector />
    </div>

    <!-- Pilot Sub-Tabs (hidden when showing detail view) -->
    <nav v-if="detailView === 'none'" class="pilot-tabs" aria-label="Sezioni del pilota">
      <button 
        v-for="tab in pilotTabs" 
        :key="tab.id"
        class="pilot-tab tab"
        type="button"
        :aria-current="activeTab === tab.id ? 'page' : undefined"
        :class="{ 'tab--active': activeTab === tab.id }"
        @click="activeTab = tab.id as any"
      >
        {{ tab.label }}
      </button>
    </nav>

    <!-- Content Area -->
    <div class="pilot-content">
      <div v-if="isLoading" class="loading">Caricamento...</div>
      
      <template v-else>
        <!-- Show detail views when selected -->
        <template v-if="detailView === 'track' && selectedTrackId">
          <PagesTrackDetailPage
            :track-id="selectedTrackId" 
            @back="goBackToList"
            @go-to-session="handleGoToSession" 
          />
        </template>

        <template v-else-if="detailView === 'session' && selectedSessionId">
          <PagesSessionDetailPage 
            :session-id="selectedSessionId" 
            @back="goBackToList"
            @go-to-track="handleGoToTrack" 
          />
        </template>

        <template v-else-if="detailView === 'stats'">
          <PagesStatistichePage @back="goBackToList" />
        </template>

        <!-- Show main tab content when no detail selected -->
        <template v-else>
          <!-- Panoramica -->
          <div v-if="activeTab === 'panoramica'" class="tab-content">
            <PagesPanoramicaPage @go-to-track="handleGoToTrack" @go-to-session="handleGoToSession" @go-to-stats="handleGoToStats" />
          </div>

          <!-- Sessioni -->
          <div v-if="activeTab === 'sessioni'" class="tab-content">
            <PagesSessioniPage @go-to-session="handleGoToSession" />
          </div>

          <!-- Piste -->
          <div v-if="activeTab === 'piste'" class="tab-content">
            <PagesPistePage @go-to-track="handleGoToTrack" />
          </div>

          <!-- Pilota: contesto, calendario e lezioni -->
          <div v-if="activeTab === 'lezioni'" class="tab-content">
            <CoachLessonsPanel :pilot-id="pilotId" :pilot-name="pilotName" />
          </div>
        </template>
      </template>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/scss/variables' as *;

.pilot-view {
  display: flex;
  flex-direction: column;
  gap: 0;
  width: 100%;
  min-width: 0;
}

// === PILOT HEADER ===
// Una sola fascia: percorso a sinistra, gioco a destra; spazio sotto per la riga di stato del selettore.
.pilot-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  // Allineata ai bordi del contenuto delle pagine sotto.
  padding: 12px 16px 0 24px;
  margin-bottom: 26px;
}

.pilot-trail {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  min-width: 0;
  font: 500 14px/1.3 'Inter', sans-serif;
  color: rgba(255, 255, 255, 0.6);
  &__sep { color: rgba(255, 255, 255, 0.35); }
  &__link {
    display: inline-flex; align-items: center; gap: 6px; padding: 0; border: 0; background: none;
    color: inherit; font: inherit; text-decoration: none; cursor: pointer;
    &:hover { color: #fff; }
    &:focus-visible { outline: 2px solid #fff; outline-offset: 3px; }
  }
  // Il pilota che stai guardando: arancio, come il vecchio "Stai visualizzando".
  &__pilot { color: $racing-orange; font-weight: 600; &:hover { color: lighten($racing-orange, 10%); } }
  &__here { color: #fff; font-weight: 600; }
}

// === PILOT TABS ===
.pilot-tabs {
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
  min-height: 48px;
  padding: 0;
  margin-bottom: 24px;
  background: transparent;
  border-radius: 0;
  flex-shrink: 0;
}

.pilot-tab {
  position: relative;
  flex: 0 0 auto;
  min-height: 48px;
  border: 0;
  border-radius: 0;
  background: transparent;
  white-space: nowrap;
  cursor: pointer;
  &:hover { color: #fff; }
  &:focus-visible { outline: 2px solid #fff; outline-offset: -4px; }
  &::after {
    content: '';
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    height: 3px;
    background: transparent;
  }
}
@media (max-width: 600px) {
  .pilot-tabs { gap: 0; }
  .pilot-tab { flex: 1; min-width: 0; padding-inline: 8px; font-size: 13px; }
}

// === CONTENT ===
.pilot-content {
  min-height: 400px;
  // PIP-637: le pagine del pilota stanno subito sotto il percorso, senza il loro margine di pagina intera.
  --app-content-top-space: 4px;
}

.tab-content { min-width: 0; }

.loading {
  text-align: center;
  padding: 60px;
  color: rgba(255, 255, 255, 0.5);
}
</style>
