<script setup lang="ts">
// ============================================
// DEV Data Audit - Manage trackBests and legacy data
// ============================================

import { ref, computed, onMounted } from 'vue'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import { useTelemetryData, formatLapTime } from '~/composables/useTelemetryData'
import {
    doc,
    getDocs,
    deleteDoc,
    collection,
    query
} from 'firebase/firestore'
import { db } from '~/config/firebase'

const { currentUser } = useFirebaseAuth()
const { 
    sessions, 
    trackStats, 
    loadSessions, 
    getTrackBests, 
    forceRecalculateTrackBests,
    invalidateTrackBests
} = useTelemetryData()

// State
const isLoading = ref(false)
const trackBestsData = ref<Record<string, any>>({})
const legacyGripSessions = ref<any[]>([])
const recalculateProgress = ref<string[]>([])
const error = ref<string | null>(null)

// Load trackBests for all tracks
async function loadTrackBests() {
    if (!currentUser.value) return
    
    isLoading.value = true
    error.value = null
    trackBestsData.value = {}
    
    try {
        const uid = currentUser.value.uid
        const trackBestsRef = collection(db, `users/${uid}/trackBests`)
        const snapshot = await getDocs(query(trackBestsRef))
        
        snapshot.forEach(docSnap => {
            trackBestsData.value[docSnap.id] = {
                id: docSnap.id,
                ...docSnap.data()
            }
        })
        
        console.log(`[AUDIT] Loaded ${Object.keys(trackBestsData.value).length} trackBests documents`)
        
    } catch (e: any) {
        error.value = e.message
    } finally {
        isLoading.value = false
    }
}

// Find sessions with legacy 'Opt' grip
function findLegacyGripSessions() {
    legacyGripSessions.value = sessions.value.filter(session => {
        const gripBests = (session.summary as any)?.best_by_grip
        return gripBests && Object.keys(gripBests).includes('Opt')
    })
    console.log(`[AUDIT] Found ${legacyGripSessions.value.length} sessions with legacy 'Opt' grip`)
}

// Delete a single trackBests document
async function deleteTrackBests(trackId: string) {
    if (!currentUser.value) return
    
    try {
        const uid = currentUser.value.uid
        const docRef = doc(db, `users/${uid}/trackBests/${trackId}`)
        await deleteDoc(docRef)
        delete trackBestsData.value[trackId]
        recalculateProgress.value.push(`Deleted: ${trackId}`)
        console.log(`[AUDIT] Deleted trackBests: ${trackId}`)
    } catch (e: any) {
        error.value = `Failed to delete ${trackId}: ${e.message}`
    }
}

// Force recalculate a single track
async function recalculateSingleTrack(trackId: string) {
    if (!currentUser.value) return
    
    recalculateProgress.value.push(`Recalculating: ${trackId}...`)
    
    try {
        await forceRecalculateTrackBests(trackId)
        recalculateProgress.value.push(`✅ Done: ${trackId}`)
    } catch (e: any) {
        recalculateProgress.value.push(`❌ Failed: ${trackId} - ${e.message}`)
    }
    
    await loadTrackBests()
}

// Recalculate ALL trackBests
async function recalculateAll() {
    if (!currentUser.value) return
    
    isLoading.value = true
    recalculateProgress.value = []
    
    const trackIds = Object.keys(trackBestsData.value)
    
    for (const trackId of trackIds) {
        await recalculateSingleTrack(trackId)
    }
    
    isLoading.value = false
}

// Delete ALL trackBests (to force fresh calculation)
async function deleteAllTrackBests() {
    if (!currentUser.value) return
    if (!confirm('Delete ALL trackBests? They will be recalculated on next page load.')) return
    
    isLoading.value = true
    recalculateProgress.value = []
    
    const trackIds = Object.keys(trackBestsData.value)
    
    for (const trackId of trackIds) {
        await deleteTrackBests(trackId)
    }
    
    isLoading.value = false
}

// Check if trackBests has legacy format (no bests wrapper OR has 'Opt')
function hasLegacyFormat(data: any): boolean {
    // Check for 'Opt' key
    if (data.Opt || data.bests?.Opt) return true
    // Check for no bests wrapper (old format has grips at root)
    if (!data.bests && (data.Optimum || data.Fast || data.Green)) return true
    return false
}

// Stats
const totalTrackBests = computed(() => Object.keys(trackBestsData.value).length)
const legacyFormatCount = computed(() => {
    return Object.values(trackBestsData.value).filter(hasLegacyFormat).length
})
const tracksWithData = computed(() => trackStats.value.length)

onMounted(async () => {
    await loadSessions()
    await loadTrackBests()
    findLegacyGripSessions()
})
</script>

