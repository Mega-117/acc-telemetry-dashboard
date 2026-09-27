<script setup lang="ts">
// ============================================
// Dashboard Layout - Wraps authenticated pages
// ============================================

import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import { useConfirmedLogout } from '~/composables/useConfirmedLogout'
import { provideHeaderBack } from '~/composables/useHeaderBack'

const router = useRouter()
const headerBack = provideHeaderBack(() => router.back())

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
  position: relative; // Anchor the outgoing page during the crossfade.
  flex: 1;
  width: 100%; min-height: 0; box-sizing: border-box;
  --page-bottom-space: 24px;
}
// Every route owns its scrolling and sizing. The shell must never change based
// on descendants: two different pages coexist during a crossfade.
.dashboard-viewport {
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.dashboard-viewport > :deep(*) {
  flex: 1 1 0%;
  height: 100%;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  scrollbar-gutter: stable;
  overscroll-behavior-y: contain;
}
// Page-local positioning (e.g. Pitwall's position:relative) must not put the
// outgoing page back in flex flow and halve the incoming page's height.
.dashboard-viewport > :deep(.page-fade-leave-active) {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  flex: none;
  pointer-events: none;
}
.dashboard-viewport > :deep(.sessions-page) {
  overflow: hidden;
  --page-bottom-space: 0px;
}
.dashboard-viewport > :deep(:not(.sessions-page)) {
  mask-image: var(--app-scroll-fade-mask);
}
.dashboard-viewport > :deep(.page-container:has(.racing-overview)) {
  --page-bottom-space: 22px;
  padding: var(--app-content-top-space) 24px 22px;
  display: flex;
  flex-direction: column;
}
.dashboard-viewport :deep(.racing-overview) { flex: 1 0 auto; }
// The lobby consumes the actual space below the application chrome. Only its
// lists scroll; the live room and narrow/very short windows retain page scrolling.
@media (min-width: 721px) and (min-height: 650px) {
  .dashboard-viewport > :deep(.pitwall-route:has(.pwc--home)) {
    display: flex; flex-direction: column; overflow: hidden;
    :deep(.pwc.pwc--home) { flex: 1; min-height: 0; display: flex; flex-direction: column; padding-bottom: 16px; }
    :deep(.pwc--home .pwc-home) { flex: 1; height: auto; min-height: 0; }
    :deep(.pitwall-dev-views) { flex: 0 0 auto; width: 100%; padding-bottom: 8px; }
  }
}
@media (max-width: 700px) {
  .dashboard-viewport > :deep(.page-container:has(.racing-overview)) { padding: var(--app-content-top-space) 16px 14px; }
}
</style>
