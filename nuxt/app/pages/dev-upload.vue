<script setup lang="ts">
import { ref } from 'vue'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import { importSessionFile } from '~/services/sync/sessionFileImportService'

definePageMeta({ layout: false, middleware: 'dev-tools' })
const { currentUser, isAuthenticated } = useFirebaseAuth()
const uploadResults = ref<any[]>([])
const isUploading = ref(false)
const selectedFiles = ref<File[]>([])

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
      const result = await importSessionFile(file, uid, () => {
        if (currentUser.value?.uid !== uid) throw new Error('Account cambiato durante importazione')
      })
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
  background: transparent;
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
