<script setup lang="ts">
// ============================================
// ProfilePage - User Profile with Sim Racing Equipment
// ============================================

import { ref, computed, onMounted } from 'vue'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import { useTelemetryData } from '~/composables/useTelemetryData'

const props = defineProps<{
  userEmail?: string
  userNickname?: string
  userRole?: 'pilot' | 'coach' | 'admin'
}>()

const emit = defineEmits<{
  logout: []
  back: []
}>()

// Firebase
const { currentUser, getUserProfile } = useFirebaseAuth()

// Display name computed
const displayName = computed((): string => {
  if (props.userNickname) return props.userNickname
  if (props.userEmail) return props.userEmail.split('@')[0] ?? 'Utente'
  return 'Utente'
})

// Page title based on role
const pageTitle = computed((): string => {
  const titles: Record<string, string> = {
    pilot: 'Profilo Pilota',
    coach: 'Profilo Coach',
    admin: 'Profilo Admin'
  }
  return titles[props.userRole || 'pilot'] ?? 'Profilo Pilota'
})

// Role label for badge
const roleLabel = computed((): string => {
  const labels: Record<string, string> = {
    pilot: 'PILOTA',
    coach: 'COACH',
    admin: 'ADMIN'
  }
  return labels[props.userRole || 'pilot'] ?? 'PILOTA'
})

// Form state for equipment
const equipment = ref({
  volante: '',
  corona: '',
  pedaliera: '',
  struttura: ''
})

const isSaving = ref(false)
const saveSuccess = ref(false)

// Load user profile on mount
onMounted(async () => {
  if (currentUser.value) {
    const profile = await getUserProfile(currentUser.value.uid)
    if (profile?.equipment) {
      equipment.value = { ...equipment.value, ...profile.equipment }
    }
    // Load shared sessions count
    await loadSharedCount()
  }
})

// ========================================
// SESSION SHARING MANAGEMENT
// ========================================
const { countSharedSessions, revokeAllSharedSessions, resetAllTrackBests } = useTelemetryData()
const sharedSessionsCount = ref(0)
const isRevoking = ref(false)
const revokeSuccess = ref(false)

// ========================================
// HISTORICAL BESTS RESET
// ========================================
const isResettingBests = ref(false)
const resetBestsSuccess = ref(false)
const resetBestsCount = ref(0)

async function loadSharedCount() {
  sharedSessionsCount.value = await countSharedSessions()
}

async function revokeAll() {
  if (isRevoking.value) return
  
  isRevoking.value = true
  revokeSuccess.value = false
  
  try {
    const count = await revokeAllSharedSessions()
    sharedSessionsCount.value = 0
    revokeSuccess.value = true
    console.log(`[PROFILE] Revoked ${count} shared sessions`)
    
    setTimeout(() => revokeSuccess.value = false, 2000)
  } catch (e) {
    console.error('[PROFILE] Revoke error:', e)
  } finally {
    isRevoking.value = false
  }
}

async function resetHistoricalBests() {
  if (isResettingBests.value) return
  
  // Confirm with user
  if (!confirm('Sei sicuro di voler eliminare tutti i tempi storici? I best verranno ricalcolati automaticamente alla prossima sincronizzazione.')) {
    return
  }
  
  isResettingBests.value = true
  resetBestsSuccess.value = false
  
  try {
    const count = await resetAllTrackBests()
    resetBestsCount.value = count
    resetBestsSuccess.value = true
    console.log(`[PROFILE] Reset ${count} track bests`)
    
    setTimeout(() => resetBestsSuccess.value = false, 3000)
  } catch (e) {
    console.error('[PROFILE] Reset bests error:', e)
  } finally {
    isResettingBests.value = false
  }
}

// Save equipment to Firestore
const handleSave = async () => {
  if (!currentUser.value) return
  
  isSaving.value = true
  try {
    // Import Firestore functions
    const { doc, updateDoc } = await import('firebase/firestore')
    const { db } = await import('~/config/firebase')
    
    await updateDoc(doc(db, 'users', currentUser.value.uid), {
      equipment: equipment.value
    })
    
    saveSuccess.value = true
    setTimeout(() => saveSuccess.value = false, 2000)
  } catch (error) {
    console.error('[PROFILE] Save error:', error)
  } finally {
    isSaving.value = false
  }
}

const handleLogout = () => emit('logout')
const handleGoToProfile = () => {} // Already on profile
const handleBackToDashboard = () => {
  emit('back')
}
</script>

