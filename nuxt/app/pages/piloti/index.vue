<script setup lang="ts">
// ============================================
// PilotiPage - paginated pilot directory for coaches and admins
// ============================================

import { ref, computed, onMounted, watch } from 'vue'
import { endFirebaseScenario, startFirebaseScenario } from '~/composables/useFirebaseTracker'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import {
  PILOT_PAGE_SIZE,
  countPilotDirectory,
  loadPilotDirectoryPage,
  type PilotDirectoryItem
} from '~/repositories/pilotDirectoryRepository'

definePageMeta({
  layout: 'coach',
  middleware: ['coach-or-admin']
})

const { currentUser, isAdmin, userRole } = useFirebaseAuth()

type Pilot = PilotDirectoryItem

const pilots = ref<Pilot[]>([])
const isLoading = ref(true)
const searchQuery = ref('')
const totalItems = ref<number | null>(null)
const currentPage = ref(1)
const nextCursor = ref<any | null>(null)
const cursorStack = ref<any[]>([])
let searchDebounce: ReturnType<typeof setTimeout> | null = null

const pageRole = computed<'admin' | 'coach'>(() => isAdmin.value ? 'admin' : 'coach')
const hasPreviousPage = computed(() => currentPage.value > 1)
const hasNextPage = computed(() => !!nextCursor.value)
const visibleTotalLabel = computed(() => totalItems.value === null ? pilots.value.length : totalItems.value)

const fetchPilots = async (options: { reset?: boolean; direction?: 'next' | 'prev' } = {}) => {
  if (!currentUser.value) {
    isLoading.value = false
    return
  }
  if (options.reset) {
    currentPage.value = 1
    cursorStack.value = []
    nextCursor.value = null
  }

  const scenarioId = startFirebaseScenario(isAdmin.value ? 'admin.piloti.list' : 'coach.piloti.list', {
    userId: currentUser.value.uid,
    role: userRole.value,
    page: currentPage.value,
    pageSize: PILOT_PAGE_SIZE,
    search: searchQuery.value || null,
    reset: !!options.reset,
    direction: options.direction || 'current'
  })

  isLoading.value = true

  try {
    const cursor = cursorStack.value[currentPage.value - 2] || null
    const [page, count] = await Promise.all([
      loadPilotDirectoryPage({
        role: pageRole.value,
        currentUserId: currentUser.value.uid,
        pageSize: PILOT_PAGE_SIZE,
        cursor,
        searchTerm: searchQuery.value
      }),
      countPilotDirectory({
        role: pageRole.value,
        currentUserId: currentUser.value.uid,
        searchTerm: searchQuery.value
      })
    ])

    pilots.value = page.pilots
    nextCursor.value = page.hasNext ? page.nextCursor : null
    totalItems.value = count
  } catch (e) {
    console.error('Error fetching pilots:', e)
  } finally {
    isLoading.value = false
    endFirebaseScenario(scenarioId)
  }
}

function goNextPage() {
  if (!nextCursor.value || isLoading.value) return
  cursorStack.value[currentPage.value - 1] = nextCursor.value
  currentPage.value += 1
  fetchPilots({ direction: 'next' })
}

function goPreviousPage() {
  if (!hasPreviousPage.value || isLoading.value) return
  currentPage.value = Math.max(1, currentPage.value - 1)
  fetchPilots({ direction: 'prev' })
}

// Get display name (firstName + lastName, fallback to nickname)
function getDisplayName(pilot: Pilot): string {
  if (pilot.firstName && pilot.lastName) {
    return `${pilot.firstName} ${pilot.lastName}`
  }
  return pilot.nickname
}

// Get initials from first/last name or nickname
function getInitials(pilot: Pilot): string {
  if (pilot.firstName && pilot.lastName) {
    return `${pilot.firstName[0]}${pilot.lastName[0]}`.toUpperCase()
  }
  return pilot.nickname.slice(0, 2).toUpperCase()
}

function getVersionClass(version: string): string {
  void version
  return 'version-badge--unknown'
}

function formatDate(dateStr?: string): string {
  if (!dateStr) return 'Mai attivo'
  const date = new Date(dateStr)
  const day = date.getDate()
  const months = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic']
  return `${day} ${months[date.getMonth()]} ${date.getFullYear()}`
}

onMounted(() => {
  fetchPilots({ reset: true })
})

watch(searchQuery, () => {
  if (searchDebounce) clearTimeout(searchDebounce)
  searchDebounce = setTimeout(() => {
    fetchPilots({ reset: true })
  }, 300)
})
</script>

