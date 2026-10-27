<script setup lang="ts">
// ============================================
// Pilot Detail View - Coach shadowing a pilot
// ============================================

import { ref, onMounted, onBeforeUnmount, computed, watch } from 'vue'
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
function selectTab(id: string) {
  activeTab.value = id as typeof activeTab.value
  goBackToList()
}
// La freccia: dalla sessione o dalla pista alla scheda da cui sei arrivato; dalla scheda alla lista dei piloti.
const backLabel = computed(() => detailView.value === 'none' ? 'Torna ai piloti' : `Torna a ${trail.value.find(c => c.target === 'tab')?.label ?? 'Panoramica'}`)
function goBack() {
  if (detailView.value === 'none') void navigateTo('/piloti')
  else goBackToList()
}

// L'area del contenuto parte sotto la testata e arriva al fondo dello schermo: si misura dove comincia
// (la testata va a capo sugli schermi stretti) e si rimisura quando cambia la finestra.
const contentRef = ref<HTMLElement | null>(null)
const contentTop = ref(0)
function measureContent() { contentTop.value = Math.max(0, Math.round(contentRef.value?.getBoundingClientRect().top ?? 0)) }
let headerObserver: ResizeObserver | null = null
onMounted(() => {
  measureContent()
  window.addEventListener('resize', measureContent)
  headerObserver = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measureContent)
  for (const el of Array.from(contentRef.value?.parentElement?.children ?? [])) if (el !== contentRef.value) headerObserver?.observe(el)
})
onBeforeUnmount(() => { window.removeEventListener('resize', measureContent); headerObserver?.disconnect() })
</script>

<template>
  <div class="pilot-view">
    <!-- PIP-637: in alto la navbar del pilota, sempre visibile (anche dentro una sessione o una pista), con la
         freccia indietro alla stessa altezza, come la navbar principale. -->
    <div class="pilot-topbar">
      <button type="button" class="pilot-back" :aria-label="backLabel" :title="backLabel" @click="goBack">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M19 12H5m7-7-7 7 7 7" /></svg>
      </button>
      <nav class="pilot-tabs" aria-label="Sezioni del pilota">
        <button
          v-for="tab in pilotTabs"
          :key="tab.id"
          class="pilot-tab tab"
          type="button"
          :aria-current="activeTab === tab.id && detailView === 'none' ? 'page' : undefined"
          :class="{ 'tab--active': activeTab === tab.id }"
          @click="selectTab(tab.id)"
        >
          {{ tab.label }}
        </button>
      </nav>
    </div>

    <!-- Sotto: percorso a sinistra (il pilota in arancio: stai guardando i suoi dati), gioco a destra. -->
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

    <!-- Content Area -->
    <div ref="contentRef" class="pilot-content" :style="{ height: contentTop ? `calc(100dvh - ${contentTop}px)` : undefined }">
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
// PIP-637: meno margine sopra della pagina intera: qui la prima cosa e' la navbar del pilota.
.pilot-view { margin-top: calc(12px - var(--app-content-top-space, 40px)); }
// Navbar del pilota centrata, freccia indietro a sinistra alla stessa altezza (come la barra principale).
.pilot-topbar { position: relative; display: flex; justify-content: center; align-items: center; border-bottom: 1px solid rgba(255, 255, 255, 0.06); }
.pilot-back {
  position: absolute; left: 0; top: 50%; transform: translateY(-50%);
  display: grid; place-items: center; width: 40px; height: 40px;
  border: 1px solid transparent; background: transparent; color: #ccc; cursor: pointer;
  transition: color 150ms, background-color 150ms, border-color 150ms;
  &:hover { color: #fff; background: #ffffff0d; border-color: #ffffff30; }
  &:focus-visible { outline: 2px solid #fff; outline-offset: 2px; }
}
// Una sola fascia: percorso a sinistra, gioco a destra; spazio sotto per la riga di stato del selettore.
.pilot-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 16px;
  flex-wrap: wrap;
  // Allineata ai bordi del contenuto delle pagine sotto.
  padding: 14px 16px 0 24px;
  margin-bottom: 22px;
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
  margin-bottom: 0;
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
// PIP-639: on a phone the tabs start after the back arrow and slide sideways when they do not fit.
@media (max-width: 600px) {
  .pilot-topbar { justify-content: flex-start; padding-left: 44px; }
  .pilot-tabs { flex: 1 1 auto; gap: 0; justify-content: flex-start; min-width: 0; overflow-x: auto; scrollbar-width: none; }
  .pilot-tab { flex: 0 0 auto; padding-inline: 10px; font-size: 13px; }
  .pilot-header { padding-inline: 12px; }
  // The header takes half a phone screen: the whole page scrolls instead of a small box under it.
  // Sessioni too: app.vue lifts its page clip here, and the list grows instead of scrolling inside.
  .pilot-content { height: auto !important; overflow: visible; }
  .tab-content, .tab-content :deep(.sessions-page) { height: auto; }
  // The coach layout already keeps 12 px from the screen edge: no second page margin inside.
  .tab-content :deep(.page-container) { padding-inline: 0; }
}

// === CONTENT ===
.pilot-content {
  min-height: 320px;
  // PIP-637: e' l'area che scorre, alta quanto lo schermo sotto la testata (come la dashboard): la pagina
  // intera qui non scorre, e la lista Sessioni ha cosi' un'altezza entro cui scorrere.
  overflow-y: auto;
  overscroll-behavior-y: contain;
  // Le pagine del pilota stanno subito sotto il percorso, senza il loro margine di pagina intera.
  --app-content-top-space: 4px;
}

.tab-content { min-width: 0; height: 100%; }
// Sessioni scorre dentro la sua lista (paginazione sempre in vista), come nella dashboard.
.tab-content :deep(.sessions-page) { height: 100%; }

.loading {
  text-align: center;
  padding: 60px;
  color: rgba(255, 255, 255, 0.5);
}
</style>
