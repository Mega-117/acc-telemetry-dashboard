<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { doc } from 'firebase/firestore'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import { useTelemetryData } from '~/composables/useTelemetryData'
import { trackedUpdateDoc } from '~/composables/useFirebaseTracker'
import { db } from '~/config/firebase'

const props = defineProps<{
  userEmail?: string
  userNickname?: string
  userRole?: 'pilot' | 'coach' | 'admin'
}>()

const emit = defineEmits<{
  logout: []
  back: []
}>()

type ProfileTab = 'account' | 'equipment' | 'calendar' | 'coach'

const { currentUser, getUserProfile } = useFirebaseAuth()
const { countSharedSessions, revokeAllSharedSessions, resetAllTrackBests } = useTelemetryData()

const activeTab = ref<ProfileTab>('account')
const isSaving = ref(false)
const saveSuccess = ref(false)
const sharedSessionsCount = ref(0)
const isRevoking = ref(false)
const revokeSuccess = ref(false)
const isResettingBests = ref(false)
const resetBestsSuccess = ref(false)
const resetBestsCount = ref(0)
const isEditingEquipment = ref(false)
const configuredEquipmentKeys = ref<string[]>([])

function createDefaultEquipment() {
  return {
    volante: '',
    corona: '',
    pedaliera: '',
    struttura: '',
    tcDefault: '',
    absDefault: '',
    sensitivity: 900,
    forceFeedbackStrength: 100,
    forceFeedbackScale: 'peak',
    naturalDamper: 35,
    naturalFriction: 5,
    naturalInertia: 13,
    interpolationFilter: 4,
    forceEffectIntensity: 0,
    forceEffectStrength: 100,
    springEffectStrength: 100,
    damperEffectStrength: 50,
    brakeForce: 75,
    ffbGain: '',
    brakePressure: '',
    steeringLock: ''
  }
}

const equipment = ref(createDefaultEquipment())
const savedEquipment = ref(createDefaultEquipment())

const wheelSettingDefinitions = [
  { key: 'sensitivity', code: 'SEN', label: 'Sensitivity', min: 90, max: 1080, step: 10, suffix: 'deg' },
  { key: 'forceFeedbackStrength', code: 'FFB', label: 'Force Feedback Strength', min: 0, max: 100, step: 1, suffix: '%' },
  { key: 'naturalDamper', code: 'NDP', label: 'Natural Damper', min: 0, max: 100, step: 1, suffix: '%' },
  { key: 'naturalFriction', code: 'NFR', label: 'Natural Friction', min: 0, max: 100, step: 1, suffix: '%' },
  { key: 'naturalInertia', code: 'NIN', label: 'Natural Inertia', min: 0, max: 100, step: 1, suffix: '%' },
  { key: 'interpolationFilter', code: 'INT', label: 'FFB Interpolation Filter', min: 0, max: 20, step: 1, suffix: '' },
  { key: 'forceEffectIntensity', code: 'FEI', label: 'Force Effect Intensity', min: 0, max: 100, step: 1, suffix: '' },
  { key: 'forceEffectStrength', code: 'FOR', label: 'Force Effect Strength', min: 0, max: 100, step: 1, suffix: '%' },
  { key: 'springEffectStrength', code: 'SPR', label: 'Spring Effect Strength', min: 0, max: 100, step: 1, suffix: '%' },
  { key: 'damperEffectStrength', code: 'DPR', label: 'Damper Effect Strength', min: 0, max: 100, step: 1, suffix: '%' },
  { key: 'brakeForce', code: 'BRF', label: 'Brake Force', min: 0, max: 100, step: 1, suffix: '%' }
] as const

const hardwareSummaryRows = computed(() => [
  { label: 'Volante / base', value: equipment.value.volante },
  { label: 'Corona', value: equipment.value.corona },
  { label: 'Pedaliera', value: equipment.value.pedaliera },
  { label: 'Rig', value: equipment.value.struttura }
].filter((row) => hasDisplayValue(row.value)))

