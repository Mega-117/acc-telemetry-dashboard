<script setup lang="ts">
// ============================================
// DEV Cleanup Page - Remove duplicate sessions
// ============================================

import { ref, computed, onMounted } from 'vue'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import {
    doc,
    getDocs,
    deleteDoc,
    collection,
    query
} from 'firebase/firestore'
import { db } from '~/config/firebase'

const { currentUser } = useFirebaseAuth()

// State
const isLoading = ref(false)
const sessions = ref<any[]>([])
const duplicateGroups = ref<Map<string, any[]>>(new Map())
const deletedCount = ref(0)
const error = ref<string | null>(null)

// Identify if sessionId is old format (timestamp_random)
function isOldFormat(sessionId: string): boolean {
  // Old format: starts with number (Unix timestamp)
  return /^\d{13}_/.test(sessionId)
}

// Generate a grouping key from session metadata
function getGroupKey(session: any): string {
  const track = (session.meta?.track || 'unknown').toLowerCase().replace(/\s+/g, '_')
  const dateStart = session.meta?.date_start || ''
  // Normalize to minute precision for grouping
  const dateKey = dateStart.split(':').slice(0, 2).join(':') // YYYY-MM-DDTHH:MM
  return `${dateKey}_${track}`
}

// Load all sessions and identify duplicates
async function loadAndAnalyze() {
  if (!currentUser.value) return
  
  isLoading.value = true
  error.value = null
  
  try {
    const uid = currentUser.value.uid
    const sessionsRef = collection(db, `users/${uid}/sessions`)
    const snapshot = await getDocs(query(sessionsRef))
    
    const allSessions: any[] = []
    snapshot.forEach(doc => {
      allSessions.push({
        sessionId: doc.id,
        ...doc.data()
      })
    })
    
    sessions.value = allSessions
    
    // Group by track + date (minute precision)
    const groups = new Map<string, any[]>()
    
    for (const session of allSessions) {
      const key = getGroupKey(session)
      if (!groups.has(key)) {
        groups.set(key, [])
      }
      groups.get(key)!.push(session)
    }
    
    // Keep only groups with duplicates (more than 1 session)
    const duplicates = new Map<string, any[]>()
    for (const [key, group] of groups) {
      if (group.length > 1) {
        duplicates.set(key, group)
      }
    }
    
    duplicateGroups.value = duplicates
    
    console.log(`[CLEANUP] Found ${allSessions.length} sessions, ${duplicates.size} duplicate groups`)
    
  } catch (e: any) {
    error.value = e.message
    console.error('[CLEANUP] Error:', e)
  } finally {
    isLoading.value = false
  }
}

// Delete old format sessions from a group
async function deleteOldFormatFromGroup(groupKey: string) {
  if (!currentUser.value) return
  
  const uid = currentUser.value.uid
  const group = duplicateGroups.value.get(groupKey)
  if (!group) return
  
  const oldFormatSessions = group.filter(s => isOldFormat(s.sessionId))
  
  for (const session of oldFormatSessions) {
    try {
      // Delete rawChunks subcollection first
      const chunksRef = collection(db, `users/${uid}/sessions/${session.sessionId}/rawChunks`)
      const chunksSnap = await getDocs(chunksRef)
      for (const chunk of chunksSnap.docs) {
        await deleteDoc(chunk.ref)
      }
      
      // Delete session document
      const sessionRef = doc(db, `users/${uid}/sessions/${session.sessionId}`)
      await deleteDoc(sessionRef)
      
      deletedCount.value++
      console.log(`[CLEANUP] Deleted: ${session.sessionId}`)
    } catch (e: any) {
      console.error(`[CLEANUP] Error deleting ${session.sessionId}:`, e.message)
    }
  }
  
  // Refresh
  await loadAndAnalyze()
}

// Delete ALL old format duplicates
async function deleteAllOldFormat() {
  if (!currentUser.value) return
  
  isLoading.value = true
  
  for (const [key, group] of duplicateGroups.value) {
    await deleteOldFormatFromGroup(key)
  }
  
  isLoading.value = false
}

// Stats
const totalSessions = computed(() => sessions.value.length)
const duplicateGroupCount = computed(() => duplicateGroups.value.size)
const oldFormatCount = computed(() => {
  let count = 0
  for (const [_, group] of duplicateGroups.value) {
    count += group.filter(s => isOldFormat(s.sessionId)).length
  }
  return count
})

