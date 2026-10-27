<script setup lang="ts">
import { useGameContext } from '~/composables/useGameContext'
const { consultedGame } = useGameContext()
// ============================================
// App.vue - Main Application with Auth Flow
// ============================================

import { ref, shallowRef, computed, nextTick, onMounted, onBeforeMount, onBeforeUnmount, watch, provide } from 'vue'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import { usePitwallDriverPresence } from '~/composables/usePitwallDriverPresence'
import { useConfirmedLogout } from '~/composables/useConfirmedLogout'
import { useTelemetryGateway } from '~/composables/useTelemetryGateway'
import { useActivityFeed } from '~/composables/useActivityFeed'
import { useKokoroVoiceLabLifecycle } from '~/composables/useKokoroVoiceLabLifecycle'
import { useClientDiagnostics } from '~/composables/useClientDiagnostics'
import { usePrimaryCloudOwner } from '~/composables/usePrimaryCloudOwner'
import { gameUiSupport } from '~/services/telemetry/gameCatalog'
import { usePitwallLiveStore } from '~/composables/usePitwallLiveStore'
import { useControlKFriendRequests } from '~/composables/useControlKFriendRequests'
import { providePitwallStore } from '~/composables/usePitwallStore'
import { endFirebaseScenario, startFirebaseScenario } from '~/composables/useFirebaseTracker'
import { useOwnerDataMaintenance } from '~/composables/useOwnerDataMaintenance'
import { useOwnerCacheLifecycle } from '~/composables/useOwnerCacheLifecycle'
import { AUTH_EMAIL_VERIFICATION_REQUIRED } from '~/config/authPolicy'
import { canUseDevTools } from '~/utils/devToolsAccess'
import { toAuthStartupOutcome, describeAuthRecovery, AUTH_RECOVERY_DEFAULT_MESSAGE, type AuthSessionStatus } from '~/services/auth/authSessionPolicy'
import { publishAuthStartupOutcome } from '~/services/auth/localIdentityBridge'
import { useWheelInputBridge } from '~/composables/useWheelInputBridge'
import { useWindowPresentationVisibility } from '~/composables/usePresentationVisibility'
import '~/assets/css/presentation-visibility.css'

const presentationVisible = useWindowPresentationVisibility()
watch(presentationVisible, visible => {
  if (typeof document !== 'undefined') document.documentElement.dataset.presentationHidden = String(!visible)
}, { immediate: true })

import { prepareOverviewEntry, decodeOverviewImage, overviewEntryKey, type OverviewEntry } from '~/services/auth/overviewEntryPreparation'
import { responsiveImage, OVERVIEW_CAR_SIZES } from '~/utils/responsiveImage'
import { getOverviewCarImage } from '~/utils/overviewCarImage'
import { createDashboardEntryRecovery, EMPTY_ENTRY_STATE } from '~/services/auth/dashboardEntryRecovery'
import { createAuthRevisionLeaseCoordinator } from '~/services/auth/authRevisionLease'
import { loadRaceCalendarEvents } from '~/repositories/raceCalendarRepository'
import { bootHoldLeft, dismissBootScreen, glideBootLogoTo, handBootBackdropToApp, logoGlideStart, LOGIN_LOADER_MIN_MS, LOGO_GLIDE_MS } from '~/utils/bootScreen'
import { BOOT_LOADER_CSS, bootLogoSrc } from '../shared/spaLoading'