const setupSummaryRows = computed(() => {
  const configured = new Set(configuredEquipmentKeys.value)
  return [
    { key: 'sensitivity', label: 'SEN', name: 'Sensitivity', value: equipment.value.sensitivity, suffix: 'deg' },
    { key: 'forceFeedbackStrength', label: 'FFB', name: 'Force Feedback Strength', value: equipment.value.forceFeedbackStrength, suffix: '%' },
    { key: 'forceFeedbackScale', label: 'FFS', name: 'Force Feedback Scale', value: equipment.value.forceFeedbackScale === 'peak' ? 'Peak' : 'Linear' },
    { key: 'naturalDamper', label: 'NDP', name: 'Natural Damper', value: equipment.value.naturalDamper, suffix: '%' },
    { key: 'naturalFriction', label: 'NFR', name: 'Natural Friction', value: equipment.value.naturalFriction, suffix: '%' },
    { key: 'naturalInertia', label: 'NIN', name: 'Natural Inertia', value: equipment.value.naturalInertia, suffix: '%' },
    { key: 'interpolationFilter', label: 'INT', name: 'Interpolation Filter', value: equipment.value.interpolationFilter },
    { key: 'forceEffectIntensity', label: 'FEI', name: 'Force Effect Intensity', value: equipment.value.forceEffectIntensity },
    { key: 'forceEffectStrength', label: 'FOR', name: 'Force Effect Strength', value: equipment.value.forceEffectStrength, suffix: '%' },
    { key: 'springEffectStrength', label: 'SPR', name: 'Spring Effect Strength', value: equipment.value.springEffectStrength, suffix: '%' },
    { key: 'damperEffectStrength', label: 'DPR', name: 'Damper Effect Strength', value: equipment.value.damperEffectStrength, suffix: '%' },
    { key: 'brakeForce', label: 'BRF', name: 'Brake Force', value: equipment.value.brakeForce, suffix: '%' },
    { key: 'tcDefault', label: 'TC', name: 'TC default', value: equipment.value.tcDefault },
    { key: 'absDefault', label: 'ABS', name: 'ABS default', value: equipment.value.absDefault }
  ].filter((row) => configured.has(row.key) && hasDisplayValue(row.value))
})

const hasEquipmentSummary = computed(() => hardwareSummaryRows.value.length > 0 || setupSummaryRows.value.length > 0)

const tabs = computed<Array<{ id: ProfileTab; label: string }>>(() => [
  { id: 'account', label: 'Profilo' },
  { id: 'equipment', label: 'Attrezzatura' },
  { id: 'calendar', label: 'Calendario' },
  { id: 'coach', label: props.userRole === 'coach' ? 'Coach' : 'Coach e lezioni' }
])

const displayName = computed((): string => {
  if (props.userNickname) return props.userNickname
  if (props.userEmail) return props.userEmail.split('@')[0] ?? 'Utente'
  return 'Utente'
})

const pageTitle = computed((): string => {
  const titles: Record<string, string> = {
    pilot: 'Profilo Pilota',
    coach: 'Profilo Coach',
    admin: 'Profilo Admin'
  }
  return titles[props.userRole || 'pilot'] ?? 'Profilo Pilota'
})

const roleLabel = computed((): string => {
  const labels: Record<string, string> = {
    pilot: 'PILOTA',
    coach: 'COACH',
    admin: 'ADMIN'
  }
  return labels[props.userRole || 'pilot'] ?? 'PILOTA'
})

function cloneEquipment(source: ReturnType<typeof createDefaultEquipment>) {
  return { ...source }
}

function normalizeEquipment(raw: any) {
  const merged = { ...createDefaultEquipment(), ...(raw || {}) }

  if (raw?.ffbGain && !raw?.forceFeedbackStrength) {
    const parsed = Number(String(raw.ffbGain).replace('%', '').trim())
    if (!Number.isNaN(parsed)) merged.forceFeedbackStrength = parsed
  }

  if (raw?.brakePressure && !raw?.brakeForce) {
    const parsed = Number(String(raw.brakePressure).replace('%', '').trim())
    if (!Number.isNaN(parsed)) merged.brakeForce = parsed
  }

  if (raw?.steeringLock && !raw?.sensitivity) {
    const parsed = Number(String(raw.steeringLock).replace('deg', '').trim())
    if (!Number.isNaN(parsed)) merged.sensitivity = parsed
  }

  return merged
}

