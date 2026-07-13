<script setup lang="ts">
// ============================================
// App.vue - Main Application with Auth Flow
// ============================================

import { ref, computed, onMounted, onBeforeMount, watch, provide } from 'vue'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import { useTelemetryGateway } from '~/composables/useTelemetryGateway'
import { useActivityFeed } from '~/composables/useActivityFeed'
import { useKokoroVoiceLabLifecycle } from '~/composables/useKokoroVoiceLabLifecycle'
import { endFirebaseScenario, startFirebaseScenario, withFirebaseScenario } from '~/composables/useFirebaseTracker'
import { useOwnerDataMaintenance } from '~/composables/useOwnerDataMaintenance'
import { AUTH_EMAIL_VERIFICATION_REQUIRED } from '~/config/authPolicy'
import { canUseDevTools } from '~/utils/devToolsAccess'

// === NUXT ROUTER ===
const route = useRoute()
const router = useRouter()
const getRouteQueryString = (value: unknown): string => {
  if (Array.isArray(value)) return String(value[0] || '')
  return typeof value === 'string' ? value : ''
}
const pendingSpaRedirectPath = ref(getRouteQueryString(route.query['spa-redirect-path']))
const browserOverlayPath = ref('')
const browserOverlayIntent = ref(false)
const refreshBrowserOverlayLocation = () => {
  if (typeof window === 'undefined') return
  browserOverlayPath.value = window.location.pathname.replace(/\/+$/, '') || '/'
  browserOverlayIntent.value = new URLSearchParams(window.location.search).get('overlay') === 'training'
}
onBeforeMount(refreshBrowserOverlayLocation)
const normalizedRoutePath = computed(() => route.path.replace(/\/+$/, '') || '/')
const isTrainingOverlayRoute = computed(() => {
  return normalizedRoutePath.value === '/training-overlay' || browserOverlayPath.value === '/training-overlay'
})
const isTrainingOverlayIntent = computed(() => {
  return isTrainingOverlayRoute.value || browserOverlayIntent.value || getRouteQueryString(route.query.overlay) === 'training'
})
// Overlay HUD semplici (PIP-175): come il training overlay, vivono in una
// finestra Electron dedicata e vanno renderizzati standalone, fuori dalla shell
// auth/dashboard (che altrimenti li redirige a /panoramica).
const hudOverlayRoutes = ['/tyres-overlay', '/sectors-overlay']
const isHudOverlayRoute = computed(() => {
  return hudOverlayRoutes.includes(normalizedRoutePath.value)
    || hudOverlayRoutes.includes(browserOverlayPath.value)
})
const standaloneRuntimeRoutes = ['/spotter-audio-runtime']
const isStandaloneRuntimeRoute = computed(() => {
  return standaloneRuntimeRoutes.includes(normalizedRoutePath.value)
    || standaloneRuntimeRoutes.includes(browserOverlayPath.value)
})
const standaloneDevRoutes = ['/dev-voice-lab']
const kokoroVoiceLabLifecycle = useKokoroVoiceLabLifecycle()
const isStandaloneDevRoute = computed(() => {
  return (
    standaloneDevRoutes.includes(normalizedRoutePath.value)
    || standaloneDevRoutes.includes(browserOverlayPath.value)
  ) && canUseDevTools()
})

watch(normalizedRoutePath, (path, previousPath) => {
  if (path === '/dev-voice-lab') {
    kokoroVoiceLabLifecycle.enterVoiceLab()
    return
  }
  if (previousPath === '/dev-voice-lab') {
    kokoroVoiceLabLifecycle.leaveVoiceLab()
  }
})

useHead(() => {
  if (!isTrainingOverlayIntent.value && !isHudOverlayRoute.value && !isStandaloneRuntimeRoute.value) return {}
  return {
    htmlAttrs: {
      class: 'training-overlay-document'
    },
    bodyAttrs: {
      class: 'training-overlay-runtime'
    }
  }
})