<template>
  <div class="profile-page">
    <!-- Header -->
    <header class="profile-header">
      <div class="header-inner">
        <div class="header-left">
          <button class="back-btn" @click="handleBackToDashboard">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
              <path d="M12 4L6 10L12 16" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            Dashboard
          </button>
        </div>
        <div class="header-brand">
          <span class="brand-badge">ACC</span>
          <span class="brand-name">TELEMETRY</span>
        </div>
        <div class="header-right">
          <UiUserDropdown 
            :user-name="displayName"
            @logout="handleLogout"
            @go-to-profile="handleGoToProfile"
          />
        </div>
      </div>
    </header>

    <!-- Main Content - Centered 1400px -->
    <main class="profile-main">
      <div class="profile-container">
        
        <!-- Page Title -->
        <h1 class="page-title">{{ pageTitle }}</h1>

        <!-- Profile Grid -->
        <div class="profile-grid">
          
          <!-- Left Column: Avatar + Info -->
          <div class="profile-sidebar">
            <!-- Racing Helmet Avatar -->
            <div class="avatar-container">
              <svg class="avatar-helmet" viewBox="0 0 100 100" fill="none">
                <defs>
                  <linearGradient id="helmetGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#e10600"/>
                    <stop offset="100%" stop-color="#ff6b00"/>
                  </linearGradient>
                </defs>
                <!-- Helmet shape -->
                <path d="M50 10C30 10 15 25 15 45V60C15 75 25 85 40 88L45 90H55L60 88C75 85 85 75 85 60V45C85 25 70 10 50 10Z" 
                      stroke="url(#helmetGrad)" stroke-width="3" fill="none"/>
                <!-- Visor -->
                <path d="M20 45H80C80 45 78 55 50 55C22 55 20 45 20 45Z" 
                      stroke="url(#helmetGrad)" stroke-width="2" fill="rgba(225,6,0,0.1)"/>
                <!-- Center line -->
                <line x1="50" y1="15" x2="50" y2="85" stroke="url(#helmetGrad)" stroke-width="1.5"/>
              </svg>
            </div>
            
            <!-- User Info -->
            <div class="user-info">
              <h2 class="user-nickname">{{ displayName }}</h2>
              <span class="role-badge" :class="`role-badge--${userRole || 'pilot'}`">{{ roleLabel }}</span>
              <p class="user-email">{{ userEmail || 'Email non disponibile' }}</p>
            </div>
          </div>

          <!-- Right Column: Equipment Form -->
          <div class="profile-content">
            
            <!-- Equipment Card -->
            <div class="profile-card">
              <h3 class="card-title">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <circle cx="12" cy="12" r="10" stroke="currentColor" stroke-width="2"/>
                  <circle cx="12" cy="12" r="4" stroke="currentColor" stroke-width="2"/>
                </svg>
                Attrezzatura Sim Racing
              </h3>

              <div class="equipment-form">
                <div class="form-group">
                  <label class="form-label">Volante / Base</label>
                  <input 
                    v-model="equipment.volante"
                    type="text" 
                    class="form-input"
                    placeholder="Es. Fanatec CSL DD 8Nm"
                  />
                </div>

                <div class="form-group">
                  <label class="form-label">Corona / Rim</label>
                  <input 
                    v-model="equipment.corona"
                    type="text" 
                    class="form-input"
                    placeholder="Es. ClubSport Formula V2"
                  />
                </div>

                <div class="form-group">
                  <label class="form-label">Pedaliera</label>
                  <input 
                    v-model="equipment.pedaliera"
                    type="text" 
                    class="form-input"
                    placeholder="Es. CSL Pedals + Load Cell"
                  />
                </div>

                <div class="form-group">
                  <label class="form-label">Struttura / Rig</label>
                  <input 
                    v-model="equipment.struttura"
                    type="text" 
                    class="form-input"
                    placeholder="Es. Next Level Racing 2.0"
                  />
                </div>

                <button 
                  class="save-btn"
                  :class="{ 'save-btn--success': saveSuccess }"
                  :disabled="isSaving"
                  @click="handleSave"
                >
                  <template v-if="isSaving">Salvataggio...</template>
                  <template v-else-if="saveSuccess">✓ Salvato</template>
                  <template v-else>Salva Modifiche</template>
                </button>
              </div>
            </div>

            <!-- Sharing Card -->
            <div class="profile-card sharing-card">
              <h3 class="card-title">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  <polyline points="15 3 21 3 21 9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                  <line x1="10" y1="14" x2="21" y2="3" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                Sessioni Condivise
              </h3>

              <div class="sharing-info">
                <p v-if="sharedSessionsCount > 0" class="sharing-count">
                  Hai <strong>{{ sharedSessionsCount }}</strong> sessioni condivise pubblicamente.
                </p>
                <p v-else class="sharing-count sharing-count--empty">
                  Nessuna sessione condivisa.
                </p>
                
                <button 
                  v-if="sharedSessionsCount > 0"
                  class="revoke-btn"
                  :class="{ 'revoke-btn--success': revokeSuccess }"
                  :disabled="isRevoking"
                  @click="revokeAll"
                >
                  <template v-if="isRevoking">Revocando...</template>
                  <template v-else-if="revokeSuccess">✓ Revocate</template>
                  <template v-else>🚫 Revoca tutte le condivisioni</template>
                </button>
              </div>
            </div>

            <!-- Reset Historical Bests Card -->
            <div class="profile-card reset-card">
              <h3 class="card-title">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
                  <path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2m3 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6h14" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
                </svg>
                Reset Tempi Storici
              </h3>

              <div class="reset-info">
                <p class="reset-description">
                  Elimina tutti i best storici salvati. Alla prossima sincronizzazione verranno ricalcolati automaticamente dalle sessioni.
                </p>
                
                <button 
                  class="reset-btn"
                  :class="{ 'reset-btn--success': resetBestsSuccess }"
                  :disabled="isResettingBests"
                  @click="resetHistoricalBests"
                >
                  <template v-if="isResettingBests">Eliminando...</template>
                  <template v-else-if="resetBestsSuccess">✓ Eliminati {{ resetBestsCount }} tracciati</template>
                  <template v-else>🗑️ Elimina tutti i best</template>
                </button>
              </div>
            </div>

          </div>
        </div>

      </div>
    </main>
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/scss/variables' as *;

