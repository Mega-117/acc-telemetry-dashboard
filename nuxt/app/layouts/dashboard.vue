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
.dashboard-layout {
  min-height: 100vh;
  background: transparent;
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
  // Fill the available window; content can still grow beyond it on small screens.
  min-height: var(--dashboard-viewport-height, 100dvh);
  display: flex;
  flex-direction: column;
  --page-bottom-space: 22px;
  position: relative; isolation: isolate; background: transparent;
  --racing-accent: #ff0024;
  --racing-nav-border: rgba(255, 255, 255, 0.1411764706);
  :deep(.topbar), :deep(.tabsbar) { background: transparent; border-bottom-color: var(--racing-nav-border); }
  :deep(.tabsbar) { border-bottom: 0; }
  :deep(.tab--section-start::before) { background: #b4b4b4; }
  // Sticky is relative to the app scroll area, already below the native titlebar.
  .dashboard-sticky-header { background: #020202f5; flex-shrink: 0; }
  .main-content { display: flex; flex-direction: column; }
  :deep(.dropdown-trigger), :deep(.pwc-bell) {
    height: 46px; border: 1px solid #ffffff85; border-radius: 0;
    background: transparent; color: #eee;
  }
  :deep(.pwc-bell) { width: 46px; }
  :deep(.dropdown-trigger) { padding: 0 18px; gap: 16px; }
  :deep(.user-name) { font: italic 500 18px/1.2 'Racer Display', sans-serif; text-transform: uppercase; }
  :deep(.arrow-icon) { color: #ddd; }
  :deep(.dropdown-trigger:hover), :deep(.pwc-bell:hover), :deep(.pwc-bell.is-open) { border-color: var(--racing-accent); background: #ff002414; }
  :deep(.dropdown-menu), :deep(.pwc-notices) { border-radius: 0; background: #090909; border-color: #ffffff70; box-shadow: 0 16px 35px #000b; }
  :deep(.pwc-notices) { top: calc(100% + 8px); }
  :deep(.dropdown-item) { border-radius: 0; }
  :deep(.dropdown-item:hover:not(:disabled)) { background: #ff002414; }
  :deep(.pwc-notices header strong) { font: italic 700 18px 'Racer Display', sans-serif; text-transform: uppercase; }
  :deep(.dropdown-trigger:focus-visible), :deep(.pwc-bell:focus-visible) { outline: 2px solid #fff; outline-offset: 3px; }
  :deep(.topbar__inner) { max-width: 1800px; padding: 14px 28px; }
  :deep(.brand-logo) { width: clamp(200px, 22vw, 300px); }
  :deep(.tab) { font-family: 'Racer Display', 'Arial Narrow', sans-serif; font-style: italic; font-size: 16px; font-weight: 700; letter-spacing: 0; padding: 13px 26px; color: #ccc; transition: color .15s; }
  :deep(.tab--active) { color: #fff; }
  :deep(.tab--active::after) { height: 3px; background: var(--racing-accent); clip-path: polygon(3px 0,100% 0,calc(100% - 3px) 100%,0 100%); }
  :deep(.page-container) { width: 100%; max-width: 1800px; padding: 26px 26px 22px; flex: 1; display: flex; flex-direction: column; }
  :deep(.racing-overview) { flex: 1; }
}
@media (max-width: 700px) {
  .racing-overview-shell :deep(.tabsbar__inner) { overflow-x: auto; justify-content: flex-start; padding: 0 10px; gap: 0; }
  .racing-overview-shell :deep(.tab) { padding: 13px 15px; }
  .racing-overview-shell { --page-bottom-space: 14px; }
  .racing-overview-shell :deep(.page-container) { padding: 14px; }
}
</style>