<template>
  <LayoutPageContainer>
    <h1 class="page-title">DEV Data Audit - TrackBests Manager</h1>
    
    <div class="audit-container">
      <!-- Stats -->
      <div class="stats-row">
        <div class="stat-box">
          <span class="stat-value">{{ tracksWithData }}</span>
          <span class="stat-label">Tracks with Sessions</span>
        </div>
        <div class="stat-box">
          <span class="stat-value">{{ totalTrackBests }}</span>
          <span class="stat-label">TrackBests Docs</span>
        </div>
        <div class="stat-box stat-box--warning">
          <span class="stat-value">{{ legacyFormatCount }}</span>
          <span class="stat-label">Legacy Format</span>
        </div>
        <div class="stat-box stat-box--info">
          <span class="stat-value">{{ legacyGripSessions.length }}</span>
          <span class="stat-label">Sessions with 'Opt'</span>
        </div>
      </div>
      
      <!-- Actions -->
      <div class="actions-row">
        <button @click="loadTrackBests" :disabled="isLoading" class="btn btn--secondary">
          🔄 Refresh
        </button>
        <button @click="recalculateAll" :disabled="isLoading" class="btn btn--primary">
          ⚡ Recalculate All
        </button>
        <button @click="deleteAllTrackBests" :disabled="isLoading" class="btn btn--danger">
          🗑️ Delete All TrackBests
        </button>
      </div>
      
      <!-- Progress Log -->
      <div v-if="recalculateProgress.length > 0" class="progress-log">
        <div v-for="(msg, i) in recalculateProgress" :key="i" class="progress-item">
          {{ msg }}
        </div>
      </div>
      
      <!-- Error -->
      <div v-if="error" class="error-box">
        {{ error }}
      </div>
      
      <!-- Loading -->
      <div v-if="isLoading" class="loading-box">
        Loading...
      </div>
      
      <!-- TrackBests List -->
      <div v-else class="section">
        <h2 class="section-title">TrackBests Documents</h2>
        
        <div v-if="totalTrackBests > 0" class="trackbests-list">
          <div 
            v-for="(data, trackId) in trackBestsData" 
            :key="trackId"
            :class="['trackbest-card', { 'trackbest-card--legacy': hasLegacyFormat(data) }]"
          >
            <div class="trackbest-header">
              <span class="trackbest-name">{{ trackId }}</span>
              <span v-if="hasLegacyFormat(data)" class="legacy-badge">⚠️ Legacy</span>
            </div>
            
            <div class="trackbest-stats">
              <span>Updated: {{ data.lastUpdated?.split('T')[0] || 'N/A' }}</span>
              <span v-if="data.bests">Format: ✅ New (bests wrapper)</span>
              <span v-else>Format: ⚠️ Old (root level)</span>
            </div>
            
            <div class="trackbest-grips">
              <span 
                v-for="grip in ['Optimum', 'Fast', 'Green', 'Greasy', 'Damp', 'Wet', 'Opt']"
                :key="grip"
                :class="['grip-badge', { 
                  'grip-badge--has-data': (data.bests?.[grip] || data[grip]),
                  'grip-badge--legacy': grip === 'Opt'
                }]"
              >
                {{ grip }}
              </span>
            </div>
            
            <div class="trackbest-actions">
              <button @click="recalculateSingleTrack(String(trackId))" class="btn btn--small btn--primary">
                ⚡ Recalc
              </button>
              <button @click="deleteTrackBests(String(trackId))" class="btn btn--small btn--danger">
                🗑️ Delete
              </button>
            </div>
          </div>
        </div>
        
        <div v-else class="empty-box">
          No trackBests documents found.
        </div>
      </div>
      
      <!-- Legacy Grip Sessions -->
      <div v-if="legacyGripSessions.length > 0" class="section">
        <h2 class="section-title">Sessions with Legacy 'Opt' Grip</h2>
        <p class="section-hint">These sessions have 'Opt' in best_by_grip. New sessions will normalize to 'Optimum'.</p>
        
        <div class="legacy-sessions-list">
          <div v-for="session in legacyGripSessions" :key="session.sessionId" class="legacy-session-item">
            <span class="session-id">{{ session.sessionId }}</span>
            <span class="session-track">{{ session.meta?.track }}</span>
            <span class="session-date">{{ session.meta?.date_start?.split('T')[0] }}</span>
          </div>
        </div>
      </div>
      
      <!-- Back Link -->
      <NuxtLink to="/panoramica" class="back-link">
        ← Back to Dashboard
      </NuxtLink>
    </div>
  </LayoutPageContainer>
</template>

<style lang="scss" scoped>
@use '@/assets/scss/variables' as *;

.page-title {
  font-family: 'Outfit', $font-primary;
  font-size: 24px;
  font-weight: 700;
  color: #fff;
  margin-bottom: 24px;
}