<template>
  <div class="piloti-page">
    <h1 class="page-title">{{ isAdmin ? 'TUTTI GLI UTENTI' : 'I MIEI PILOTI' }}</h1>
    
    <div class="page-header">
      <p class="page-subtitle">
        {{ visibleTotalLabel }} {{ isAdmin ? 'utenti' : 'piloti assegnati' }}
        <span v-if="visibleTotalLabel > PILOT_PAGE_SIZE" class="page-subtitle__page">pagina {{ currentPage }}</span>
      </p>
      
      <!-- Search Bar -->
      <div class="search-box">
        <svg class="search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/>
          <path d="M21 21l-4.35-4.35"/>
        </svg>
        <input 
          v-model="searchQuery"
          type="text" 
          placeholder="Cerca pilota..."
          class="search-input"
        />
      </div>
    </div>

    <!-- Loading State -->
    <div v-if="isLoading" class="state-box">
      Caricamento piloti...
    </div>

    <!-- Empty State -->
    <div v-else-if="pilots.length === 0" class="state-box state-box--empty">
      <p>{{ searchQuery ? `Nessun risultato per "${searchQuery}"` : 'Nessun pilota assegnato' }}</p>
      <small v-if="!searchQuery">
        L'assegnazione coach deve aggiornare sia <code>users</code> sia <code>pilotDirectory</code>.
        In sviluppo usa il repair directory da <code>/dev-rebuild</code> se i dati sono stati modificati manualmente.
      </small>
    </div>

    <!-- Pilots List -->
    <div v-else class="pilots-list">
      <div class="list-header" :class="{ 'list-header--admin': isAdmin }">
        <span class="lh-name">Pilota</span>
        <span class="lh-nickname">Nickname</span>
        <span class="lh-sessions">Sessioni (7gg)</span>
        <span class="lh-last">Ultima attività</span>
        <span v-if="isAdmin" class="lh-version">Versione</span>
        <span class="lh-cta"></span>
      </div>
      
      <NuxtLink 
        v-for="pilot in pilots" 
        :key="pilot.uid"
        :to="`/piloti/${pilot.uid}`"
        class="list-row"
        :class="{ 'list-row--admin': isAdmin }"
      >
        <span class="lr-name">
          <span class="pilot-avatar">{{ getInitials(pilot) }}</span>
          {{ getDisplayName(pilot) }}
          <span v-if="isAdmin && pilot.role" class="role-badge" :class="`role-badge--${pilot.role}`">
            {{ pilot.role === 'coach' ? 'COACH' : 'PILOT' }}
          </span>
        </span>
        <span class="lr-nickname">{{ pilot.nickname }}</span>
        <span class="lr-sessions">{{ pilot.totalSessions || 0 }}</span>
        <span class="lr-last">{{ formatDate(pilot.lastSession) }}</span>
        <span v-if="isAdmin" class="lr-version">
          <span v-if="pilot.suiteVersion" class="version-badge" :class="getVersionClass(pilot.suiteVersion)">v{{ pilot.suiteVersion }}</span>
          <span v-else class="version-badge version-badge--unknown">—</span>
        </span>
        <span class="lr-cta">
          Visualizza
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 18l6-6-6-6"/>
          </svg>
        </span>
      </NuxtLink>

      <div class="pilot-pagination">
        <button class="pilot-pagination__button" :disabled="!hasPreviousPage || isLoading" @click="goPreviousPage">
          Precedente
        </button>
        <span class="pilot-pagination__status">Pagina {{ currentPage }}</span>
        <button class="pilot-pagination__button" :disabled="!hasNextPage || isLoading" @click="goNextPage">
          Successiva
        </button>
      </div>
    </div>
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/scss/variables' as *;

.page-title {
  font-family: 'Outfit', $font-primary;
  font-size: 24px;
  font-weight: 700;
  color: #fff;
  margin-bottom: 8px;
  letter-spacing: 1px;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 24px;
  flex-wrap: wrap;
  gap: 16px;
}

.page-subtitle {
  font-family: $font-primary;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.5);

  &__page {
    margin-left: 8px;
    color: rgba(255, 255, 255, 0.35);
  }
}

// === SEARCH BOX ===
.search-box {
  position: relative;
  width: 280px;
}

.search-icon {
  position: absolute;
  left: 14px;
  top: 50%;
  transform: translateY(-50%);
  width: 18px;
  height: 18px;
  color: rgba(255, 255, 255, 0.4);
  pointer-events: none;
}

.search-input {
  width: 100%;
  padding: 12px 16px 12px 44px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 10px;
  color: #fff;
  font-family: $font-primary;
  font-size: 14px;
  transition: all 0.2s ease;

  &::placeholder {
    color: rgba(255, 255, 255, 0.4);
  }

  &:focus {
    outline: none;
    border-color: rgba($racing-orange, 0.5);
    background: rgba(255, 255, 255, 0.08);
  }
}