// === SPA REDIRECT HANDLING (GitHub Pages 404 fix) ===
onMounted(async () => {
  refreshBrowserOverlayLocation()
  kokoroVoiceLabLifecycle.resumePendingLeaveIfNeeded()
  const queryRedirectPath = pendingSpaRedirectPath.value
  if (queryRedirectPath) {
    sessionStorage.removeItem('spa-redirect-path')
    await router.replace(queryRedirectPath)
    pendingSpaRedirectPath.value = ''
    return
  }

  const savedPath = sessionStorage.getItem('spa-redirect-path')
  if (savedPath) {
    sessionStorage.removeItem('spa-redirect-path')
    // Navigate to the saved path after a small delay to let the app initialize
    setTimeout(() => {
      router.push(savedPath)
    }, 100)
  }
})
// === FIREBASE AUTH ===
const { 
  currentUser, 
  isLoading: authLoading, 
  canEnterApp,
  needsEmailVerification,
  logout: firebaseLogout
} = useFirebaseAuth()

// === TELEMETRY DATA GATEWAY (single source of truth) ===
const telemetryGateway = useTelemetryGateway()
const hasPrefetched = ref(false)
const ownerDataMaintenance = useOwnerDataMaintenance()
const browserMaintenanceStatus = ownerDataMaintenance.status
const browserMaintenanceProgress = ownerDataMaintenance.progress
const browserMaintenanceMessage = ownerDataMaintenance.message
const browserMaintenanceError = ownerDataMaintenance.error

// === ACTIVITY FEED ===
const { listenToActivities, stopListening } = useActivityFeed()

function listenToActivitiesTracked(userId: string) {
  const scenarioId = startFirebaseScenario('app.activityFeed.listen', { userId })
  try {
    listenToActivities(userId)
  } finally {
    endFirebaseScenario(scenarioId)
  }
}

// === APP STATE ===
type AppState = 'initializing' | 'auth' | 'loading' | 'dashboard'
type AuthState = 'login' | 'register' | 'reset' | 'register-success'
type DissolveAnimation = 'fade-zoom' | 'warp' | 'particles' | 'slide-up'

const appState = ref<AppState>('initializing')
const authState = ref<AuthState>('login')
const userEmail = ref('')
const hasInitialized = ref(false)
const showBrowserMaintenanceNotification = ref(false)
const showDevFirebaseProbe = computed(() => {
  return !isTrainingOverlayIntent.value && !isHudOverlayRoute.value && !isStandaloneRuntimeRoute.value && !isStandaloneDevRoute.value && appState.value === 'dashboard' && canUseDevTools()
})

// === CONFIG ===
const transitionName = 'dissolve-fade-zoom' // Fixed animation
const dashboardRoutePrefixes = [
  '/panoramica',
  '/sessioni',
  '/piste',
  '/spotter',
  '/dev-voice-lab',
  '/area-pilota',
  '/hud',
  '/test-hud',
  '/profilo',
  '/preparazione',
  '/piloti'
]

const isDashboardRoute = (path: string) => {
  return dashboardRoutePrefixes.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))
}

const isBrowserOnlyRuntime = computed(() => {
  if (typeof window === 'undefined') return false
  return !(window as any).electronAPI
})

watch(ownerDataMaintenance.status, (status) => {
  if (!isBrowserOnlyRuntime.value) return
  if (status === 'checking' || status === 'running' || status === 'sync_pending' || status === 'completed' || status === 'failed') {
    showBrowserMaintenanceNotification.value = true
  }
  if (status === 'skipped' || status === 'idle') {
    showBrowserMaintenanceNotification.value = false
  }
})

function closeBrowserMaintenanceNotification() {
  showBrowserMaintenanceNotification.value = false
}

// === DASHBOARD ENTRY MAINTENANCE ===
watch(appState, async (newState) => {
  if (isTrainingOverlayIntent.value || isHudOverlayRoute.value || isStandaloneRuntimeRoute.value || isStandaloneDevRoute.value) return
  if (newState === 'dashboard' && !hasPrefetched.value && currentUser.value && canEnterApp.value) {
    hasPrefetched.value = true
    
    await withFirebaseScenario('app.dashboard.maintenanceGate', {
      userId: currentUser.value.uid
    }, async () => {
      if (typeof window !== 'undefined' && !(window as any).electronAPI) {
        await ownerDataMaintenance.runGate(currentUser.value!.uid)
      }
    })
  }
})

const showEmailVerificationGate = () => {
  appState.value = 'auth'
  authState.value = 'register-success'
  stopListening()
}

const enterDashboard = (delayMs = 0) => {
  const startDashboard = () => {
    if (!canEnterApp.value || !currentUser.value) {
      showEmailVerificationGate()
      return
    }

    appState.value = 'dashboard'
    listenToActivitiesTracked(currentUser.value.uid)
    if (pendingSpaRedirectPath.value) {
      router.replace(pendingSpaRedirectPath.value)
      return
    }

    if (!isDashboardRoute(normalizedRoutePath.value)) {
      router.push('/panoramica')
    }
  }

  if (delayMs > 0) {
    appState.value = 'loading'
    setTimeout(startDashboard, delayMs)
    return
  }

  startDashboard()
}