$font-family: $font-primary;
$color-racing-red: $racing-red;
$color-racing-orange: $racing-orange;
$color-bg: #0d0d12;
$color-card: #121218;
$max-width: 1400px;

.profile-page {
  min-height: 100vh;
  background: $color-bg;
  font-family: $font-family;
  color: #fff;
}

// === HEADER ===
.profile-header {
  padding: 16px 24px;
  background: rgba(255, 255, 255, 0.02);
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.header-inner {
  display: flex;
  justify-content: space-between;
  align-items: center;
  max-width: $max-width;
  margin: 0 auto;
}

.header-left,
.header-right {
  flex: 1;
}

.header-right {
  display: flex;
  justify-content: flex-end;
}

.header-brand {
  display: flex;
  align-items: center;
  gap: 10px;
}

.brand-badge {
  font-family: 'Outfit', sans-serif;
  font-size: 16px;
  font-weight: 700;
  color: $color-racing-red;
  padding: 5px 8px;
  border: 2px solid $color-racing-red;
  border-radius: 5px;
}

.brand-name {
  font-family: 'Outfit', sans-serif;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 2px;
}

.back-btn {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 16px;
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.7);
  font-family: $font-family;
  font-size: 14px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    background: rgba(255, 255, 255, 0.05);
    color: #fff;
    border-color: rgba($color-racing-red, 0.4);
  }
}

// === MAIN CONTENT ===
.profile-main {
  padding: 40px 24px;
}

.profile-container {
  max-width: $max-width;
  margin: 0 auto;
}

.page-title {
  font-size: 28px;
  font-weight: 700;
  margin-bottom: 32px;
}

.profile-grid {
  display: grid;
  grid-template-columns: 280px 1fr;
  gap: 32px;
}

// === SIDEBAR ===
.profile-sidebar {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 32px;
  background: $color-card;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 20px;
  height: fit-content;
}

.avatar-container {
  width: 120px;
  height: 120px;
  margin-bottom: 24px;
}

.avatar-helmet {
  width: 100%;
  height: 100%;
}

.user-info {
  text-align: center;
}

.user-nickname {
  font-size: 20px;
  font-weight: 700;
  margin-bottom: 8px;
}

.user-email {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.5);
  margin-top: 8px;
}

// Role Badge
.role-badge {
  display: inline-block;
  padding: 4px 12px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 1px;
  border-radius: 4px;
  margin-top: 8px;
  text-transform: uppercase;

  &--pilot {
    background: rgba($color-racing-red, 0.2);
    color: $color-racing-red;
    border: 1px solid rgba($color-racing-red, 0.4);
  }

  &--coach {
    background: rgba(59, 130, 246, 0.2);
    color: #60a5fa;
    border: 1px solid rgba(59, 130, 246, 0.4);
  }

  &--admin {
    background: rgba(234, 179, 8, 0.2);
    color: #fbbf24;
    border: 1px solid rgba(234, 179, 8, 0.4);
  }
}

