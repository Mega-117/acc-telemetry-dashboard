<script setup lang="ts">
// ============================================
// DEV UPLOAD - Development panel for uploading JSON sessions
// ============================================

import { ref } from 'vue'
import { doc, collection, serverTimestamp } from 'firebase/firestore'
import { db } from '~/config/firebase'
import { extractMetadata, generateSessionId } from '~/utils/sessionParser'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import { trackedDeleteDoc, trackedGetDoc, trackedGetDocs, trackedSetDoc } from '~/composables/useFirebaseTracker'

const CALLER = 'DevUpload'

definePageMeta({
  layout: false,
  middleware: 'dev-tools'
})

const { currentUser, isAuthenticated } = useFirebaseAuth()

// === STATE ===
const uploadResults = ref<any[]>([])
const isUploading = ref(false)
const selectedFiles = ref<File[]>([])

// Constants
const CHUNK_SIZE = 400000

// === HELPERS ===

async function calculateHash(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
}

function splitIntoChunks(str: string, size: number): string[] {
  const chunks: string[] = []
  for (let i = 0; i < str.length; i += size) {
    chunks.push(str.slice(i, i + size))
  }
  return chunks
}

async function deleteOldChunks(uid: string, sessionId: string) {
  try {
    const chunksRef = collection(db, `users/${uid}/sessions/${sessionId}/rawChunks`)
    const snapshot = await trackedGetDocs(chunksRef as any, CALLER)
    const deletePromises = snapshot.docs.map(d => trackedDeleteDoc(d.ref, CALLER))
    await Promise.all(deletePromises)
  } catch (e: any) {
    console.warn('[UPLOAD] Error deleting old chunks:', e.message)
  }
}

async function getExistingSession(uid: string, sessionId: string) {
  const sessionRef = doc(db, `users/${uid}/sessions/${sessionId}`)
  const snap = await trackedGetDoc(sessionRef, CALLER)
  return snap.exists() ? { id: sessionId, ...snap.data() } : null
}

// === TRACKBESTS UPDATE ===
// Updates the trackBests collection when a new session is uploaded
async function updateTrackBests(
  uid: string, 
  trackId: string, 
  sessionId: string,
  dateStart: string,
  summary: any
) {
  const trackIdNorm = trackId.toLowerCase().replace(/\s+/g, '_')
  const trackBestsRef = doc(db, `users/${uid}/trackBests/${trackIdNorm}`)
  
  try {
    // Get existing trackBests
    const existingSnap = await trackedGetDoc(trackBestsRef, CALLER)
    const existing = existingSnap.exists() ? existingSnap.data() : null
    
    const gripConditions = ['Flood', 'Wet', 'Damp', 'Greasy', 'Green', 'Fast', 'Optimum']
    // Support both formats: existing.bests (new) OR existing at root (legacy)
    const newBests: Record<string, any> = existing?.bests || 
      (existing ? Object.fromEntries(gripConditions.filter(g => existing[g]).map(g => [g, existing[g]])) : {})
    let hasUpdates = false
    
    // Check each grip condition for improvements
    gripConditions.forEach(grip => {
      const sessionBest = summary.best_by_grip?.[grip]
      if (!sessionBest) return
      
      if (!newBests[grip]) {
        newBests[grip] = {
          bestQualy: null, bestQualyTemp: null, bestQualySessionId: null, bestQualyDate: null,
          bestRace: null, bestRaceTemp: null, bestRaceSessionId: null, bestRaceDate: null,
          bestAvgRace: null, bestAvgRaceTemp: null, bestAvgRaceSessionId: null, bestAvgRaceDate: null
        }
      }
      
      // Check if new session has better qualy time
      if (sessionBest.bestQualy && (!newBests[grip].bestQualy || sessionBest.bestQualy < newBests[grip].bestQualy)) {
        newBests[grip].bestQualy = sessionBest.bestQualy
        newBests[grip].bestQualyTemp = sessionBest.bestQualyTemp
        newBests[grip].bestQualySessionId = sessionId
        newBests[grip].bestQualyDate = dateStart
        hasUpdates = true
      }
      
      // Check if new session has better race time
      if (sessionBest.bestRace && (!newBests[grip].bestRace || sessionBest.bestRace < newBests[grip].bestRace)) {
        newBests[grip].bestRace = sessionBest.bestRace
        newBests[grip].bestRaceTemp = sessionBest.bestRaceTemp
        newBests[grip].bestRaceSessionId = sessionId
        newBests[grip].bestRaceDate = dateStart
        hasUpdates = true
      }
      
      // Check if new session has better avg race time
      if (sessionBest.bestAvgRace && (!newBests[grip].bestAvgRace || sessionBest.bestAvgRace < newBests[grip].bestAvgRace)) {
        newBests[grip].bestAvgRace = sessionBest.bestAvgRace
        newBests[grip].bestAvgRaceTemp = sessionBest.bestAvgRaceTemp
        newBests[grip].bestAvgRaceSessionId = sessionId
        newBests[grip].bestAvgRaceDate = dateStart
        hasUpdates = true
      }
    })
    
    // Save if there were any updates
    if (hasUpdates) {
      await trackedSetDoc(trackBestsRef, {
        trackId: trackIdNorm,
        bests: newBests,
        lastUpdated: serverTimestamp()
      }, CALLER)
      console.log(`[UPLOAD] ✅ Updated trackBests for ${trackIdNorm}`)
    } else {
      console.log(`[UPLOAD] ℹ️ No improvements for ${trackIdNorm}, skipping trackBests update`)
    }
    
    return hasUpdates
  } catch (e: any) {
    console.warn(`[UPLOAD] ⚠️ Error updating trackBests for ${trackIdNorm}:`, e.message)
    return false
  }
}