// === WATCH AUTH LOADING STATE ===
// This watch handles the INITIAL auth check when the app loads
watch(authLoading, (loading) => {
  if (isTrainingOverlayIntent.value || isHudOverlayRoute.value || isStandaloneRuntimeRoute.value || isStandaloneDevRoute.value) {
    hasInitialized.value = true
    return
  }

  if (!loading && !hasInitialized.value) {
    hasInitialized.value = true
    
    if (currentUser.value) {
      userEmail.value = currentUser.value.email || ''
      
      if (needsEmailVerification.value) {
        showEmailVerificationGate()
      } else {
        enterDashboard()
      }
    } else {
      // No user -> show login
      appState.value = 'auth'
      stopListening()
    }
  }
}, { immediate: true })

// === WATCH USER CHANGES (after initialization) ===
// This handles login/logout AFTER the initial load
watch(currentUser, (user, oldUser) => {
  if (isTrainingOverlayIntent.value || isHudOverlayRoute.value || isStandaloneRuntimeRoute.value || isStandaloneDevRoute.value) return

  // Skip if we haven't initialized yet (handled by authLoading watch)
  if (!hasInitialized.value) return
  
  if (user) {
    userEmail.value = user.email || ''
    
    if (needsEmailVerification.value) {
      showEmailVerificationGate()
    } else {
      if (appState.value === 'auth') {
        enterDashboard(1000)
      } else {
        listenToActivitiesTracked(user.uid)
      }
    }
  } else if (oldUser) {
    // User logged out
    appState.value = 'auth'
    authState.value = 'login'
    stopListening()
  }
})

// === HANDLERS ===
const handleLoginSuccess = (email: string, emailVerified: boolean) => {
  userEmail.value = email
  
  if (AUTH_EMAIL_VERIFICATION_REQUIRED && !emailVerified) {
    showEmailVerificationGate()
    return
  }
  
  enterDashboard(1500)
}

const handleRegisterSuccess = (email: string) => {
  userEmail.value = email
  if (AUTH_EMAIL_VERIFICATION_REQUIRED) {
    showEmailVerificationGate()
    return
  }

  enterDashboard(1500)
}

const handleGoToDashboard = () => {
  // Called when user clicks "Ho confermato l'email" and verification passed
  enterDashboard(1500)
}

const handleResendEmail = () => {
  console.log('[AUTH] Resending verification email to:', userEmail.value)
}

const handleLogout = async () => {
  await firebaseLogout()
  userEmail.value = ''
  authState.value = 'login'
  appState.value = 'auth'
}

const handleGoToProfile = () => {
  if (!canEnterApp.value) {
    showEmailVerificationGate()
    return
  }
  appState.value = 'dashboard'
  router.push('/profilo')
}

// Provide navigation functions to child components (layouts)
provide('goToProfile', handleGoToProfile)
</script>

