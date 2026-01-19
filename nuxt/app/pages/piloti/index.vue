<script setup lang="ts">
// ============================================
// PilotiPage - Pilots list for coaches and admins
// ============================================

import { ref, computed, onMounted } from 'vue'
import { collection, query, where, getDocs } from 'firebase/firestore'
import { db } from '~/config/firebase'

definePageMeta({
  layout: 'coach',
  middleware: ['coach-or-admin']
})

const { currentUser, isAdmin, userRole } = useFirebaseAuth()

interface Pilot {
  uid: string
  firstName?: string
  lastName?: string
  nickname: string
  email: string
  role?: string  // Add role field for admin view
  coachId?: string
  createdAt?: string
  lastSession?: string
  totalSessions?: number
}

const pilots = ref<Pilot[]>([])
const isLoading = ref(true)
const searchQuery = ref('')

// Filtered pilots based on search
const filteredPilots = computed(() => {
  if (!searchQuery.value.trim()) return pilots.value
  
  const query = searchQuery.value.toLowerCase()
  return pilots.value.filter(pilot => {
    const fullName = `${pilot.firstName || ''} ${pilot.lastName || ''}`.toLowerCase()
    const nickname = (pilot.nickname || '').toLowerCase()
    const email = (pilot.email || '').toLowerCase()
    
    return fullName.includes(query) || nickname.includes(query) || email.includes(query)
  })
})

const fetchPilots = async () => {
  if (!currentUser.value) return
  
  try {
    let q
    
    if (isAdmin.value) {
      // Admin vede TUTTI gli utenti (piloti e coach)
      q = query(collection(db, 'users'))
    } else {
      // Coach vede solo i propri piloti assegnati
      q = query(
        collection(db, 'users'), 
        where('role', '==', 'pilot'),
        where('coachId', '==', currentUser.value.uid)
      )
    }
    
    const querySnapshot = await getDocs(q)
    
    // Get basic pilot data first (filter out self for admin)
    const pilotsData = querySnapshot.docs
      .filter(doc => doc.id !== currentUser.value?.uid)  // Exclude self
      .map(doc => ({
        uid: doc.id,
        ...doc.data()
      })) as Pilot[]
    
    // Fetch session stats for each pilot
    const sevenDaysAgo = new Date()
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7)
    const sevenDaysAgoStr = sevenDaysAgo.toISOString()
    
    for (const pilot of pilotsData) {
      try {
        // Fetch all sessions for this pilot
        const sessionsRef = collection(db, `users/${pilot.uid}/sessions`)
        const sessionsSnap = await getDocs(sessionsRef)
        
        let lastSessionDate: string | undefined = undefined
        let sessionsLast7Days = 0
        
        sessionsSnap.docs.forEach(sessionDoc => {
          const data = sessionDoc.data()
          const sessionDate = data.meta?.date_start
          
          if (sessionDate) {
            // Track last session
            if (!lastSessionDate || sessionDate > lastSessionDate) {
              lastSessionDate = sessionDate
            }
            
            // Count sessions in last 7 days
            if (sessionDate >= sevenDaysAgoStr) {
              sessionsLast7Days++
            }
          }
        })
        
        pilot.lastSession = lastSessionDate
        pilot.totalSessions = sessionsLast7Days
      } catch (e) {
        console.warn(`Could not fetch sessions for pilot ${pilot.uid}:`, e)
      }
    }
    
    pilots.value = pilotsData
  } catch (e) {
    console.error('Error fetching pilots:', e)
  } finally {
    isLoading.value = false
  }
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

function formatDate(dateStr?: string): string {
  if (!dateStr) return 'Mai attivo'
  const date = new Date(dateStr)
  const day = date.getDate()
  const months = ['Gen', 'Feb', 'Mar', 'Apr', 'Mag', 'Giu', 'Lug', 'Ago', 'Set', 'Ott', 'Nov', 'Dic']
  return `${day} ${months[date.getMonth()]} ${date.getFullYear()}`
}

onMounted(() => {
  fetchPilots()
})
</script>

<template>
  <div class="piloti-page">
    <h1 class="page-title">{{ isAdmin ? 'TUTTI GLI UTENTI' : 'I MIEI PILOTI' }}</h1>
    
    <div class="page-header">
      <p class="page-subtitle">{{ pilots.length }} {{ isAdmin ? 'utenti' : 'piloti assegnati' }}</p>
      
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
      <p>Nessun pilota assegnato</p>
      <small>Per assegnare un pilota, vai nella Firebase Console e aggiungi il campo <code>coachId</code> con il tuo UID al documento del pilota.</small>
    </div>

    <!-- No Results State -->
    <div v-else-if="filteredPilots.length === 0" class="state-box">
      Nessun pilota trovato per "{{ searchQuery }}"
    </div>

    <!-- Pilots List -->
    <div v-else class="pilots-list">
      <div class="list-header">
        <span class="lh-name">Pilota</span>
        <span class="lh-nickname">Nickname</span>
        <span class="lh-sessions">Sessioni (7gg)</span>
        <span class="lh-last">Ultima attività</span>
        <span class="lh-cta"></span>
      </div>
      
      <NuxtLink 
        v-for="pilot in filteredPilots" 
        :key="pilot.uid"
        :to="`/piloti/${pilot.uid}`"
        class="list-row"
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
        <span class="lr-cta">
          Visualizza
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M9 18l6-6-6-6"/>
          </svg>
        </span>
      </NuxtLink>
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

.lh-sessions, .lh-last { text-align: center; }

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