function hasDisplayValue(value: unknown): boolean {
  return value !== null && value !== undefined && String(value).trim() !== ''
}

function formatEquipmentValue(value: unknown, suffix = ''): string {
  if (!hasDisplayValue(value)) return '-'
  const normalized = String(value).trim()
  return suffix ? `${normalized}${suffix}` : normalized
}

function startEquipmentEdit() {
  equipment.value = cloneEquipment(savedEquipment.value)
  saveSuccess.value = false
  isEditingEquipment.value = true
}

function cancelEquipmentEdit() {
  equipment.value = cloneEquipment(savedEquipment.value)
  saveSuccess.value = false
  isEditingEquipment.value = false
}

function setForceFeedbackScale(value: 'peak' | 'linear') {
  equipment.value.forceFeedbackScale = value
}

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

async function handleSaveEquipment() {
  if (!currentUser.value) return
  isSaving.value = true

  try {
    await trackedUpdateDoc(doc(db, 'users', currentUser.value.uid), {
      equipment: equipment.value
    }, 'ProfilePage')
    savedEquipment.value = cloneEquipment(equipment.value)
    configuredEquipmentKeys.value = Object.keys(equipment.value)
    isEditingEquipment.value = false
    saveSuccess.value = true
    setTimeout(() => saveSuccess.value = false, 2000)
  } catch (error) {
    console.error('[PROFILE] Save error:', error)
  } finally {
    isSaving.value = false
  }
}

onMounted(async () => {
  if (currentUser.value) {
    const profile = await getUserProfile(currentUser.value.uid)
    if (profile?.equipment) {
      configuredEquipmentKeys.value = Object.keys(profile.equipment)
      equipment.value = normalizeEquipment(profile.equipment)
      savedEquipment.value = cloneEquipment(equipment.value)
    }
    await loadSharedCount()
  }
})
</script>

