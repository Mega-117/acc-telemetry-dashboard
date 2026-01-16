<script setup lang="ts">
// ============================================
// Pilot Detail View - Coach shadowing a pilot
// ============================================

import { ref, onMounted, computed } from 'vue'
import { doc, getDoc } from 'firebase/firestore'
import { db } from '~/config/firebase'

definePageMeta({
  layout: 'coach',
  middleware: ['coach']
})

const route = useRoute()
const pilotId = route.params.id as string

// Provide pilot context to all child components
// This makes child components load this pilot's data instead of the coach's
providePilotContext(pilotId)

interface PilotData {
  firstName?: string
  lastName?: string
  nickname: string
  email: string
}

const pilot = ref<PilotData | null>(null)
const isLoading = ref(true)
const activeTab = ref<'panoramica' | 'sessioni' | 'piste'>('panoramica')

// Pilot navigation tabs
const pilotTabs = [
  { id: 'panoramica', label: 'PANORAMICA' },
  { id: 'sessioni', label: 'SESSIONI' },
  { id: 'piste', label: 'PISTE' }
]

// Load pilot data
onMounted(async () => {
  try {
    const snap = await getDoc(doc(db, 'users', pilotId))
    if (snap.exists()) {
      pilot.value = snap.data() as PilotData
    }
  } catch (e) {
    console.error('Error loading pilot:', e)
  } finally {
    isLoading.value = false
  }
})

// Get display name (firstName + lastName, fallback to nickname)
const pilotName = computed(() => {
  if (pilot.value?.firstName && pilot.value?.lastName) {
    return `${pilot.value.firstName} ${pilot.value.lastName}`
  }
  return pilot.value?.nickname || 'Pilota'
})
</script>

<template>
  <div class="pilot-view">
    <!-- Pilot Context Header -->
    <div class="pilot-header">
      <NuxtLink to="/piloti" class="back-link">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M19 12H5M12 19l-7-7 7-7"/>
        </svg>
        Torna ai piloti
      </NuxtLink>
      
      <div class="viewing-badge">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
          <circle cx="12" cy="12" r="3"/>
        </svg>
        <span>Stai visualizzando: <strong>{{ pilotName }}</strong></span>
      </div>
    </div>

    <!-- Pilot Sub-Tabs -->
    <nav class="pilot-tabs">
      <button 
        v-for="tab in pilotTabs" 
        :key="tab.id"
        class="pilot-tab"
        :class="{ 'pilot-tab--active': activeTab === tab.id }"
        @click="activeTab = tab.id as any"
      >
        {{ tab.label }}
      </button>
    </nav>

    <!-- Content Area -->
    <div class="pilot-content">
      <div v-if="isLoading" class="loading">Caricamento...</div>
      
      <template v-else>
        <!-- Panoramica -->
        <div v-if="activeTab === 'panoramica'" class="tab-content">
          <PagesPanoramicaPage />
        </div>

        <!-- Sessioni -->
        <div v-if="activeTab === 'sessioni'" class="tab-content">
          <PagesSessioniPage />
        </div>

        <!-- Piste -->
        <div v-if="activeTab === 'piste'" class="tab-content">
          <PagesPistePage />
        </div>
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
}

// === PILOT HEADER ===
.pilot-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 16px 0;
  margin-bottom: 8px;
}

.back-link {
  display: flex;
  align-items: center;
  gap: 8px;
  color: rgba(255, 255, 255, 0.6);
  text-decoration: none;
  font-size: 14px;
  font-weight: 500;
  transition: color 0.2s;

  &:hover {
    color: #fff;
  }
}

.viewing-badge {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 16px;
  background: rgba($racing-orange, 0.1);
  border: 1px solid rgba($racing-orange, 0.3);
  border-radius: 10px;
  color: $racing-orange;
  font-size: 14px;

  strong {
    color: #fff;
  }
}

// === PILOT TABS ===
.pilot-tabs {
  display: flex;
  gap: 4px;
  padding: 8px;
  background: rgba(255, 255, 255, 0.03);
  border-radius: 12px;
  margin-bottom: 24px;
}

.pilot-tab {
  flex: 1;
  padding: 12px 24px;
  background: transparent;
  border: none;
  border-radius: 8px;
  color: rgba(255, 255, 255, 0.5);
  font-family: $font-primary;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 1px;
  cursor: pointer;
  transition: all 0.2s ease;

  &:hover {
    color: rgba(255, 255, 255, 0.8);
    background: rgba(255, 255, 255, 0.05);
  }

  &--active {
    background: rgba($racing-orange, 0.15);
    color: $racing-orange;
    border: 1px solid rgba($racing-orange, 0.3);
  }
}

// === CONTENT ===
.pilot-content {
  min-height: 400px;
}

.tab-content {
  animation: fadeIn 0.2s ease;
}

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(8px); }
  to { opacity: 1; transform: translateY(0); }
}

.loading {
  text-align: center;
  padding: 60px;
  color: rgba(255, 255, 255, 0.5);
}
</style>
