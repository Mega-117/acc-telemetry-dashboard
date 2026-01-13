<script setup lang="ts">
// ============================================
// DashboardMain - Main dashboard with tabs
// ============================================

import { ref, computed, provide } from 'vue'

const props = defineProps<{
  userEmail?: string
  userNickname?: string
}>()

const emit = defineEmits<{
  logout: []
  goToProfile: []
}>()

// Tab state
type TabId = 'panoramica' | 'sessioni' | 'piste'
const activeTab = ref<TabId>('panoramica')

// Session detail state
const selectedSessionId = ref<string | null>(null)

const handleNavigate = (tab: string) => {
  activeTab.value = tab as TabId
  selectedSessionId.value = null // Reset detail when changing tabs
}

// Navigate to session detail
const handleGoToSession = (sessionId: string) => {
  selectedSessionId.value = sessionId
}

// Back from session detail
const handleBackFromSession = () => {
  selectedSessionId.value = null
}

// Provide session navigation to children
provide('goToSession', handleGoToSession)

// Display name
const displayName = computed(() => {
  if (props.userNickname) return props.userNickname
  if (props.userEmail) return props.userEmail.split('@')[0]
  return 'Utente'
})
</script>

<template>
  <LayoutMainLayout
    :user-name="displayName"
    :active-tab="activeTab"
    @logout="emit('logout')"
    @go-to-profile="emit('goToProfile')"
    @navigate="handleNavigate"
  >
    <!-- Tab Content -->
    <Transition name="fade" mode="out-in">
      <!-- Session Detail View -->
      <PagesSessionDetailPage 
        v-if="activeTab === 'sessioni' && selectedSessionId" 
        key="session-detail"
        :session-id="selectedSessionId"
        @back="handleBackFromSession"
      />
      
      <!-- Panoramica -->
      <PagesPanoramicaPage v-else-if="activeTab === 'panoramica'" key="panoramica" />
      
      <!-- Sessioni List -->
      <PagesSessioniPage 
        v-else-if="activeTab === 'sessioni'" 
        key="sessioni" 
        @go-to-session="handleGoToSession"
      />
      
      <!-- Piste -->
      <PagesPistePage v-else-if="activeTab === 'piste'" key="piste" />
    </Transition>
  </LayoutMainLayout>
</template>

<style lang="scss" scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