<template>
  <div id="app" :class="{ 'app--training-overlay': isTrainingOverlayIntent || isHudOverlayRoute || isStandaloneRuntimeRoute }">
    <UiAppNotifications v-if="!isTrainingOverlayIntent && !isHudOverlayRoute && !isStandaloneRuntimeRoute" />

    <template v-if="isStandaloneRuntimeRoute">
      <NuxtPage />
    </template>

    <template v-else-if="isTrainingOverlayIntent">
      <NuxtPage v-if="isTrainingOverlayRoute" />
      <div v-else class="overlay-boot" />
    </template>

    <!-- Overlay HUD semplici (PIP-175): render standalone come il training -->
    <template v-else-if="isHudOverlayRoute">
      <NuxtPage />
    </template>

    <template v-else-if="isStandaloneDevRoute">
      <ElectronTitlebar />
      <NuxtRouteAnnouncer />
      <div class="dashboard-wrapper">
        <NuxtLayout>
          <NuxtPage />
        </NuxtLayout>
      </div>
    </template>

    <template v-else>
      <!-- Electron Titlebar (only visible in Electron) -->
      <ElectronTitlebar />

      <ElectronDataMaintenanceNotification
        v-if="isBrowserOnlyRuntime"
        :visible="showBrowserMaintenanceNotification"
        :status="browserMaintenanceStatus"
        :progress="browserMaintenanceProgress"
        :message="browserMaintenanceMessage"
        :error="browserMaintenanceError"
        @close="closeBrowserMaintenanceNotification"
      />
      
      <NuxtRouteAnnouncer />

      <!-- Main Content with Transitions -->
      <Transition :name="transitionName" mode="out-in">
        <!-- Initializing - waiting for Firebase auth check -->
        <div v-if="appState === 'initializing'" key="initializing" class="initializing-screen">
          <div class="initializing-content">
            <div class="initializing-spinner"></div>
          </div>
        </div>

        <!-- Auth Overlay -->
        <AuthOverlay 
          v-else-if="appState === 'auth' && authState !== 'register-success'"
          key="auth"
          @login-success="handleLoginSuccess"
          @register-success="handleRegisterSuccess"
        />

        <!-- Registration Success -->
        <div 
          v-else-if="appState === 'auth' && authState === 'register-success'" 
          key="register-success"
          class="auth-wrapper"
        >
          <div class="auth-card-standalone">
            <AuthRegistrationSuccess
              :email="userEmail"
              :require-email-verification="AUTH_EMAIL_VERIFICATION_REQUIRED"
              @go-to-dashboard="handleGoToDashboard"
              @resend-email="handleResendEmail"
            />
          </div>
        </div>

        <!-- Loading Screen -->
        <div v-else-if="appState === 'loading'" key="loading" class="loading-screen">
          <div class="loading-content">
            <div class="loading-spinner"></div>
            <p class="loading-text">Caricamento Dashboard...</p>
          </div>
        </div>

        <!-- Dashboard -->
        <div v-else-if="appState === 'dashboard'" key="dashboard" class="dashboard-wrapper">
          <NuxtLayout>
            <NuxtPage />
          </NuxtLayout>
        </div>

      </Transition>

      <DevFirebaseProbe v-if="showDevFirebaseProbe" />
    </template>
  </div>
</template>

<style lang="scss">
$font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
$color-racing-red: #e10600;
$color-racing-orange: #ff6b00;
$color-bg: #0d0d12;
$color-card: #121218;

// Base app styles
html, body {
  margin: 0;
  padding: 0;
  height: 100%;
  width: 100%;
}

#app {
  min-height: 100vh;
  background: $color-bg;
  display: flex;
  flex-direction: column;
}

html.training-overlay-document,
html.training-overlay-document body,
html:has(body.training-overlay-runtime),
body.training-overlay-runtime,
html.training-overlay-document #__nuxt,
html.training-overlay-document #app,
body.training-overlay-runtime #__nuxt,
body.training-overlay-runtime #app {
  width: 100vw;
  height: 100vh;
  min-height: 0;
  overflow: hidden !important;
  background-color: transparent !important;
  background: transparent !important;
}

#app.app--training-overlay {
  display: block;
  width: 100vw;
  height: 100vh;
  min-height: 0;
  background-color: transparent !important;
  background: transparent !important;
  overflow: hidden;
}

body.training-overlay-runtime #__nuxt_devtools__,
body.training-overlay-runtime #__nuxt-devtools__,
body.training-overlay-runtime [id*='nuxt_devtools'],
body.training-overlay-runtime [id*='nuxt-devtools'],
body.training-overlay-runtime [class*='nuxt-devtools'],
body.training-overlay-runtime [data-nuxt-devtools],
body.training-overlay-runtime nuxt-devtools,
body.training-overlay-runtime iframe[title*='Nuxt'],
body.training-overlay-runtime button[aria-label*='Nuxt'],
body.training-overlay-runtime iframe[src*='nuxt-devtools'],
body.training-overlay-runtime iframe[src*='_nuxt/devtools'],
body.training-overlay-runtime iframe[src*='__nuxt_devtools__'] {
  display: none !important;
  opacity: 0 !important;
  pointer-events: none !important;
  visibility: hidden !important;
}

.overlay-boot {
  width: 100vw;
  height: 100vh;
  background: transparent;
}

// When Electron titlebar is visible, make content scrollable below it
html:has(.electron-titlebar),
body:has(.electron-titlebar) {
  overflow: hidden;
}