// === UPLOAD LOGIC ===

async function uploadSession(rawObj: any, rawText: string, fileName: string, uid: string) {
  try {
    // Zero-lap guard: skip sessions with no completed laps
    const totalLaps = rawObj.session_info?.laps_total || 0
    if (totalLaps === 0) {
      return {
        status: 'skipped',
        fileName,
        reason: 'Session has 0 laps (empty session)'
      }
    }

    // Owner validation
    const fileOwnerId = rawObj.ownerId || null
    if (fileOwnerId && fileOwnerId !== uid) {
      return {
        status: 'skipped',
        fileName,
        reason: `Owner mismatch (file: ${fileOwnerId.substring(0, 8)}..., you: ${uid.substring(0, 8)}...)`
      }
    }

    const { meta, summary } = extractMetadata(rawObj, { allowLegacyFallback: true })
    const sessionId = generateSessionId(meta.date_start, meta.track)
    const fileHash = await calculateHash(rawText)
    const existing = await getExistingSession(uid, sessionId)

    let isUpdate = false
    let chunksNeedUpdate = true
    
    if (existing) {
      isUpdate = true
      // Only rewrite chunks if content actually changed
      if ((existing as any).fileHash === fileHash) {
        chunksNeedUpdate = false
      } else {
        await deleteOldChunks(uid, sessionId)
      }
    }

    const chunks = splitIntoChunks(rawText, CHUNK_SIZE)

    // Save session document (always update to refresh summary)
    const sessionRef = doc(db, `users/${uid}/sessions/${sessionId}`)
    await trackedSetDoc(sessionRef, {
      fileHash,
      fileName,
      uploadedAt: serverTimestamp(),
      meta,
      summary,
      rawChunkCount: chunks.length,
      rawSizeBytes: rawText.length,
      rawEncoding: 'json-string',
      version: ((existing as any)?.version || 0) + 1
    }, CALLER)

    // Save upload reference
    const uploadRef = doc(db, `users/${uid}/uploads/${fileHash}`)
    await trackedSetDoc(uploadRef, { fileName, uploadedAt: serverTimestamp(), sessionId }, CALLER)

    // Save chunks only if needed
    if (chunksNeedUpdate) {
      for (let idx = 0; idx < chunks.length; idx++) {
        const chunkRef = doc(db, `users/${uid}/sessions/${sessionId}/rawChunks/${idx}`)
        await trackedSetDoc(chunkRef, { idx, chunk: chunks[idx] }, CALLER)
      }
    }

    // === TRACKBESTS UPDATE ===
    // Update trackBests collection with this session's best times
    const trackBestsUpdated = await updateTrackBests(uid, meta.track, sessionId, meta.date_start, summary)

    return {
      status: isUpdate ? (chunksNeedUpdate ? 'updated' : 'refreshed') : 'created',
      fileName,
      sessionId,
      meta,
      summary,
      trackBestsUpdated
    }

  } catch (error: any) {
    return { status: 'error', fileName, error: error.message }
  }
}