// === NUXT ROUTER ===
const route = useRoute()
const router = useRouter()
const appBaseURL = useRuntimeConfig().app.baseURL
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
// Il Pit Wall e' reale ovunque: la campanella deve suonare anche fuori da
// /pitwall, quindi lo store vive qui e parte con la dashboard (piu' sotto).
const pitwallAllowed = computed(() => gameUiSupport(consultedGame.value).pitwall)
const pitwallStore = usePitwallLiveStore()
providePitwallStore(pitwallStore)
const cloudJobsAllowed = computed(() => true)
const isTrainingOverlayRoute = computed(() => {
  return normalizedRoutePath.value === '/training-overlay' || browserOverlayPath.value === '/training-overlay'
})
const isTrainingOverlayIntent = computed(() => {
  return isTrainingOverlayRoute.value || browserOverlayIntent.value || getRouteQueryString(route.query.overlay) === 'training'
})
// Overlay HUD semplici (PIP-175): come il training overlay, vivono in una
// finestra Electron dedicata e vanno renderizzati standalone, fuori dalla shell
// auth/dashboard (che altrimenti li redirige a /panoramica).
const hudOverlayRoutes = ['/overlay-surface', '/tyres-overlay', '/sectors-overlay', '/dashboard-overlay', '/info-overlay', '/standings-overlay', '/trackmap-overlay']
const isHudOverlayRoute = computed(() => {
  return hudOverlayRoutes.includes(normalizedRoutePath.value)
    || hudOverlayRoutes.includes(browserOverlayPath.value)
})
const standaloneRuntimeRoutes = ['/spotter-audio-runtime']
const runtimeBootstrapRoute = '/runtime-bootstrap'
const isRuntimeBootstrapRoute = computed(() => {
  return normalizedRoutePath.value === runtimeBootstrapRoute
    || browserOverlayPath.value === runtimeBootstrapRoute
})
const isStandaloneRuntimeRoute = computed(() => {
  return isRuntimeBootstrapRoute.value
    || standaloneRuntimeRoutes.includes(normalizedRoutePath.value)
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
const isPrimaryClientRuntime = computed(() => {
  return !isTrainingOverlayIntent.value
    && !isHudOverlayRoute.value
    && !isStandaloneRuntimeRoute.value
    && !isStandaloneDevRoute.value
})
const wheelInputBridge = useWheelInputBridge()
onBeforeUnmount(() => wheelInputBridge.stop())
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
  localProfile,
  profileUser,
  cloudSessionReady,
  isLoading: authLoading, 
  isSecondaryLocalRuntime,
  isLocalRuntimeAttested,
  authSessionStatus,
  authError,
  authRecoveryExhausted,
  retryRecoverableAuthSession,
  canEnterApp,
  logout: firebaseLogout
} = useFirebaseAuth()
// Loading screen copy while a recoverable session retries (PIP-550).
const authRecovery = computed(() => describeAuthRecovery({
  status: authSessionStatus.value,
  error: authError.value,
  exhausted: authRecoveryExhausted.value,
}))
watch([cloudSessionReady, canEnterApp], ([cloudReady]) => {
  if (typeof window === 'undefined') return
  const api = (window as Window & { electronAPI?: { reportRuntimeHealth?: (value: { cloud: string }) => void } }).electronAPI
  api?.reportRuntimeHealth?.({ cloud: cloudReady ? 'ready' : 'waiting' })
}, { immediate: true })
const primaryCloudOwner = usePrimaryCloudOwner({
  currentUser,
  canEnterApp: cloudSessionReady,
  cloudEnabled: cloudJobsAllowed
})
// PIP-442: cache proiezioni owner (memoria + file locale in Electron) legate all'account:
// idratate prima di mostrare la dashboard, svuotate a logout/cambio account.
const ownerCacheLifecycle = useOwnerCacheLifecycle({ currentUser: profileUser, canEnterApp, cloudReady: cloudSessionReady })
watch(canEnterApp, (enabled) => {
  const api = typeof window === 'undefined' ? null : (window as Window & { electronAPI?: { localIdentityRole?: string } }).electronAPI
  if (enabled && isPrimaryClientRuntime.value && api?.localIdentityRole === 'primary') {
    void wheelInputBridge.start().catch(() => wheelInputBridge.stop())
  } else wheelInputBridge.stop()
}, { immediate: true })
const clientDiagnostics = useClientDiagnostics({
  captureEnabled: computed(() => (
    (isPrimaryClientRuntime.value || isRuntimeBootstrapRoute.value)
    && cloudJobsAllowed.value
  )),
  flushEnabled: primaryCloudOwner.reportingEnabled,
  isLeaseCurrent: primaryCloudOwner.isLeaseCurrent
})
primaryCloudOwner.registerOwnerDrainer(clientDiagnostics.waitForIdle)
const { runConfirmedLogout } = useConfirmedLogout(firebaseLogout)
// Lato pilota del Pit Wall: annuncia il pilota e ascolta gli ordini in arrivo.
// Vive qui perche' questa e' la finestra che possiede la sessione Firebase; si
// disattiva da sola fuori da Electron e quando i lavori cloud sono di un'altra.
const pitwallDemand = computed(() => pitwallAllowed.value && (normalizedRoutePath.value === '/pitwall'
  || !!pitwallStore.myRoom.value || !!pitwallStore.pitwall.value.roomId))
const pitwallJobsEnabled = computed(() => primaryCloudOwner.jobsEnabled.value && pitwallAllowed.value)
usePitwallDriverPresence({ jobsEnabled: pitwallJobsEnabled, demand: pitwallDemand })
useControlKFriendRequests(pitwallStore, primaryCloudOwner.jobsEnabled, undefined, canEnterApp)
const isProtectedRuntimeRoute = computed(() => (
  isTrainingOverlayIntent.value
  || isHudOverlayRoute.value
  || isStandaloneRuntimeRoute.value
  || isStandaloneDevRoute.value
))
const canMountProtectedRuntime = computed(() => (
  !authLoading.value
  && (
    isSecondaryLocalRuntime.value
      ? isLocalRuntimeAttested.value
      : canEnterApp.value
  )
))

// === TELEMETRY DATA GATEWAY (single source of truth) ===
const telemetryGateway = useTelemetryGateway()
let maintenanceEntryUid: string | null = null
const ownerDataMaintenance = useOwnerDataMaintenance()
const browserMaintenanceStatus = ownerDataMaintenance.status
const browserMaintenanceProgress = ownerDataMaintenance.progress
const browserMaintenanceMessage = ownerDataMaintenance.message
const browserMaintenanceError = ownerDataMaintenance.error

// === ACTIVITY FEED ===
const { listenToActivities, stopListening } = useActivityFeed()

function listenToActivitiesTracked(userId: string) {
  if (!cloudJobsAllowed.value) return
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

const appState = ref<AppState>('initializing')
const authState = ref<AuthState>('login')
const preparingDashboard = ref(false)
const dashboardEntryState = shallowRef({ ...EMPTY_ENTRY_STATE })
const dashboardEntryRecovery = createDashboardEntryRecovery({ onChange: state => {
  dashboardEntryState.value = state
  const api = typeof window === 'undefined' ? null : (window as Window & {
    electronAPI?: { reportRuntimeHealth?: (payload: unknown) => void }
  }).electronAPI
  api?.reportRuntimeHealth?.({ dashboardEntry: state })
} })
const loadingMessage = computed(() => dashboardEntryState.value.status === 'failed'
  ? 'Non riesco ad aprire la dashboard. Puoi riprovare senza uscire dal tuo account.'
  : dashboardEntryState.value.attempt === 2 && dashboardEntryState.value.status !== 'ready'
    ? 'Apertura della dashboard non riuscita. Riprovo...'
    : authRecovery.value.message)
const canRetryLoading = computed(() => dashboardEntryState.value.status === 'failed' || authRecovery.value.canRetry)
// PIP-640: the laser already says "loading"; words appear only when something is wrong or being retried.
const loadingNote = computed(() => loadingMessage.value === AUTH_RECOVERY_DEFAULT_MESSAGE ? '' : loadingMessage.value)
const retryLoading = () => dashboardEntryState.value.status === 'failed'
  ? enterDashboard() : retryRecoverableAuthSession()
const overviewEntry = shallowRef<OverviewEntry | null>(null)
provide(overviewEntryKey, overviewEntry)
const entryLeases = createAuthRevisionLeaseCoordinator()
watch([() => profileUser.value?.uid, canEnterApp], () => {
  dashboardEntryRecovery.cancel()
  entryLeases.observe(profileUser.value?.uid || null)
  preparingDashboard.value = false
  overviewEntry.value = null
}, { immediate: true, flush: 'sync' })
onBeforeUnmount(() => { dashboardEntryRecovery.cancel(); entryLeases.invalidate() })
const userEmail = ref('')
const hasInitialized = ref(false)
const showBrowserMaintenanceNotification = ref(false)
const showDevFirebaseProbe = computed(() => {
  return !isTrainingOverlayIntent.value && !isHudOverlayRoute.value && !isStandaloneRuntimeRoute.value && !isStandaloneDevRoute.value && appState.value === 'dashboard' && canUseDevTools()
})

// Gli ascolti globali (feed attivita', Pit Wall) vivono quanto la dashboard di
// un utente che puo' entrare: al logout si spengono, al login ripartono.
watch(
  [appState, currentUser, cloudSessionReady],
  ([state, user, canEnter]) => {
    if (state !== 'dashboard' || !user || !canEnter) {
      stopListening()
      return
    }
    listenToActivitiesTracked(user.uid)
  },
  { flush: 'post' }
)
watch(
  [appState, currentUser, cloudSessionReady, pitwallDemand, pitwallAllowed],
  ([state, user, canEnter, needsPitwall, allowed]) => {
    if (!allowed || state !== 'dashboard' || !user || !canEnter) pitwallStore.halt()
    else pitwallStore.start(needsPitwall)
  },
  { flush: 'post' }
)

// === CONFIG ===
const transitionName = 'shell-motion'
// PIP-640: in the browser the loading screen of index.html stays over the app until the first real screen is
// ready (and at least BOOT_MIN_VISIBLE_MS since the page opened, so a fast reload does not flash it). Then the
// logo fades out and the dashboard fades in, or, for the login, the logo glides up into the login logo's place
// and the form fades in around it. The shell shows `shellState`: appState, with that first hand-over held back.
const shellState = ref<AppState>(appState.value)
let shellHold: ReturnType<typeof setTimeout> | undefined
watch(appState, state => {
  clearTimeout(shellHold)
  const holding = (shellState.value === 'initializing' || shellState.value === 'loading') && (state === 'auth' || state === 'dashboard')
  const wait = holding ? bootHoldLeft() : 0
  if (wait > 0) shellHold = setTimeout(() => { shellState.value = appState.value }, wait)
  else shellState.value = state
})
// The first change from 'initializing' is a crossfade, so the login does not wait for the empty start screen.
const leftStart = ref(false)
const usesShell = computed(() => !(isProtectedRuntimeRoute.value && !canMountProtectedRuntime.value)
  && !isStandaloneRuntimeRoute.value && !isTrainingOverlayIntent.value && !isHudOverlayRoute.value && !isStandaloneDevRoute.value)
const firstScreenReady = computed(() => !usesShell.value
  || (shellState.value !== 'initializing' && (shellState.value !== 'loading' || canRetryLoading.value)))
watch(shellState, (state, previous) => { if (previous === 'initializing' && state !== 'initializing') requestAnimationFrame(() => { leftStart.value = true }) })
onMounted(() => {
  handBootBackdropToApp()
  watch(firstScreenReady, ready => {
    if (!ready) return
    if (usesShell.value && shellState.value === 'auth') void nextTick(() => glideBootLogoTo(document.querySelector('.racer-auth__logo-viewport img')))
    else dismissBootScreen()
  }, { immediate: true })
})
// PIP-640: after "Accedi" the login logo itself glides to the loader's place while the form fades away and the
// laser lights up under it (FLIP: the loader logo starts where the login logo was, then moves home). The loader
// then leaves like the start one: logo out, dashboard in.
let authLogoRect: DOMRect | null = null
function onShellBeforeLeave(el: Element) {
  el.setAttribute('inert', '')
  authLogoRect = el.classList.contains('racer-auth') && shellState.value === 'loading'
    ? el.querySelector('.racer-auth__logo-viewport img')?.getBoundingClientRect() ?? null
    : null
}
function onShellBeforeEnter(el: Element) {
  if (authLogoRect && el.classList.contains('loading-screen')) el.classList.add('is-carried')
}
function onShellEnter(el: Element) {
  const from = authLogoRect
  authLogoRect = null
  const logo = el.classList.contains('is-carried') ? el.querySelector<HTMLElement>('.rc-boot__inner img') : null
  if (!from || !logo || window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return
  document.querySelector<HTMLElement>('.racer-auth__logo-viewport img')?.style.setProperty('visibility', 'hidden')
  logo.style.transform = logoGlideStart(from, logo.getBoundingClientRect())
  logo.getBoundingClientRect()
  requestAnimationFrame(() => {
    logo.style.transition = `transform ${LOGO_GLIDE_MS}ms cubic-bezier(.65,0,.25,1)`
    logo.style.transform = ''
  })
}
// The app's own loading screens show the same logo and laser, never a spinner (also in the desktop app).
useHead({ style: [{ key: 'rc-boot-loader', textContent: BOOT_LOADER_CSS }] })
const bootLogo = bootLogoSrc(appBaseURL)
const dashboardRoutePrefixes = [
  '/panoramica',
  '/sessioni',
  '/piste',
  '/pitwall',
  '/spotter',
  '/dev-voice-lab',
  '/area-pilota',
  '/hud',
  '/dati',
  '/test-hud',
  '/profilo',
  '/impostazioni',
  '/preparazione',
  '/gara',
  '/piloti',
  '/admin',
  '/admin-diagnostics',
  // PIP-623: link "Condividi giro" aperto nel browser (il frammento resta nella destinazione).
  '/giro',
  // PIP-619: Statistiche (senza questa voce un ricaricamento riportava alla Panoramica).
  '/statistiche'
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
function retryBrowserMaintenance() {
  const uid = currentUser.value?.uid
  if (!uid || !canEnterApp.value || !isBrowserOnlyRuntime.value || appState.value !== 'dashboard') return
  // The browser adapter always contains failures; no rejection reaches Nuxt.
  void ownerDataMaintenance.runBrowserGate(uid)
}

watch([appState, () => currentUser.value?.uid, canEnterApp], ([newState, uid, allowed]) => {
  if (isTrainingOverlayIntent.value || isHudOverlayRoute.value || isStandaloneRuntimeRoute.value || isStandaloneDevRoute.value) return
  if (!isBrowserOnlyRuntime.value) return
  const owner = allowed && uid ? uid : null
  ownerDataMaintenance.setBrowserOwner(owner)
  if (!owner) maintenanceEntryUid = null
  if (newState === 'dashboard' && owner && owner !== maintenanceEntryUid) {
    maintenanceEntryUid = owner
    retryBrowserMaintenance()
  }
}, { immediate: true, flush: 'sync' })

const showEmailVerificationGate = () => {
  appState.value = 'auth'
  authState.value = 'register-success'
  stopListening()
}

let terminalAuthStartupOutcomePublished = false
let lastAuthStartupOutcome: string | null = null
watch([authSessionStatus, localProfile], ([status, profile]) => {
  if (!isPrimaryClientRuntime.value || terminalAuthStartupOutcomePublished) return
  const outcome = toAuthStartupOutcome(profile ? 'ready' : status)
  if (!outcome || outcome === lastAuthStartupOutcome) return
  lastAuthStartupOutcome = outcome
  void publishAuthStartupOutcome(outcome).then((accepted) => {
    if (accepted && outcome !== 'recoverable') terminalAuthStartupOutcomePublished = true
  })
}, { immediate: true })
// PIP-550: once the automatic recovery is spent, a tray-only autostart must
// surface the window so the Riprova button is actually visible. Non-terminal.
watch(() => authRecovery.value.canRetry, (canRetry) => {
  if (!canRetry || !isPrimaryClientRuntime.value || terminalAuthStartupOutcomePublished) return
  void publishAuthStartupOutcome('retry-required')
})

// Restore the owner cache for entries that bypass enterDashboard.
watch([appState, () => profileUser.value?.uid || null], ([state, uid]) => {
  if (state === 'dashboard' && uid && canEnterApp.value) void ownerCacheLifecycle.prepare(uid)
})

// Warm only public code while signed out; user data starts after the auth gate.
const warmDashboardCode = () => Promise.all([
  preloadRouteComponents('/panoramica'), import('~/layouts/dashboard.vue'),
])
watch(appState, state => {
  if (state === 'auth' && import.meta.client) {
    void warmDashboardCode().catch(() => {})
  }
})

const enterDashboard = async () => {
  if (!canEnterApp.value || !profileUser.value) {
    showEmailVerificationGate()
    return
  }
  if (appState.value === 'dashboard' || preparingDashboard.value) return
  const uid = profileUser.value.uid
  const lease = entryLeases.capture(uid)
  if (!lease) return
  const destination = pendingSpaRedirectPath.value || (isDashboardRoute(normalizedRoutePath.value) ? route.fullPath : '/panoramica')
  const isCurrent = () => entryLeases.isLeaseCurrent(lease, profileUser.value?.uid) && canEnterApp.value
  preparingDashboard.value = true
  // From the login the logo glides to the loader: give the glide and the laser time before the dashboard.
  const loaderFromLoginAt = appState.value === 'auth' ? performance.now() : null
  appState.value = 'loading'
  try {
    await dashboardEntryRecovery.run(async attempt => {
      await attempt.step('cache', () => ownerCacheLifecycle.prepare(uid))
      if (destination.split(/[?#]/)[0] === '/panoramica') {
        const entry = prepareOverviewEntry(uid, {
          projection: () => telemetryGateway.getOverviewProjection(uid),
          events: () => cloudSessionReady.value ? loadRaceCalendarEvents(uid, 25) : Promise.resolve([]),
          image: projection => decodeOverviewImage(responsiveImage(getOverviewCarImage(projection?.lastCar.rawName), appBaseURL, OVERVIEW_CAR_SIZES)),
          code: warmDashboardCode,
        })
        overviewEntry.value = entry
        await attempt.step('overview', () => entry.ready)
      }
      await attempt.step('route', async () => {
        const failure = await router.replace(destination)
        // Duplicated navigation is already at the destination; aborted/redirected is not.
        if (failure && router.currentRoute.value.fullPath !== destination) throw new Error('navigation-failed')
      })
      const loaderLeft = loaderFromLoginAt === null ? 0 : LOGIN_LOADER_MIN_MS - (performance.now() - loaderFromLoginAt)
      if (loaderLeft > 0) await new Promise(resolve => setTimeout(resolve, loaderLeft))
      if (!attempt.isCurrent()) return
      pendingSpaRedirectPath.value = ''
      appState.value = 'dashboard'
    }, isCurrent)
  } finally {
    if (isCurrent()) preparingDashboard.value = false
  }
}

const applyAuthSessionToShell = (status: AuthSessionStatus) => {
  if (localProfile.value) {
    userEmail.value = localProfile.value.email || ''
    void enterDashboard()
    return
  }
  if (status === 'initializing' || status === 'recoverable') {
    if (status === 'recoverable' || appState.value !== 'auth') appState.value = 'loading'
    stopListening()
    return
  }

  if (status === 'signed-out') {
    appState.value = 'auth'
    authState.value = 'login'
    stopListening()
    return
  }

  if (!currentUser.value) {
    appState.value = 'loading'
    stopListening()
    return
  }

  userEmail.value = currentUser.value.email || ''
  if (status === 'unverified') {
    showEmailVerificationGate()
    return
  }

  enterDashboard()
}

// A single canonical auth status owns initial bootstrap and later transitions.
watch([authLoading, authSessionStatus, localProfile], ([loading, status]) => {
  if (isTrainingOverlayIntent.value || isHudOverlayRoute.value || isStandaloneRuntimeRoute.value || isStandaloneDevRoute.value) {
    hasInitialized.value = true
    return
  }

  if (loading) return
  hasInitialized.value = true
  applyAuthSessionToShell(status)
}, { immediate: true })

// === HANDLERS ===
const handleLoginSuccess = (email: string) => {
  userEmail.value = email
}

const handleRegisterSuccess = (email: string) => {
  userEmail.value = email
  if (AUTH_EMAIL_VERIFICATION_REQUIRED) {
    showEmailVerificationGate()
    return
  }

  enterDashboard()
}

const handleGoToDashboard = () => {
  // Called when user clicks "Ho confermato l'email" and verification passed
  enterDashboard()
}

const handleResendEmail = () => {
  console.log('[AUTH] Verification email resend requested')
}

const handleLogout = async () => {
  await runConfirmedLogout(() => {
    userEmail.value = ''
    authState.value = 'login'
    appState.value = 'auth'
  })
}

const handleGoToProfile = () => {
  if (!canEnterApp.value) {
    showEmailVerificationGate()
    return
  }
  appState.value = 'dashboard'
  router.push('/profilo')
}

const handleGoToSettings = () => {
  if (!canEnterApp.value) {
    showEmailVerificationGate()
    return
  }
  const api = typeof window === 'undefined'
    ? null
    : (window as Window & { electronAPI?: { localIdentityRole?: string } }).electronAPI
  if (api?.localIdentityRole !== 'primary') {
    router.push('/panoramica')
    return
  }
  appState.value = 'dashboard'
  router.push('/impostazioni')
}

// Provide navigation functions to child components (layouts)
provide('goToProfile', handleGoToProfile)
provide('goToSettings', handleGoToSettings)
</script>

<template>
  <div id="app" :class="{ 'app--training-overlay': isTrainingOverlayIntent || isHudOverlayRoute || isStandaloneRuntimeRoute }">
    <UiRacingBackdrop v-if="!isTrainingOverlayIntent && !isHudOverlayRoute && !isStandaloneRuntimeRoute" />
    <UiAppNotifications v-if="!isTrainingOverlayIntent && !isHudOverlayRoute && !isStandaloneRuntimeRoute" />

    <template v-if="isProtectedRuntimeRoute && isSecondaryLocalRuntime && !canMountProtectedRuntime">
      <div class="initializing-screen" :aria-label="authLoading ? 'Attestazione runtime locale' : 'Runtime locale non autorizzato'">
        <div class="initializing-content">
          <div class="initializing-spinner"></div>
        </div>
      </div>
    </template>

    <template v-else-if="isProtectedRuntimeRoute && !canMountProtectedRuntime">
      <div v-if="authLoading" class="initializing-screen" aria-label="Verifica sessione">
        <div class="initializing-content">
          <div class="initializing-spinner"></div>
        </div>
      </div>
      <AuthOverlay
        v-else
        key="runtime-auth"
        @login-success="handleLoginSuccess"
        @register-success="handleRegisterSuccess"
      />
    </template>

    <template v-else-if="isStandaloneRuntimeRoute">
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
      <ElectronRuntimeCapabilityBanner v-if="canEnterApp" />
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
      <ElectronRuntimeCapabilityBanner v-if="canEnterApp" />

      <ElectronDataMaintenanceNotification
        v-if="isBrowserOnlyRuntime"
        :visible="showBrowserMaintenanceNotification"
        :status="browserMaintenanceStatus"
        :progress="browserMaintenanceProgress"
        :message="browserMaintenanceMessage"
        :error="browserMaintenanceError"
        :can-retry="true"
        @retry="retryBrowserMaintenance"
        @close="closeBrowserMaintenanceNotification"
      />
      
      <NuxtRouteAnnouncer />

      <!-- Main Content with Transitions -->
      <Transition :name="transitionName" :mode="leftStart && shellState === 'auth' ? 'out-in' : undefined" @before-leave="onShellBeforeLeave" @before-enter="onShellBeforeEnter" @enter="onShellEnter">
        <!-- Initializing - waiting for Firebase auth check -->
        <div v-if="shellState === 'initializing'" key="initializing" class="initializing-screen" role="status" aria-label="Caricamento">
          <div class="rc-boot__inner"><img :src="bootLogo" alt="Racer Core" width="410" height="205"><div class="rc-boot__laser" /></div>
        </div>

        <!-- Auth Overlay -->
        <AuthOverlay 
          v-else-if="shellState === 'auth' && authState !== 'register-success'"
          key="auth"
          :busy="preparingDashboard"
          @login-success="handleLoginSuccess"
          @register-success="handleRegisterSuccess"
        />

        <!-- Registration Success -->
        <AuthScene
          v-else-if="shellState === 'auth' && authState === 'register-success'"
          key="register-success"
        >
            <AuthRegistrationSuccess
              :email="userEmail"
              :require-email-verification="AUTH_EMAIL_VERIFICATION_REQUIRED"
              @go-to-dashboard="handleGoToDashboard"
              @resend-email="handleResendEmail"
            />
        </AuthScene>

        <!-- Loading Screen -->
        <div v-else-if="shellState === 'loading'" key="loading" class="loading-screen">
          <div class="loading-content">
            <!-- The logo stays; on a failure the laser goes dark and the reason and Riprova appear under it. -->
            <div class="rc-boot__inner" :class="{ 'is-stalled': canRetryLoading }"><img :src="bootLogo" alt="Racer Core" width="410" height="205"><div class="rc-boot__laser" /></div>
            <p v-if="loadingNote" class="loading-text" :class="{ 'is-problem': canRetryLoading }">{{ loadingNote }}</p>
            <button v-if="canRetryLoading" type="button" class="rc-btn rc-btn--primary loading-retry" @click="retryLoading()">
              Riprova<UiRacingIcon name="chevron" :size="16" class="rc-btn__arrow" />
            </button>
          </div>
        </div>

        <!-- Dashboard -->
        <div v-else-if="shellState === 'dashboard'" key="dashboard" class="dashboard-wrapper">
          <NuxtLayout>
            <!-- Overview owns its game-change sequence; remounting skips the logo hold. -->
      <NuxtPage :page-key="route => ['panoramica', 'sessioni', 'piste'].includes(String(route.name)) ? route.fullPath : `${consultedGame}:${route.fullPath}`" />
          </NuxtLayout>
        </div>

      </Transition>

      <LazyDevFirebaseProbe v-if="showDevFirebaseProbe" />
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
  position: relative;
  min-height: 100vh;
  // PIP-639: lo spazio davvero visibile su telefoni e tablet (barre del browser escluse).
  min-height: 100dvh;
  background: transparent;
  isolation: isolate;
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
  // Electron scrolls inside the app; root gutters would change on route clipping.
  scrollbar-gutter: auto;
}

#app:has(.electron-titlebar) {
  --dashboard-viewport-height: calc(100dvh - 36px);
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
    width: 100%;
    overflow-y: scroll;
    overflow-x: hidden;
    // Keep centering identical when a page owns an inner scroll viewport.
    scrollbar-gutter: stable;
  }

  > .dashboard-wrapper .page-container {
    padding-bottom: calc(var(--page-bottom-space, 64px) + env(safe-area-inset-bottom, 0px));
  }
}

// Session list owns its viewport. Clip outer shells (unlike hidden, clip
// cannot be programmatically scrolled by keyboard focus/scrollIntoView).
html:has(.sessions-page),
body:has(.sessions-page),
#app:has(.sessions-page) {
  overflow: clip;
}
// PIP-639: in the coach view of a pilot on a phone the header takes half the screen; there the whole
// page scrolls (pages/piloti/[id].vue lets the list grow).
@media (max-width: 600px) {
  html:has(.pilot-view .sessions-page),
  body:has(.pilot-view .sessions-page),
  #app:has(.pilot-view .sessions-page) {
    overflow: visible;
  }
}
#app:has(.electron-titlebar) > .dashboard-wrapper:has(.sessions-page) {
  // hidden retains the stable gutter; clip would remove it and shift the shell.
  overflow: hidden;
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
  background: transparent;
}