#app:has(.electron-titlebar) {
  height: 100vh;
  width: 100vw;
  overflow: hidden;

  // Keep the Electron scroll shell limited to page wrappers so fixed overlays
  // such as the Firebase probe stay anchored to the viewport.
  > .dashboard-wrapper,
  > .profile-wrapper,
  > .auth-wrapper,
  > .loading-screen,
  > .initializing-screen {
    flex: 1 1 auto;
    min-height: 0;
    // Force scrollbar to NOT take space - calc trick
    width: calc(100% + 8px);
    margin-right: -8px;
    overflow-y: scroll;
    overflow-x: hidden;
    padding-right: 8px;
  }

  > .dashboard-wrapper .page-container {
    padding-bottom: calc(64px + env(safe-area-inset-bottom, 0px));
  }
}

// === CUSTOM SCROLLBAR STYLING ===
// Webkit scrollbar styling (Chrome/Electron)
::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: rgba(255, 255, 255, 0.15);
  border-radius: 4px;
  
  &:hover {
    background: rgba(255, 255, 255, 0.25);
  }
}

// === AUTH WRAPPER ===
.auth-wrapper {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: $color-bg;
}

.auth-card-standalone {
  background: $color-card;
  border: 2px solid rgba($color-racing-red, 0.4);
  border-radius: 28px;
  padding: 56px 64px;
  max-width: 480px;
  box-shadow: 
    0 0 60px rgba($color-racing-red, 0.15),
    0 30px 60px -15px rgba(0, 0, 0, 0.5);
}

// === LOADING SCREEN ===
.loading-screen {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: $color-bg;
}

.loading-content {
  text-align: center;
}

.loading-spinner {
  width: 48px;
  height: 48px;
  margin: 0 auto 24px;
  border: 3px solid rgba(255, 255, 255, 0.1);
  border-top-color: $color-racing-red;
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-text {
  font-family: $font-family;
  font-size: 16px;
  color: rgba(255, 255, 255, 0.6);
}

// === INITIALIZING SCREEN (minimal, fast) ===
.initializing-screen {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: $color-bg;
}

.initializing-content {
  text-align: center;
}

.initializing-spinner {
  width: 32px;
  height: 32px;
  border: 2px solid rgba(255, 255, 255, 0.1);
  border-top-color: rgba(255, 255, 255, 0.4);
  border-radius: 50%;
  animation: spin 0.6s linear infinite;
}

// === WRAPPERS (for Transition single-root) ===
.profile-wrapper,
.dashboard-wrapper {
  min-height: 100vh;
}

// ============================================
// DISSOLVE ANIMATIONS
// ============================================

// === 1. FADE ZOOM ===
.dissolve-fade-zoom-enter-active,
.dissolve-fade-zoom-leave-active {
  transition: all 0.5s cubic-bezier(0.4, 0, 0.2, 1);
}

.dissolve-fade-zoom-enter-from {
  opacity: 0;
  transform: scale(0.9);
}

.dissolve-fade-zoom-leave-to {
  opacity: 0;
  transform: scale(1.15);
  filter: blur(8px);
}

// === 2. WARP SPEED ===
.dissolve-warp-enter-active,
.dissolve-warp-leave-active {
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.dissolve-warp-enter-from {
  opacity: 0;
  transform: scaleX(0.8) translateY(20px);
}

.dissolve-warp-leave-to {
  opacity: 0;
  transform: scaleX(1.5) scaleY(0.5);
  filter: blur(12px);
}

// === 3. PARTICLES (simulated with blur + scale) ===
.dissolve-particles-enter-active {
  transition: all 0.5s cubic-bezier(0.16, 1, 0.3, 1);
}

.dissolve-particles-leave-active {
  transition: all 0.6s cubic-bezier(0.4, 0, 0.2, 1);
}

.dissolve-particles-enter-from {
  opacity: 0;
  transform: scale(0.8);
  filter: blur(20px);
}

.dissolve-particles-leave-to {
  opacity: 0;
  transform: scale(1.3);
  filter: blur(30px) brightness(2);
}

// === 4. SLIDE UP ===
.dissolve-slide-up-enter-active,
.dissolve-slide-up-leave-active {
  transition: all 0.4s cubic-bezier(0.4, 0, 0.2, 1);
}

.dissolve-slide-up-enter-from {
  opacity: 0;
  transform: translateY(40px);
}

.dissolve-slide-up-leave-to {
  opacity: 0;
  transform: translateY(-60px);
  filter: blur(4px);
}


// Responsive
@media (max-width: 768px) {
  .auth-card-standalone {
    margin: 16px;
    padding: 40px 32px;
  }
}
</style>