// === FILE HANDLERS ===

// Filter to only include valid session files (exclude .upload_registry.json and other non-session files)
function isValidSessionFile(fileName: string): boolean {
  // Must end with .json
  if (!fileName.endsWith('.json')) return false
  // Must start with 'session_' (telemetry session files)
  if (!fileName.startsWith('session_')) return false
  // Exclude hidden files (starting with .)
  if (fileName.startsWith('.')) return false
  // Exclude upload registry
  if (fileName.includes('upload_registry')) return false
  return true
}

function onFileSelect(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files) {
    selectedFiles.value = Array.from(input.files).filter(f => isValidSessionFile(f.name))
  }
}

function onFolderSelect(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files) {
    selectedFiles.value = Array.from(input.files).filter(f => isValidSessionFile(f.name))
  }
}

async function uploadSelectedFiles() {
  if (!currentUser.value || selectedFiles.value.length === 0) return

  isUploading.value = true
  uploadResults.value = []

  const uid = currentUser.value.uid

  for (const file of selectedFiles.value) {
    try {
      const rawText = await file.text()
      const rawObj = JSON.parse(rawText)
      const result = await uploadSession(rawObj, rawText, file.name, uid)
      uploadResults.value.push(result)
    } catch (e: any) {
      uploadResults.value.push({ status: 'error', fileName: file.name, error: e.message })
    }
  }

  isUploading.value = false
  selectedFiles.value = []
}

function clearResults() {
  uploadResults.value = []
  selectedFiles.value = []
}

function getStatusColor(status: string): string {
  switch (status) {
    case 'created': return '#4ade80'
    case 'updated': return '#60a5fa'
    case 'refreshed': return '#22d3ee'
    case 'unchanged': return '#a1a1aa'
    case 'skipped': return '#fbbf24'
    case 'error': return '#f87171'
    default: return '#fff'
  }
}
</script>

<template>
  <div class="dev-panel">
    <header class="dev-header">
      <h1>🛠️ DEV Upload Panel</h1>
      <p>Upload JSON telemetry files to Firebase</p>
    </header>

    <!-- Auth Status -->
    <div class="auth-status">
      <template v-if="isAuthenticated && currentUser">
        <span class="status-ok">✅ Logged in as: {{ currentUser.email }}</span>
        <span class="user-id">UID: {{ currentUser.uid }}</span>
      </template>
      <template v-else>
        <span class="status-error">❌ Not logged in. Go to main app to login first.</span>
      </template>
    </div>

    <!-- Upload Section -->
    <div v-if="isAuthenticated" class="upload-section">
      <h2>Upload Files</h2>
      
      <div class="upload-buttons">
        <!-- Single/Multiple Files -->
        <label class="upload-btn">
          📄 Select File(s)
          <input 
            type="file" 
            accept=".json" 
            multiple 
            @change="onFileSelect"
            hidden
          />
        </label>

        <!-- Folder -->
        <label class="upload-btn">
          📁 Select Folder
          <input 
            type="file" 
            accept=".json" 
            webkitdirectory
            @change="onFolderSelect"
            hidden
          />
        </label>
      </div>

      <!-- Selected Files -->
      <div v-if="selectedFiles.length > 0" class="selected-files">
        <h3>Selected: {{ selectedFiles.length }} file(s)</h3>
        <ul>
          <li v-for="file in selectedFiles.slice(0, 10)" :key="file.name">
            {{ file.name }} ({{ (file.size / 1024).toFixed(1) }} KB)
          </li>
          <li v-if="selectedFiles.length > 10">... and {{ selectedFiles.length - 10 }} more</li>
        </ul>

        <div class="action-buttons">
          <button class="btn-upload" :disabled="isUploading" @click="uploadSelectedFiles">
            {{ isUploading ? 'Uploading...' : '🚀 Upload to Firebase' }}
          </button>
          <button class="btn-clear" @click="clearResults">Clear</button>
        </div>
      </div>

      <!-- Results -->
      <div v-if="uploadResults.length > 0" class="upload-results">
        <h3>Results</h3>
        <div 
          v-for="(result, i) in uploadResults" 
          :key="i" 
          class="result-item"
          :style="{ borderLeftColor: getStatusColor(result.status) }"
        >
          <span class="result-status" :style="{ color: getStatusColor(result.status) }">
            {{ result.status.toUpperCase() }}
          </span>
          <span class="result-file">{{ result.fileName }}</span>
          <span v-if="result.reason" class="result-reason">{{ result.reason }}</span>
          <span v-if="result.error" class="result-error">{{ result.error }}</span>
          <span v-if="result.meta" class="result-meta">
            {{ result.meta.track }} | {{ result.meta.car }}
          </span>
        </div>
      </div>
    </div>

    <!-- Back to App -->
    <div class="back-link">
      <NuxtLink to="/panoramica">← Back to Dashboard</NuxtLink>
    </div>
  </div>
