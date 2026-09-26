<script setup lang="ts">
// ============================================
// Dashboard Layout - Wraps authenticated pages
// ============================================

import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import { useConfirmedLogout } from '~/composables/useConfirmedLogout'
import { provideHeaderBack } from '~/composables/useHeaderBack'

const headerBack = provideHeaderBack()

const { userDisplayName, userEmail, logout: firebaseLogout } = useFirebaseAuth()
const { runConfirmedLogout } = useConfirmedLogout(firebaseLogout)
const route = useRoute()
const contentViewport = ref<HTMLElement | null>(null)
// Route changes reset the inner viewport, not the fixed application chrome.
watch(() => route.path, () => { if (contentViewport.value) contentViewport.value.scrollTop = 0 }, { flush: 'post' })

// Inject profile navigation from app.vue
const goToProfile = inject<() => void>('goToProfile')
const goToSettings = inject<() => void>('goToSettings')

// Determine active tab from route path
const activeTab = computed(() => {
  const path = route.path
  if (path === '/profilo' || path === '/impostazioni') return undefined
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
  <div class="dashboard-layout">
    <!-- Sticky Header: TopBar + TabsBar -->
    <div class="dashboard-sticky-header">
      <LayoutTopBar
        :user-name="displayName"
        @logout="handleLogout"
        @go-to-profile="handleGoToProfile"
        @go-to-settings="handleGoToSettings"
      />

      <!-- TabsBar with NuxtLink navigation -->
      <LayoutTabsBarRouter :active-tab="activeTab" :back-label="headerBack?.label()" @back="headerBack?.run()" />
    </div>

    <!-- Page Content with transitions -->
    <main ref="contentViewport" class="dashboard-viewport" data-page-scroll>
      <slot></slot>
    </main>
  </div>
</template>

<style lang="scss" scoped>
@use '@/assets/scss/racing-chrome';
.dashboard-layout {
  @include racing-chrome.chrome;
  height: var(--dashboard-viewport-height, 100dvh);
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: transparent;
}

.dashboard-sticky-header {
  position: relative;
  flex: 0 0 auto;
  top: 0;
  z-index: 100;
  background: transparent;
}

.dashboard-viewport {
  flex: 1;
  width: 100%; min-height: 0; box-sizing: border-box;
  overflow-y: auto; overflow-x: hidden; overscroll-behavior-y: contain;
  scrollbar-gutter: stable;
  --page-bottom-space: 24px;
}
// Keep the page's original 40px offset: a fixed clear band followed by the
// same 18px fade used below the session filters. Only content moves through it.
.dashboard-layout:not(:has(:deep(.sessions-page))) {
  .dashboard-sticky-header {
    padding-bottom: calc(var(--app-content-top-space) - var(--app-scroll-fade-size));
  }
  > .dashboard-viewport {
    --app-content-top-space: var(--app-scroll-fade-size);
    mask-image: var(--app-scroll-fade-mask);
  }
}
// Follow the rendered page, including its leave transition, rather than the next route.
.dashboard-layout:has(:deep(.sessions-page)) {
  --page-bottom-space: 0px;
  height: var(--dashboard-viewport-height, 100dvh);
  min-height: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  .dashboard-sticky-header {
    position: relative;
    flex: 0 0 auto;
  }
  > .dashboard-viewport { min-height: 0; overflow: hidden; display: flex; flex-direction: column; }
}
.dashboard-layout:has(:deep(.racing-overview)) {
  // Fill the available window; content can still grow beyond it on small screens.
  min-height: var(--dashboard-viewport-height, 100dvh);
  display: flex;
  flex-direction: column;
  --page-bottom-space: 22px;
  position: relative; isolation: isolate; background: transparent;
  .dashboard-sticky-header { flex-shrink: 0; }
  > .dashboard-viewport { display: flex; flex-direction: column; }
  :deep(.page-container) { width: 100%; padding: var(--app-content-top-space) 24px 22px; flex: 1; display: flex; flex-direction: column; }
  :deep(.racing-overview) { flex: 1; }
}
// The lobby consumes the actual space below the application chrome. Only its
// lists scroll; the live room and narrow/very short windows retain page scrolling.
@media (min-width: 721px) and (min-height: 650px) {
  .dashboard-layout:has(:deep(.pwc--home)) {
    > .dashboard-viewport { display: flex; flex-direction: column; overflow: hidden; }
    :deep(.pitwall-route) { flex: 1; min-height: 0; display: flex; flex-direction: column; }
    :deep(.pwc.pwc--home) { flex: 1; min-height: 0; display: flex; flex-direction: column; padding-bottom: 16px; }
    :deep(.pwc--home .pwc-home) { flex: 1; height: auto; min-height: 0; }
    :deep(.pitwall-dev-views) { flex: 0 0 auto; width: 100%; padding-bottom: 8px; }
  }
}
@media (max-width: 700px) {
  .dashboard-layout:has(:deep(.racing-overview)) { --page-bottom-space: 14px; }
  .dashboard-layout:has(:deep(.racing-overview)) :deep(.page-container) { padding: var(--app-content-top-space) 16px 14px; }
}
</style>