.loading-content {
  text-align: center;
}

@keyframes spin {
  to { transform: rotate(360deg); }
}

.loading-text {
  margin: 22px 0 0;
  font-family: $font-family;
  font-size: 15px;
  color: rgba(255, 255, 255, 0.6);
  animation: rc-text-in 400ms ease-out both;
  &.is-problem { color: #fff; }
}

.loading-retry { margin-top: 18px; }

// Failure: the beam stops and the logo stops breathing; the track stays as a dim line.
.rc-boot__inner.is-stalled {
  img { animation: none; }
  .rc-boot__laser::after { animation: none; opacity: 0; }
}

// === INITIALIZING SCREEN (minimal, fast) ===
.initializing-screen {
  position: fixed;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
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

// Login crossfades; logout waits for the dashboard exit before showing auth.
.shell-motion-enter-active { transition: opacity 600ms cubic-bezier(.4, 0, .2, 1), transform 600ms cubic-bezier(.4, 0, .2, 1); }
.shell-motion-leave-active {
  transition: opacity 500ms cubic-bezier(.4, 0, .2, 1), transform 500ms cubic-bezier(.4, 0, .2, 1);
  position: absolute; inset: 0; z-index: 1; pointer-events: none;
}
#app:has(.electron-titlebar) > .shell-motion-leave-active { top: 36px; }
.shell-motion-enter-from, .shell-motion-leave-to { opacity: 0; }
.dashboard-wrapper.shell-motion-enter-from,
.dashboard-wrapper.shell-motion-leave-to { transform: scale(.97); }
.racer-auth.shell-motion-enter-from { transform: scale(.98); }
@media (prefers-reduced-motion: reduce) {
  .shell-motion-enter-active, .shell-motion-leave-active { transition: none; }
  .shell-motion-enter-from, .shell-motion-leave-to { transform: none !important; }
}

// Responsive
@media (max-width: 768px) {
  .auth-card-standalone {
    margin: 16px;
    padding: 40px 32px;
  }
}
</style>

<style lang="scss">
// PIP-640: login -> loader. The loader does not fade in: its logo is the login logo carried over (onShellEnter);
// the laser lights up once the logo is home. Loader -> dashboard: as at the start, the logo fades, grows and
// blurs out, then the dashboard fades in.
.loading-screen.is-carried.shell-motion-enter-from { opacity: 1; }
.loading-screen.is-carried .rc-boot__inner { animation: none; }
.loading-screen.is-carried .rc-boot__laser { animation: rc-laser-in 500ms 550ms cubic-bezier(.4, 0, .2, 1) both; }
@keyframes rc-laser-in { from { opacity: 0; transform: scaleX(.4); } }
.loading-screen.is-carried .loading-text { animation: rc-text-in 500ms 650ms ease-out both; }
@keyframes rc-text-in { from { opacity: 0; } }
.loading-screen.shell-motion-leave-active { transition-duration: 700ms; }
.loading-screen.shell-motion-leave-to { opacity: 1; }
.loading-screen.shell-motion-leave-active .rc-boot__inner { opacity: 0; transform: scale(1.05); filter: blur(4px); }
#app:has(> .loading-screen.shell-motion-leave-active) .dashboard-wrapper.shell-motion-enter-active { transition-duration: 700ms; transition-delay: 450ms; }
@media (prefers-reduced-motion: reduce) { .loading-screen.is-carried .rc-boot__laser { animation: none; } }
// PIP-640: while the browser loading screen is up it is the only logo on screen (no double logo under it), and
// the first interface waits for its logo to fade before fading in, slowly: logo out, then the content.
body:has(#rc-boot) #app :is(.rc-boot__inner, .loading-text) { visibility: hidden; }
body:has(#rc-boot.is-leaving) #app .shell-motion-enter-active { transition-duration: 700ms; transition-delay: 450ms; }
// First screen = login: its logo stays hidden until the loader logo has glided into its place; the form fades in.
body:has(#rc-boot) #app .racer-auth__logo-viewport img { visibility: hidden; }
body:has(#rc-boot.is-gliding) #app .racer-auth.shell-motion-enter-from { transform: none; }
body:has(#rc-boot.is-gliding) #app .racer-auth.shell-motion-enter-active { transition-duration: 700ms; transition-delay: 300ms; }
// The shared dashboard owns scrolling below its header on every route.
html:has(.dashboard-layout), body:has(.dashboard-layout) { overflow: hidden; scrollbar-gutter: auto; }
#app:has(.electron-titlebar) > .dashboard-wrapper:has(.dashboard-layout) {
  overflow: hidden; scrollbar-gutter: auto;
}
</style>