</template>

<style scoped>
.dev-panel {
  min-height: 100vh;
  background: #0d0d12;
  color: #fff;
  padding: 40px;
  font-family: 'Inter', sans-serif;
}

.dev-header {
  margin-bottom: 32px;
  border-bottom: 1px solid rgba(255,255,255,0.1);
  padding-bottom: 16px;
}

.dev-header h1 {
  font-size: 28px;
  margin-bottom: 8px;
}

.dev-header p {
  color: rgba(255,255,255,0.5);
}

.auth-status {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 16px;
  background: rgba(255,255,255,0.03);
  border-radius: 8px;
  margin-bottom: 24px;
}

.status-ok { color: #4ade80; }
.status-error { color: #f87171; }
.user-id { color: rgba(255,255,255,0.4); font-size: 12px; font-family: monospace; }

.upload-section {
  background: rgba(255,255,255,0.02);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 12px;
  padding: 24px;
}

.upload-section h2 {
  margin-bottom: 16px;
  font-size: 18px;
}

.upload-buttons {
  display: flex;
  gap: 16px;
  margin-bottom: 24px;
}

.upload-btn {
  padding: 16px 24px;
  background: rgba(255,255,255,0.05);
  border: 2px dashed rgba(255,255,255,0.2);
  border-radius: 10px;
  cursor: pointer;
  font-size: 16px;
  transition: all 0.2s;
}

.upload-btn:hover {
  border-color: #ff6b00;
  background: rgba(255, 107, 0, 0.1);
}

.selected-files {
  margin-top: 16px;
  padding: 16px;
  background: rgba(255,255,255,0.03);
  border-radius: 8px;
}

.selected-files h3 {
  margin-bottom: 12px;
  font-size: 14px;
  color: rgba(255,255,255,0.7);
}

.selected-files ul {
  list-style: none;
  padding: 0;
  margin: 0 0 16px 0;
  font-size: 13px;
  color: rgba(255,255,255,0.6);
}

.selected-files li {
  padding: 4px 0;
}

.action-buttons {
  display: flex;
  gap: 12px;
}

.btn-upload {
  padding: 12px 24px;
  background: linear-gradient(135deg, #e10600, #ff6b00);
  border: none;
  border-radius: 8px;
  color: #fff;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.2s;
}

.btn-upload:hover:not(:disabled) {
  box-shadow: 0 0 20px rgba(255, 107, 0, 0.4);
}

.btn-upload:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.btn-clear {
  padding: 12px 24px;
  background: rgba(255,255,255,0.1);
  border: none;
  border-radius: 8px;
  color: #fff;
  cursor: pointer;
}

.upload-results {
  margin-top: 24px;
}

.upload-results h3 {
  margin-bottom: 12px;
  font-size: 14px;
  color: rgba(255,255,255,0.7);
}

.result-item {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: center;
  padding: 12px;
  background: rgba(0,0,0,0.3);
  border-left: 3px solid;
  border-radius: 6px;
  margin-bottom: 8px;
  font-size: 13px;
}

.result-status {
  font-weight: 700;
  min-width: 80px;
}

.result-file {
  color: rgba(255,255,255,0.8);
}

.result-reason, .result-error {
  color: rgba(255,255,255,0.5);
  font-size: 12px;
}

.result-meta {
  color: rgba(255,255,255,0.4);
  font-size: 12px;
}

.back-link {
  margin-top: 32px;
}

.back-link a {
  color: #ff6b00;
  text-decoration: none;
}

.back-link a:hover {
  text-decoration: underline;
}
</style>