<template>
  <div class="profile-page">
    <header class="profile-header">
      <div class="header-inner">
        <button class="back-btn" @click="emit('back')">
          <svg viewBox="0 0 20 20" fill="none">
            <path d="M12 4L6 10L12 16" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          Dashboard
        </button>

        <div class="header-brand">
          <span class="brand-badge">ACC</span>
          <span class="brand-name">TELEMETRY</span>
        </div>

        <div class="header-user">
          <UiUserDropdown
            :user-name="displayName"
            @logout="emit('logout')"
            @go-to-profile="activeTab = 'account'"
          />
        </div>
      </div>
    </header>

    <main class="profile-main">
      <div class="profile-container">
        <div class="profile-hero">
          <div class="avatar-container">
            <svg class="avatar-helmet" viewBox="0 0 100 100" fill="none">
              <defs>
                <linearGradient id="helmetGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stop-color="#e10600" />
                  <stop offset="100%" stop-color="#ff6b00" />
                </linearGradient>
              </defs>
              <path d="M50 10C30 10 15 25 15 45V60C15 75 25 85 40 88L45 90H55L60 88C75 85 85 75 85 60V45C85 25 70 10 50 10Z" stroke="url(#helmetGrad)" stroke-width="3" fill="none" />
              <path d="M20 45H80C80 45 78 55 50 55C22 55 20 45 20 45Z" stroke="url(#helmetGrad)" stroke-width="2" fill="rgba(225,6,0,0.1)" />
              <line x1="50" y1="15" x2="50" y2="85" stroke="url(#helmetGrad)" stroke-width="1.5" />
            </svg>
          </div>

          <div class="hero-copy">
            <h1>{{ pageTitle }}</h1>
            <div class="hero-meta">
              <span class="role-badge" :class="`role-badge--${userRole || 'pilot'}`">{{ roleLabel }}</span>
              <span>{{ displayName }}</span>
              <span>{{ userEmail || 'Email non disponibile' }}</span>
            </div>
          </div>
        </div>

        <nav class="profile-tabs">
          <button
            v-for="tab in tabs"
            :key="tab.id"
            class="profile-tab"
            :class="{ 'profile-tab--active': activeTab === tab.id }"
            @click="activeTab = tab.id"
          >
            {{ tab.label }}
          </button>
        </nav>

        <section v-if="activeTab === 'account'" class="tab-panel account-grid">
          <div class="profile-card">
            <h3 class="card-title">Sessioni condivise</h3>
            <p v-if="sharedSessionsCount > 0" class="muted-text">
              Hai <strong>{{ sharedSessionsCount }}</strong> sessioni condivise pubblicamente.
            </p>
            <p v-else class="muted-text">Nessuna sessione condivisa.</p>
            <button
              v-if="sharedSessionsCount > 0"
              class="danger-action"
              :class="{ 'danger-action--success': revokeSuccess }"
              :disabled="isRevoking"
              @click="revokeAll"
            >
              <template v-if="isRevoking">Revocando...</template>
              <template v-else-if="revokeSuccess">Revocate</template>
              <template v-else>Revoca tutte</template>
            </button>
          </div>

          <div class="profile-card">
            <h3 class="card-title">Reset tempi storici</h3>
            <p class="muted-text">
              Elimina i best storici salvati. Alla prossima sincronizzazione verranno ricalcolati dalle sessioni.
            </p>
            <button
              class="danger-action"
              :class="{ 'danger-action--success': resetBestsSuccess }"
              :disabled="isResettingBests"
              @click="resetHistoricalBests"
            >
              <template v-if="isResettingBests">Eliminando...</template>
              <template v-else-if="resetBestsSuccess">Eliminati {{ resetBestsCount }} tracciati</template>
              <template v-else>Elimina tutti i best</template>
            </button>
          </div>
        </section>

        <section v-else-if="activeTab === 'equipment'" class="tab-panel">
          <div class="profile-card equipment-card">
            <div class="card-head">
              <h3 class="card-title">Attrezzatura e impostazioni</h3>
              <div class="card-actions">
                <template v-if="isEditingEquipment">
                  <button class="ghost-action" type="button" :disabled="isSaving" @click="cancelEquipmentEdit">Annulla</button>
                  <button
                    class="primary-action"
                    :class="{ 'primary-action--success': saveSuccess }"
                    :disabled="isSaving"
                    @click="handleSaveEquipment"
                  >
                    <template v-if="isSaving">Salvataggio...</template>
                    <template v-else-if="saveSuccess">Salvato</template>
                    <template v-else>Salva</template>
                  </button>
                </template>
                <button v-else class="primary-action" type="button" @click="startEquipmentEdit">Modifica</button>
              </div>
            </div>

            <div v-if="!isEditingEquipment" class="equipment-summary">
              <div v-if="hasEquipmentSummary" class="equipment-summary-sections">
                <section v-if="hardwareSummaryRows.length" class="summary-section">
                  <h4>Hardware</h4>
                  <div class="summary-grid">
                    <div v-for="row in hardwareSummaryRows" :key="row.label" class="summary-cell">
                      <span>{{ row.label }}</span>
                      <strong>{{ formatEquipmentValue(row.value) }}</strong>
                    </div>
                  </div>
                </section>

                <section v-if="setupSummaryRows.length" class="summary-section">
                  <h4>Setup base</h4>
                  <div class="settings-summary-grid">
                    <div v-for="row in setupSummaryRows" :key="row.label" class="setting-pill">
                      <span>{{ row.label }}</span>
                      <strong>{{ formatEquipmentValue(row.value, row.suffix) }}</strong>
                      <small>{{ row.name }}</small>
                    </div>
                  </div>
                </section>
              </div>
              <div v-else class="empty-equipment">Attrezzatura non configurata.</div>
            </div>

            <div v-else class="equipment-sections">
              <div class="equipment-section">
                <h4>Hardware</h4>
                <div class="form-grid">
                  <label class="form-group">
                    <span>Volante / Base</span>
                    <input v-model="equipment.volante" type="text" placeholder="Es. Fanatec CSL DD 8Nm" />
                  </label>
                  <label class="form-group">
                    <span>Corona / Rim</span>
                    <input v-model="equipment.corona" type="text" placeholder="Es. ClubSport Formula V2" />
                  </label>
                  <label class="form-group">
                    <span>Pedaliera</span>
                    <input v-model="equipment.pedaliera" type="text" placeholder="Es. CSL Pedals + Load Cell" />
                  </label>
                  <label class="form-group">
                    <span>Struttura / Rig</span>
                    <input v-model="equipment.struttura" type="text" placeholder="Es. Next Level Racing 2.0" />
                  </label>
                </div>
              </div>

              <div class="equipment-section">
                <h4>Impostazioni base Fanatec</h4>
                <div class="fanatec-settings">
                  <div class="scale-row">
                    <div>
                      <span>[FFS]</span>
                      <strong>Force Feedback Scale</strong>
                    </div>
                    <div class="segmented-control">
                      <button
                        type="button"
                        :class="{ 'segmented-control__item--active': equipment.forceFeedbackScale === 'peak' }"
                        class="segmented-control__item"
                        @click="setForceFeedbackScale('peak')"
                      >
                        Peak
                      </button>
                      <button
                        type="button"
                        :class="{ 'segmented-control__item--active': equipment.forceFeedbackScale === 'linear' }"
                        class="segmented-control__item"
                        @click="setForceFeedbackScale('linear')"
                      >
                        Linear
                      </button>
                    </div>
                  </div>

                  <label v-for="setting in wheelSettingDefinitions" :key="setting.key" class="slider-row">
                    <div class="slider-label">
                      <span>[{{ setting.code }}]</span>
                      <strong>{{ setting.label }}</strong>
                    </div>
                    <input
                      v-model.number="equipment[setting.key]"
                      type="range"
                      :min="setting.min"
                      :max="setting.max"
                      :step="setting.step"
                    />
                    <output>{{ formatEquipmentValue(equipment[setting.key], setting.suffix) }}</output>
                  </label>
                </div>

                <div class="form-grid form-grid--assist">
                  <label class="form-group">
                    <span>TC default</span>
                    <input v-model="equipment.tcDefault" type="text" placeholder="Es. 3" />
                  </label>
                  <label class="form-group">
                    <span>ABS default</span>
                    <input v-model="equipment.absDefault" type="text" placeholder="Es. 4" />
                  </label>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section v-else-if="activeTab === 'calendar'" class="tab-panel">
          <ProfileRaceCalendarCard />
        </section>

        <section v-else-if="activeTab === 'coach'" class="tab-panel coach-grid">
          <ProfileCoachAssociationCard v-if="userRole !== 'coach'" />
          <ProfileCoachLessonsCard />
        </section>
      </div>
    </main>
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/scss/variables' as *;