// === LIST ===
.pilots-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.pilot-pagination {
  display: flex;
  justify-content: flex-end;
  align-items: center;
  gap: 12px;
  margin-top: 18px;
}

.pilot-pagination__status {
  font-family: $font-primary;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.5);
}

.pilot-pagination__button {
  padding: 9px 14px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.75);
  font-family: $font-primary;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s ease;

  &:hover:not(:disabled) {
    border-color: rgba($racing-orange, 0.4);
    color: $racing-orange;
  }

  &:disabled {
    opacity: 0.35;
    cursor: not-allowed;
  }
}

.list-header {
  display: grid;
  grid-template-columns: 1.2fr 1fr 100px 140px 120px;
  align-items: center;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 8px;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 4px;
}

.lh-sessions, .lh-last, .lh-version { text-align: center; }

.list-header--admin {
  grid-template-columns: 1.2fr 1fr 100px 140px 90px 120px;
}

.list-row {
  display: grid;
  grid-template-columns: 1.2fr 1fr 100px 140px 120px;
  align-items: center;
  padding: 14px 16px;
  background: #121218;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;
  cursor: pointer;
  text-decoration: none;
  transition: all 0.2s ease;

  &:hover {
    border-color: rgba($racing-orange, 0.4);
    transform: translateY(-2px);
    box-shadow: 
      0 6px 20px rgba(0, 0, 0, 0.3),
      0 0 20px rgba($racing-orange, 0.1);

    .lr-cta {
      background: rgba($racing-orange, 0.15);
      border-color: rgba($racing-orange, 0.3);
      color: $racing-orange;
      
      svg { transform: translateX(2px); }
    }
  }
}

.lr-name {
  font-family: $font-primary;
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  display: flex;
  align-items: center;
  gap: 12px;
}

.pilot-avatar {
  width: 36px;
  height: 36px;
  border-radius: 10px;
  background: linear-gradient(135deg, $racing-red, $racing-orange);
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  font-weight: 700;
  color: #fff;
  flex-shrink: 0;
}

.lr-nickname {
  font-family: $font-primary;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
}

// Role badge for admin view
.role-badge {
  font-size: 9px;
  font-weight: 700;
  padding: 3px 8px;
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  
  &--pilot {
    background: rgba($racing-orange, 0.15);
    color: $racing-orange;
  }
  
  &--coach {
    background: rgba(#3b82f6, 0.15);
    color: #3b82f6;
  }
}

.lr-sessions {
  font-family: $font-primary;
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  text-align: center;
}

.lr-last {
  font-family: $font-primary;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.6);
  text-align: center;
}

.list-row--admin {
  grid-template-columns: 1.2fr 1fr 100px 140px 90px 120px;
}

.lr-version {
  text-align: center;
}

.version-badge {
  font-family: 'JetBrains Mono', $font-primary;
  font-size: 11px;
  font-weight: 600;
  padding: 3px 8px;
  border-radius: 4px;
  letter-spacing: 0.3px;

  &--current {
    background: rgba(#22c55e, 0.15);
    color: #22c55e;
  }

  &--outdated {
    background: rgba(#eab308, 0.15);
    color: #eab308;
  }

  &--unknown {
    color: rgba(255, 255, 255, 0.3);
  }
}

.lr-cta {
  display: flex;
  align-items: center;
  gap: 6px;
  font-family: $font-primary;
  font-size: 11px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.6);
  padding: 6px 14px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 6px;
  transition: all 0.15s ease;

  svg {
    width: 14px;
    height: 14px;
    flex-shrink: 0;
    transition: transform 0.15s ease;
  }
}

.state-box {
  padding: 60px 40px;
  text-align: center;
  color: rgba(255, 255, 255, 0.5);
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 16px;

  &--empty {
    p {
      font-size: 18px;
      font-weight: 600;
      color: rgba(255, 255, 255, 0.7);
      margin-bottom: 8px;
    }

    small {
      display: block;
      font-size: 13px;
      color: rgba(255, 255, 255, 0.4);
      max-width: 500px;
      margin: 0 auto;
      line-height: 1.5;
    }

    code {
      background: rgba(255, 255, 255, 0.1);
      padding: 2px 6px;
      border-radius: 4px;
      font-family: 'JetBrains Mono', monospace;
    }
  }
}

@media (max-width: 900px) {
  .list-header, .list-row {
    grid-template-columns: 1fr 100px 100px 100px;
  }
  
  .lh-nickname, .lr-nickname {
    display: none;
  }

  .search-box {
    width: 100%;
  }
}

@media (max-width: 600px) {
  .list-header, .list-row {
    grid-template-columns: 1fr 80px 80px;
  }
  
  .lh-last, .lr-last {
    display: none;
  }
}
</style>
