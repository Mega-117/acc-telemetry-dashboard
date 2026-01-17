<script setup lang="ts">
// ============================================
// ElectronTitlebar - Custom window controls for Electron
// ============================================
// This component is only visible when running inside Electron
// It provides: Refresh, Sync, Minimize, Maximize, Close buttons

import { ref, onMounted } from 'vue'
import { useElectronSync } from '~/composables/useElectronSync'

const isElectronVisible = ref(false)
const isMaximized = ref(false)

// Sync composable
const { isSyncing, syncTelemetryFiles, setupAutoSync, syncResults } = useElectronSync()

// Notification state
const showNotification = ref(false)
const notificationResults = ref<any[]>([])

// Check if running in Electron
onMounted(async () => {
  isElectronVisible.value = !!(window as any).electronAPI
  
  if (isElectronVisible.value) {
    // Check initial maximized state
    try {
      isMaximized.value = await (window as any).electronAPI.windowIsMaximized()
    } catch (e) {
      console.log('[TITLEBAR] Could not get maximized state')
    }
    
    // Setup auto-sync for file changes
    setupAutoSync()
  }
})

// Window control handlers
const handleRefresh = () => {
  (window as any).electronAPI?.pageRefresh()
}

const handleSync = async () => {
  console.log('[TITLEBAR] Manual sync triggered')
  const results = await syncTelemetryFiles()
  console.log('[TITLEBAR] Sync complete:', results)
  
  // Show notification
  notificationResults.value = results
  showNotification.value = true
}

const handleMinimize = () => {
  (window as any).electronAPI?.windowMinimize()
}

const handleMaximize = async () => {
  const result = await (window as any).electronAPI?.windowMaximize()
  isMaximized.value = result
}

const handleClose = () => {
  (window as any).electronAPI?.windowClose()
}

const closeNotification = () => {
  showNotification.value = false
}
</script>

<template>
  <div v-if="isElectronVisible" class="electron-titlebar">
    <div class="titlebar-drag-region">
      <span class="titlebar-title">ACC Telemetry Dashboard</span>
    </div>
    
    <!-- Left buttons: Refresh & Sync -->
    <div class="titlebar-buttons-left">
      <button class="titlebar-btn" title="Aggiorna pagina (F5)" @click="handleRefresh">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 12a9 9 0 11-9-9c2.52 0 4.93 1 6.74 2.74L21 8" />
          <path d="M21 3v5h-5" />
        </svg>
      </button>
      <button 
        class="titlebar-btn" 
        :class="{ 'syncing': isSyncing }"
        :title="isSyncing ? 'Sincronizzazione in corso...' : 'Sincronizza file'"
        :disabled="isSyncing"
        @click="handleSync"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M23 4v6h-6" />
          <path d="M1 20v-6h6" />
          <path d="M3.51 9a9 9 0 0114.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0020.49 15" />
        </svg>
      </button>
    </div>
    
    <!-- Right buttons: Min, Max, Close -->
    <div class="titlebar-buttons-right">
      <button class="titlebar-btn" title="Minimizza" @click="handleMinimize">
        <svg width="12" height="12" viewBox="0 0 12 12">
          <rect y="5" width="12" height="2" fill="currentColor" />
        </svg>
      </button>
      <button class="titlebar-btn" title="Massimizza" @click="handleMaximize">
        <svg width="12" height="12" viewBox="0 0 12 12">
          <rect x="1" y="1" width="10" height="10" stroke="currentColor" stroke-width="2" fill="none" />
        </svg>
      </button>
      <button class="titlebar-btn titlebar-close" title="Chiudi" @click="handleClose">
        <svg width="12" height="12" viewBox="0 0 12 12">
          <path d="M1 1l10 10M11 1L1 11" stroke="currentColor" stroke-width="2" />
        </svg>
      </button>
    </div>
    
    <!-- Sync Notification Banner -->
    <ElectronSyncNotification 
      :results="notificationResults" 
      :visible="showNotification"
      @close="closeNotification"
    />
  </div>
</template>

<style lang="scss" scoped>
.electron-titlebar {
  position: relative;
  flex-shrink: 0;
  width: 100%;
  height: 36px;
  background: #0a0a0f;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  z-index: 9999;
  -webkit-app-region: drag;
}

.titlebar-drag-region {
  flex: 1;
  display: flex;
  align-items: center;
  padding-left: 12px;
  height: 100%;
  min-width: 0; // Allow shrinking
}

.titlebar-title {
  font-family: 'Outfit', sans-serif;
  font-size: 13px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.7);
  letter-spacing: 0.5px;
  white-space: nowrap;
}

.titlebar-buttons-left,
.titlebar-buttons-right {
  display: flex;
  flex-shrink: 0;
  height: 100%;
  -webkit-app-region: no-drag;
}

.titlebar-buttons-left {
  margin-right: 4px;
}

.titlebar-btn {
  width: 40px;
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: rgba(255, 255, 255, 0.6);
  cursor: pointer;
  transition: all 0.15s ease;
  
  &:hover {
    background: rgba(255, 255, 255, 0.1);
    color: #fff;
  }
  
  // Close button - larger and extends to edge
  &.titlebar-close {
    width: 50px;
    margin-right: 0;
    
    &:hover {
      background: #e10600;
      color: #fff;
    }
  }
  
  // Syncing animation
  &.syncing {
    color: #00ff88;
    cursor: wait;
    
    svg {
      animation: spin 0.8s ease-in-out infinite;
      transform-origin: center center;
    }
  }
  
  &:disabled {
    opacity: 0.7;
    cursor: wait;
  }
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}
</style>