$color-bg: #0d0d12;
$color-card: #121218;
$max-width: 1400px;

.profile-page {
  min-height: 100vh;
  background: $color-bg;
  color: #fff;
  font-family: $font-primary;
}

.profile-header {
  position: sticky;
  top: 0;
  z-index: 100;
  padding: 16px 24px;
  background: #0d0d12;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.header-inner {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  max-width: $max-width;
  margin: 0 auto;
}

.header-brand {
  display: flex;
  align-items: center;
  gap: 10px;
  justify-self: center;
}

.header-user {
  justify-self: end;
}

.brand-badge {
  padding: 5px 8px;
  border: 2px solid $racing-red;
  border-radius: 5px;
  color: $racing-red;
  font-family: $font-display;
  font-size: 16px;
  font-weight: 700;
}

.brand-name {
  font-family: $font-display;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: 2px;
}

.back-btn {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  width: fit-content;
  padding: 8px 16px;
  background: none;
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.7);
  font-family: $font-primary;
  font-size: 14px;
  cursor: pointer;

  svg {
    width: 20px;
    height: 20px;
  }

  &:hover {
    color: #fff;
    border-color: rgba($racing-red, 0.4);
  }
}

.profile-main {
  padding: 40px 24px;
}

.profile-container {
  max-width: $max-width;
  margin: 0 auto;
}

