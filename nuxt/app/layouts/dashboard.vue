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
@use '@/assets/scss/racing-chrome';
.dashboard-layout {
  @include racing-chrome.chrome;
  min-height: 100vh;
  background: transparent;
}

.dashboard-sticky-header {
  position: sticky;
  top: 0;
  z-index: 100;
  background: transparent;
}

.main-content {
  flex: 1;
}
.racing-overview-shell {
  // Fill the available window; content can still grow beyond it on small screens.
  min-height: var(--dashboard-viewport-height, 100dvh);
  display: flex;
  flex-direction: column;
  --page-bottom-space: 22px;
  position: relative; isolation: isolate; background: transparent;
  .dashboard-sticky-header { flex-shrink: 0; }
  .main-content { display: flex; flex-direction: column; }
  :deep(.page-container) { width: 100%; max-width: 1800px; padding: 26px 26px 22px; flex: 1; display: flex; flex-direction: column; }
  :deep(.racing-overview) { flex: 1; }
}
@media (max-width: 700px) {
  .racing-overview-shell { --page-bottom-space: 14px; }
  .racing-overview-shell :deep(.page-container) { padding: 14px; }
}
</style>