// === CONTENT ===
.profile-card {
  padding: 32px;
  background: $color-card;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 20px;
}

.card-title {
  display: flex;
  align-items: center;
  gap: 12px;
  font-size: 18px;
  font-weight: 600;
  margin-bottom: 28px;
  color: rgba(255, 255, 255, 0.9);

  svg {
    color: $color-racing-red;
  }
}

// === FORM ===
.equipment-form {
  display: flex;
  flex-direction: column;
  gap: 20px;
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.form-label {
  font-size: 13px;
  font-weight: 500;
  color: rgba(255, 255, 255, 0.6);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.form-input {
  padding: 14px 18px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 12px;
  color: #fff;
  font-family: $font-family;
  font-size: 15px;
  transition: all 0.2s ease;

  &::placeholder {
    color: rgba(255, 255, 255, 0.3);
  }

  &:focus {
    outline: none;
    border-color: rgba($color-racing-red, 0.5);
    background: rgba(255, 255, 255, 0.05);
    box-shadow: 0 0 0 3px rgba($color-racing-red, 0.1);
  }
}

.save-btn {
  margin-top: 12px;
  padding: 16px 32px;
  background: linear-gradient(135deg, $color-racing-red 0%, $color-racing-orange 100%);
  border: none;
  border-radius: 12px;
  color: #fff;
  font-family: $font-family;
  font-size: 15px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  align-self: flex-start;

  &:hover:not(:disabled) {
    box-shadow: 0 0 30px rgba($color-racing-red, 0.3);
    transform: translateY(-1px);
  }

  &:disabled {
    opacity: 0.7;
    cursor: wait;
  }

  &--success {
    background: #22c55e;
  }
}

// === SHARING CARD ===
.sharing-card {
  margin-top: 24px;
}

.sharing-info {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.sharing-count {
  font-size: 15px;
  color: rgba(255, 255, 255, 0.7);
  margin: 0;
  
  strong {
    color: var(--gold, #ffc800);
    font-weight: 700;
  }
  
  &--empty {
    color: rgba(255, 255, 255, 0.5);
  }
}

.revoke-btn {
  padding: 12px 20px;
  background: rgba(255, 100, 100, 0.15);
  border: 1px solid rgba(255, 100, 100, 0.4);
  border-radius: 10px;
  color: rgb(255, 100, 100);
  font-family: $font-family;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  align-self: flex-start;
  
  &:hover:not(:disabled) {
    background: rgba(255, 100, 100, 0.25);
    border-color: rgba(255, 100, 100, 0.6);
  }
  
  &:disabled {
    opacity: 0.6;
    cursor: wait;
  }
  
  &--success {
    background: rgba(34, 197, 94, 0.15);
    border-color: rgba(34, 197, 94, 0.4);
    color: #22c55e;
  }
}

// === RESET BESTS CARD ===
.reset-card {
  margin-top: 24px;
}

.reset-info {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.reset-description {
  font-size: 14px;
  color: rgba(255, 255, 255, 0.6);
  margin: 0;
  line-height: 1.5;
}

.reset-btn {
  padding: 12px 20px;
  background: rgba(239, 68, 68, 0.15);
  border: 1px solid rgba(239, 68, 68, 0.4);
  border-radius: 10px;
  color: $color-racing-red;
  font-family: $font-family;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.2s;
  align-self: flex-start;
  
  &:hover:not(:disabled) {
    background: rgba(239, 68, 68, 0.25);
    border-color: rgba(239, 68, 68, 0.6);
  }
  
  &:disabled {
    opacity: 0.6;
    cursor: wait;
  }
  
  &--success {
    background: rgba(34, 197, 94, 0.15);
    border-color: rgba(34, 197, 94, 0.4);
    color: #22c55e;
  }
}

// === RESPONSIVE ===
@media (max-width: 900px) {
  .profile-grid {
    grid-template-columns: 1fr;
  }

  .profile-sidebar {
    flex-direction: row;
    gap: 24px;
    padding: 24px;
  }

  .avatar-container {
    width: 80px;
    height: 80px;
    margin-bottom: 0;
  }

  .user-info {
    text-align: left;
  }
}

@media (max-width: 600px) {
  .header-brand {
    display: none;
  }

  .page-title {
    font-size: 22px;
  }
}
</style>