.profile-hero {
  display: flex;
  align-items: center;
  gap: 26px;
  margin-bottom: 26px;
}

.avatar-container {
  width: 92px;
  height: 92px;
  flex: 0 0 auto;
}

.avatar-helmet {
  width: 100%;
  height: 100%;
}

.hero-copy {
  min-width: 0;

  h1 {
    margin: 0 0 12px;
    font-size: 30px;
    font-weight: 800;
  }
}

.hero-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 10px;
  color: rgba(255, 255, 255, 0.58);
  font-size: 14px;
}

.role-badge {
  display: inline-block;
  padding: 4px 10px;
  border-radius: 5px;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 1px;

  &--pilot {
    background: rgba($racing-red, 0.18);
    color: $racing-red;
    border: 1px solid rgba($racing-red, 0.36);
  }

  &--coach {
    background: rgba(59, 130, 246, 0.18);
    color: #60a5fa;
    border: 1px solid rgba(59, 130, 246, 0.36);
  }

  &--admin {
    background: rgba(234, 179, 8, 0.18);
    color: #fbbf24;
    border: 1px solid rgba(234, 179, 8, 0.36);
  }
}

.profile-tabs {
  display: flex;
  gap: 6px;
  padding: 8px;
  margin-bottom: 24px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 12px;
}

.profile-tab {
  flex: 1;
  min-height: 42px;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 9px;
  color: rgba(255, 255, 255, 0.52);
  font-family: $font-primary;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.5px;
  cursor: pointer;

  &:hover {
    color: rgba(255, 255, 255, 0.82);
    background: rgba(255, 255, 255, 0.04);
  }

  &--active {
    color: #fff;
    background: rgba($racing-orange, 0.14);
    border-color: rgba($racing-orange, 0.3);
  }
}

.tab-panel {
  animation: fadeIn 0.18s ease;
}

.account-grid,
.coach-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
}

.profile-card {
  padding: 28px;
  background: $color-card;
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 16px;
}

.card-head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 18px;
  margin-bottom: 24px;
}

.card-actions {
  display: flex;
  gap: 10px;
  align-items: center;
}

.card-title {
  margin: 0 0 18px;
  color: rgba(255, 255, 255, 0.92);
  font-size: 18px;
  font-weight: 700;
}

.card-head .card-title {
  margin-bottom: 0;
}

.muted-text {
  margin: 0 0 18px;
  color: rgba(255, 255, 255, 0.62);
  font-size: 14px;
  line-height: 1.5;

  strong {
    color: var(--gold, #ffc800);
  }
}

.danger-action,
.ghost-action,
.primary-action {
  min-height: 42px;
  padding: 0 18px;
  border-radius: 10px;
  font-family: $font-primary;
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;

  &:disabled {
    opacity: 0.62;
    cursor: wait;
  }
}

.ghost-action {
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.12);
  color: rgba(255, 255, 255, 0.7);
}

.danger-action {
  background: rgba(239, 68, 68, 0.14);
  border: 1px solid rgba(239, 68, 68, 0.34);
  color: #f87171;

  &--success {
    background: rgba(34, 197, 94, 0.14);
    border-color: rgba(34, 197, 94, 0.34);
    color: #22c55e;
  }
}

.primary-action {
  background: linear-gradient(135deg, $racing-red, $racing-orange);
  border: 0;
  color: #fff;

  &--success {
    background: #22c55e;
  }
}

.equipment-sections {
  display: flex;
  flex-direction: column;
  gap: 24px;
}

.equipment-summary,
.equipment-summary-sections {
  display: flex;
  flex-direction: column;
  gap: 22px;
}

.summary-section {
  h4 {
    margin: 0 0 12px;
    color: rgba(255, 255, 255, 0.72);
    font-size: 13px;
    letter-spacing: 0.5px;
    text-transform: uppercase;
  }
}

.summary-grid,
.settings-summary-grid {
  display: grid;
  gap: 10px;
}

.summary-grid {
  grid-template-columns: repeat(4, minmax(0, 1fr));
}

.settings-summary-grid {
  grid-template-columns: repeat(7, minmax(0, 1fr));
}