.audit-container {
  max-width: 1200px;
}

.stats-row {
  display: flex;
  gap: 16px;
  margin-bottom: 24px;
}

.stat-box {
  flex: 1;
  padding: 16px;
  background: rgba(255, 255, 255, 0.05);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  text-align: center;
  
  &--warning {
    border-color: rgba(255, 200, 50, 0.4);
    background: rgba(255, 200, 50, 0.1);
  }
  
  &--info {
    border-color: rgba(100, 200, 255, 0.4);
    background: rgba(100, 200, 255, 0.1);
  }
}

.stat-value {
  display: block;
  font-size: 32px;
  font-weight: 700;
  color: #fff;
}

.stat-label {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
  text-transform: uppercase;
  letter-spacing: 0.5px;
}

.actions-row {
  display: flex;
  gap: 12px;
  margin-bottom: 24px;
}

.btn {
  padding: 10px 20px;
  border: none;
  border-radius: 8px;
  font-size: 14px;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s ease;
  
  &--secondary {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
    &:hover { background: rgba(255, 255, 255, 0.15); }
  }
  
  &--primary {
    background: rgba(100, 200, 255, 0.8);
    color: #000;
    &:hover { background: rgba(100, 200, 255, 1); }
  }
  
  &--danger {
    background: rgba(255, 100, 100, 0.8);
    color: #fff;
    &:hover { background: rgba(255, 100, 100, 1); }
  }
  
  &--small {
    padding: 6px 12px;
    font-size: 12px;
  }
  
  &:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
}

.progress-log {
  padding: 16px;
  background: rgba(0, 0, 0, 0.3);
  border-radius: 8px;
  margin-bottom: 24px;
  max-height: 200px;
  overflow-y: auto;
  font-family: 'JetBrains Mono', monospace;
  font-size: 12px;
}

.progress-item {
  padding: 4px 0;
  color: rgba(255, 255, 255, 0.8);
}

.error-box {
  padding: 16px;
  background: rgba(255, 100, 100, 0.15);
  border: 1px solid rgba(255, 100, 100, 0.4);
  border-radius: 8px;
  color: #ff6464;
  margin-bottom: 16px;
}

.loading-box {
  padding: 40px;
  text-align: center;
  color: rgba(255, 255, 255, 0.6);
}

.section {
  margin-bottom: 32px;
}

.section-title {
  font-size: 18px;
  font-weight: 600;
  color: #fff;
  margin-bottom: 12px;
}

.section-hint {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.5);
  margin-bottom: 16px;
}

.trackbests-list {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(350px, 1fr));
  gap: 16px;
}

.trackbest-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  padding: 16px;
  
  &--legacy {
    border-color: rgba(255, 200, 50, 0.4);
    background: rgba(255, 200, 50, 0.05);
  }
}

.trackbest-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 12px;
}

.trackbest-name {
  font-size: 16px;
  font-weight: 600;
  color: #fff;
  text-transform: capitalize;
}

.legacy-badge {
  font-size: 12px;
  padding: 4px 8px;
  background: rgba(255, 200, 50, 0.2);
  border-radius: 4px;
  color: #ffc832;
}

.trackbest-stats {
  display: flex;
  gap: 16px;
  margin-bottom: 12px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.6);
}

.trackbest-grips {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.grip-badge {
  padding: 4px 8px;
  border-radius: 4px;
  font-size: 11px;
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.4);
  
  &--has-data {
    background: rgba(100, 255, 150, 0.15);
    color: #64ff96;
  }
  
  &--legacy {
    background: rgba(255, 100, 100, 0.15);
    color: #ff6464;
  }
}

.trackbest-actions {
  display: flex;
  gap: 8px;
}

.empty-box {
  padding: 40px;
  text-align: center;
  color: rgba(255, 255, 255, 0.5);
}

.legacy-sessions-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.legacy-session-item {
  display: grid;
  grid-template-columns: 1fr 150px 100px;
  gap: 12px;
  padding: 10px 14px;
  background: rgba(255, 200, 50, 0.05);
  border: 1px solid rgba(255, 200, 50, 0.2);
  border-radius: 6px;
  font-size: 12px;
}

.session-id {
  font-family: 'JetBrains Mono', monospace;
  color: rgba(255, 255, 255, 0.6);
  overflow: hidden;
  text-overflow: ellipsis;
}

.session-track {
  color: #fff;
}

.session-date {
  color: rgba(255, 255, 255, 0.5);
}

.back-link {
  display: inline-block;
  margin-top: 24px;
  color: rgba(255, 255, 255, 0.6);
  text-decoration: none;
  font-size: 14px;
  
  &:hover {
    color: #fff;
  }
}
</style>