onMounted(() => {
  loadAndAnalyze()
})
</script>

<template>
  <LayoutPageContainer>
    <h1 class="page-title">DEV Cleanup - Duplicate Sessions</h1>
    
    <div class="cleanup-container">
      <!-- Stats -->
      <div class="stats-row">
        <div class="stat-box">
          <span class="stat-value">{{ totalSessions }}</span>
          <span class="stat-label">Total Sessions</span>
        </div>
        <div class="stat-box stat-box--warning">
          <span class="stat-value">{{ duplicateGroupCount }}</span>
          <span class="stat-label">Duplicate Groups</span>
        </div>
        <div class="stat-box stat-box--danger">
          <span class="stat-value">{{ oldFormatCount }}</span>
          <span class="stat-label">Old Format (to delete)</span>
        </div>
        <div class="stat-box stat-box--success">
          <span class="stat-value">{{ deletedCount }}</span>
          <span class="stat-label">Deleted</span>
        </div>
      </div>
      
      <!-- Actions -->
      <div class="actions-row">
        <button @click="loadAndAnalyze" :disabled="isLoading" class="btn btn--secondary">
          🔄 Refresh
        </button>
        <button 
          @click="deleteAllOldFormat" 
          :disabled="isLoading || oldFormatCount === 0" 
          class="btn btn--danger"
        >
          🗑️ Delete All Old Format ({{ oldFormatCount }})
        </button>
      </div>
      
      <!-- Error -->
      <div v-if="error" class="error-box">
        {{ error }}
      </div>
      
      <!-- Loading -->
      <div v-if="isLoading" class="loading-box">
        Loading...
      </div>
      
      <!-- Duplicate Groups -->
      <div v-else-if="duplicateGroupCount > 0" class="groups-list">
        <div 
          v-for="[key, group] in duplicateGroups" 
          :key="key" 
          class="group-card"
        >
          <div class="group-header">
            <span class="group-key">{{ key }}</span>
            <button 
              @click="deleteOldFormatFromGroup(key)" 
              class="btn btn--small btn--danger"
            >
              Delete Old Format
            </button>
          </div>
          
          <div class="group-sessions">
            <div 
              v-for="session in group" 
              :key="session.sessionId"
              :class="['session-item', { 'session-item--old': isOldFormat(session.sessionId) }]"
            >
              <span class="session-format">
                {{ isOldFormat(session.sessionId) ? '⚠️ OLD' : '✅ NEW' }}
              </span>
              <span class="session-id">{{ session.sessionId }}</span>
              <span class="session-track">{{ session.meta?.track }}</span>
              <span class="session-date">{{ session.meta?.date_start?.split('T')[0] }}</span>
            </div>
          </div>
        </div>
      </div>
      
      <!-- No Duplicates -->
      <div v-else class="success-box">
        ✅ No duplicates found! Your sessions are clean.
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

.cleanup-container {
  max-width: 1000px;
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
  
  &--danger {
    border-color: rgba(255, 100, 100, 0.4);
    background: rgba(255, 100, 100, 0.1);
  }
  
  &--success {
    border-color: rgba(100, 255, 150, 0.4);
    background: rgba(100, 255, 150, 0.1);
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

.success-box {
  padding: 40px;
  text-align: center;
  background: rgba(100, 255, 150, 0.1);
  border: 1px solid rgba(100, 255, 150, 0.3);
  border-radius: 8px;
  color: #64ff96;
  font-size: 18px;
}

.groups-list {
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.group-card {
  background: rgba(255, 255, 255, 0.03);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 8px;
  overflow: hidden;
}

.group-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.05);
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}

.group-key {
  font-family: 'JetBrains Mono', monospace;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.8);
}

.group-sessions {
  padding: 8px;
}

.session-item {
  display: grid;
  grid-template-columns: 80px 1fr 120px 100px;
  gap: 12px;
  padding: 8px 12px;
  border-radius: 6px;
  font-size: 12px;
  
  &--old {
    background: rgba(255, 100, 100, 0.1);
    border: 1px solid rgba(255, 100, 100, 0.3);
  }
}

.session-format {
  font-weight: 600;
}

.session-id {
  font-family: 'JetBrains Mono', monospace;
  color: rgba(255, 255, 255, 0.6);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.session-track {
  color: rgba(255, 255, 255, 0.8);
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