.summary-cell,
.setting-pill {
  min-width: 0;
  padding: 12px;
  background: rgba(255, 255, 255, 0.035);
  border: 1px solid rgba(255, 255, 255, 0.06);
  border-radius: 10px;

  span {
    display: block;
    margin-bottom: 5px;
    color: rgba(255, 255, 255, 0.42);
    font-size: 10px;
    font-weight: 800;
    text-transform: uppercase;
  }

  strong {
    display: block;
    overflow-wrap: anywhere;
    font-size: 13px;
  }
}

.setting-pill {
  min-height: 74px;

  small {
    display: block;
    margin-top: 5px;
    color: rgba(255, 255, 255, 0.36);
    font-size: 10px;
    line-height: 1.25;
  }
}

.empty-equipment {
  padding: 18px;
  background: rgba(255, 255, 255, 0.03);
  border: 1px dashed rgba(255, 255, 255, 0.12);
  border-radius: 12px;
  color: rgba(255, 255, 255, 0.52);
  font-size: 14px;
}

.equipment-section {
  h4 {
    margin: 0 0 16px;
    color: rgba(255, 255, 255, 0.72);
    font-size: 14px;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
}

.form-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 18px;

  &--settings {
    grid-template-columns: repeat(5, minmax(0, 1fr));
  }

  &--assist {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    margin-top: 18px;
  }
}

.form-group {
  display: flex;
  flex-direction: column;
  gap: 8px;

  span {
    color: rgba(255, 255, 255, 0.52);
    font-size: 11px;
    font-weight: 800;
    text-transform: uppercase;
  }

  input {
    min-height: 46px;
    padding: 0 14px;
    background: rgba(255, 255, 255, 0.04);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 10px;
    color: #fff;
    font-family: $font-primary;
    font-size: 14px;

    &:focus {
      outline: none;
      border-color: rgba($racing-orange, 0.55);
    }
  }
}

.fanatec-settings {
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 16px;
  background: rgba(255, 255, 255, 0.025);
  border: 1px solid rgba(255, 255, 255, 0.07);
  border-radius: 12px;
}

.scale-row,
.slider-row {
  display: grid;
  grid-template-columns: 220px minmax(160px, 1fr) 70px;
  gap: 14px;
  align-items: center;
}

.scale-row {
  padding-bottom: 10px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.06);
}

.slider-label,
.scale-row > div:first-child {
  min-width: 0;

  span {
    display: inline;
    margin-right: 6px;
    color: rgba(255, 255, 255, 0.5);
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
  }

  strong {
    color: rgba(255, 255, 255, 0.78);
    font-size: 13px;
  }
}

.slider-row {
  input[type='range'] {
    width: 100%;
    accent-color: $racing-orange;
  }

  output {
    color: #fff;
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    text-align: right;
  }
}

.segmented-control {
  display: inline-flex;
  width: fit-content;
  padding: 3px;
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 9px;
}

.segmented-control__item {
  min-height: 32px;
  padding: 0 12px;
  background: transparent;
  border: 0;
  border-radius: 7px;
  color: rgba(255, 255, 255, 0.58);
  font-family: $font-primary;
  font-size: 12px;
  font-weight: 800;
  cursor: pointer;

  &--active {
    background: rgba($racing-orange, 0.18);
    color: $racing-orange;
  }
}

@keyframes fadeIn {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

@media (max-width: 1100px) {
  .account-grid,
  .coach-grid,
  .form-grid,
  .form-grid--settings,
  .form-grid--assist,
  .scale-row,
  .slider-row {
    grid-template-columns: 1fr;
  }

  .summary-grid,
  .settings-summary-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .slider-row output {
    text-align: left;
  }
}

@media (max-width: 700px) {
  .header-inner {
    grid-template-columns: 1fr auto;
  }

  .header-brand {
    display: none;
  }

  .profile-hero {
    align-items: flex-start;
  }

  .profile-tabs {
    overflow-x: auto;
  }

  .profile-tab {
    min-width: 130px;
  }

  .summary-grid,
  .settings-summary-grid {
    grid-template-columns: 1fr;
  }
}
</style>
