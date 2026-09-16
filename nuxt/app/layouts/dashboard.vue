<script setup lang="ts">
// ============================================
// Dashboard Layout - Wraps authenticated pages
// ============================================

import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import { useConfirmedLogout } from '~/composables/useConfirmedLogout'

const { userDisplayName, userEmail, logout: firebaseLogout } = useFirebaseAuth()
const { runConfirmedLogout } = useConfirmedLogout(firebaseLogout)
const route = useRoute()
const router = useRouter()

// Inject profile navigation from app.vue
const goToProfile = inject<() => void>('goToProfile')
const goToSettings = inject<() => void>('goToSettings')

// Determine active tab from route path
const activeTab = computed(() => {
  const path = route.path
  if (path.startsWith('/sessioni')) return 'sessioni'
  if (path.startsWith('/piste')) return 'piste'
  if (path.startsWith('/pitwall')) return 'pitwall'
  if (path.startsWith('/spotter') || path.startsWith('/dev-voice-lab')) return 'spotter'
  if (path.startsWith('/area-pilota')) return 'area-pilota'
  if (path.startsWith('/hud') || path.startsWith('/test-hud')) return 'hud'
  return 'panoramica'
})

// Display name
const displayName = computed(() => {
  if (userDisplayName.value) return userDisplayName.value
  if (userEmail.value) return userEmail.value.split('@')[0]
  return 'Utente'
})

// Handlers
const handleLogout = async () => {
  await runConfirmedLogout(async () => {
    await navigateTo('/')
  })
}

const handleGoToProfile = () => {
  if (goToProfile) goToProfile()
}

const handleGoToSettings = () => {
  if (goToSettings) goToSettings()
}
</script>

<template>
  <div class="dashboard-layout" :class="{ 'racing-overview-shell': route.path === '/panoramica' }">
    <UiRacingBackdrop v-if="route.path === '/panoramica'" />
    <!-- Sticky Header: TopBar + TabsBar -->
    <div class="dashboard-sticky-header">
      <LayoutTopBar
        :user-name="displayName"
        @logout="handleLogout"
        @go-to-profile="handleGoToProfile"
        @go-to-settings="handleGoToSettings"
      />

      <!-- TabsBar with NuxtLink navigation -->
      <LayoutTabsBarRouter :active-tab="activeTab" />
    </div>

    <!-- Page Content with transitions -->
    <main class="main-content">
      <slot />
    </main>
  </div>
</template>

<style lang="scss" scoped>
.dashboard-layout {
  min-height: 100vh;
  background: #0d0d12;
}

.dashboard-sticky-header {
  position: sticky;
  top: 0;
  z-index: 100;
  background: #0d0d12;
}

.main-content {
  flex: 1;
}
.racing-overview-shell {
  position: relative; isolation: isolate; background: transparent;
  --racing-accent: #ff0024;
  :deep(.topbar), :deep(.tabsbar), .dashboard-sticky-header { background: transparent; }
  .dashboard-sticky-header { position: relative; }
  :deep(.topbar__inner) { max-width: 1800px; padding: 14px 28px; }
  :deep(.brand-logo) { width: clamp(200px, 22vw, 300px); }
  :deep(.tab) { font-family: 'Racer Display', 'Arial Narrow', sans-serif; font-style: italic; font-size: 18px; font-weight: 700; letter-spacing: 0; padding: 13px 26px; color: #ccc; transition: color .15s; }
  :deep(.tab--active) { color: #fff; }
  :deep(.tab--active::after) { height: 6px; background: var(--racing-accent); clip-path: polygon(5px 0,100% 0,calc(100% - 5px) 100%,0 100%); }
  :deep(.page-container) { max-width: 1800px; padding: 18px 26px 22px; }
}
@media (max-width: 700px) {
  .racing-overview-shell :deep(.tabsbar__inner) { overflow-x: auto; justify-content: flex-start; padding: 0 10px; gap: 0; }
  .racing-overview-shell :deep(.tab) { font-size: 15px; padding: 13px 15px; }
  .racing-overview-shell :deep(.page-container) { padding: 14px; }
}
</style>
