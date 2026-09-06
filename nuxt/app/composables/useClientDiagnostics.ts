import { onBeforeUnmount, watch, type Ref } from 'vue'
import { doc, serverTimestamp } from 'firebase/firestore'
import { db } from '~/config/firebase'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import { trackedGetDoc, trackedSetDoc } from '~/composables/useFirebaseTracker'
import {
  CLIENT_DIAGNOSTIC_FLUSH_INTERVAL_MS,
  buildDiagnosticDocument,
  createLocalDiagnostic,
  flushDiagnosticOutbox,
  type DiagnosticSuiteContext,
  type LocalClientDiagnostic
} from '~/services/monitoring/clientDiagnosticsService'
import { createOwnerOperationTracker } from '~/services/sync/ownerOperationTracker'
import { createBrowserDiagnosticStore } from '~/services/monitoring/browserDiagnosticStore'

const CALLER = 'ClientDiagnostics'

type ElectronDiagnosticsApi = {
  captureDiagnostic?: (event: LocalClientDiagnostic) => Promise<unknown>
  listDiagnostics?: (limit?: number) => Promise<LocalClientDiagnostic[]>
  acknowledgeDiagnostics?: (eventIds: string[]) => Promise<number>
  reserveDiagnostic?: (eventId: string) => Promise<LocalClientDiagnostic | null>
  failDiagnostic?: (eventId: string, quota: boolean) => Promise<unknown>
  getSuiteVersion?: () => Promise<DiagnosticSuiteContext | null>
}

function getElectronApi(): ElectronDiagnosticsApi | null {
  if (typeof window === 'undefined') return null
  return ((window as any).electronAPI || null) as ElectronDiagnosticsApi | null
}

function errorDetails(error: unknown): { message: string, stack: string } {
  if (error instanceof Error) {
    return { message: error.message, stack: error.stack || '' }
  }
  return { message: String(error || 'Errore sconosciuto'), stack: '' }
}

function toFirestoreDiagnostic(payload: ReturnType<typeof buildDiagnosticDocument>) {
  return {
    ...payload,
    receivedAt: serverTimestamp()
  }
}

export function useClientDiagnostics(options: {
  enabled?: Ref<boolean>
  captureEnabled?: Ref<boolean>
  flushEnabled?: Ref<boolean>
  isLeaseCurrent?: (uid: string) => boolean
}) {
  const { currentUser, canEnterApp } = useFirebaseAuth()
  const nuxtApp = useNuxtApp()
  const route = useRoute()
  let browserStore: ReturnType<typeof createBrowserDiagnosticStore> | null = null
  const getBrowserStore = () => browserStore || (browserStore = createBrowserDiagnosticStore())
  let intervalId: number | null = null
  let isFlushing = false
  let flushQueued = false
  const ownerOperations = createOwnerOperationTracker()
  const canCapture = () => options.captureEnabled?.value ?? options.enabled?.value ?? false
  const canFlush = () => options.flushEnabled?.value ?? options.enabled?.value ?? false

  async function capture(input: LocalClientDiagnostic): Promise<boolean> {
    try {
      if (!canCapture()) return false
      const event = createLocalDiagnostic(input)
      const electronAPI = getElectronApi()
      if (electronAPI?.captureDiagnostic) {
        await electronAPI.captureDiagnostic(event)
        return true
      }

      // A secondary Electron renderer must never create a browser cloud path.
      if (electronAPI) return false
      const uid = currentUser.value?.uid || null
      const buildId = nuxtApp.$config?.app?.buildId
      await getBrowserStore().capture({ ...event, suite: typeof buildId === 'string' ? `web:${buildId}`.slice(0, 80) : null }, uid)
      return true
    } catch {
      // Diagnostics must never become a second application failure.
      return false
    }
  }

  async function performFlush(): Promise<number> {
    const uid = currentUser.value?.uid
    const electronAPI = getElectronApi()
    if (
      !canFlush()
      || !uid
      || !canEnterApp.value
      || (electronAPI && (!electronAPI.listDiagnostics || !electronAPI.acknowledgeDiagnostics))
    ) {
      return 0
    }
    if (options.isLeaseCurrent && !options.isLeaseCurrent(uid)) return 0

    if (isFlushing) {
      flushQueued = true
      return 0
    }

    isFlushing = true
    try {
      const [events, suite] = await Promise.all([
        electronAPI ? electronAPI.listDiagnostics!(50) : getBrowserStore().list(uid),
        electronAPI?.getSuiteVersion ? electronAPI.getSuiteVersion() : Promise.resolve(null)
      ])
      if (options.isLeaseCurrent && !options.isLeaseCurrent(uid)) return 0
      const result = await flushDiagnosticOutbox({
        events: events || [],
        uid,
        suite,
        reserve: (id) => electronAPI
          ? (electronAPI.reserveDiagnostic?.(id) || Promise.resolve(null))
          : getBrowserStore().reserve(id, uid),
        failed: (id, quota) => electronAPI
          ? (electronAPI.failDiagnostic?.(id, quota) || Promise.resolve())
          : getBrowserStore().failed(id, uid, quota),
        isUploaded: async (eventId) => {
          const snapshot = await trackedGetDoc(
            doc(db, `users/${uid}/diagnostics/${eventId}`),
            CALLER
          )
          return snapshot.exists()
        },
        upload: (payload) => trackedSetDoc(
          doc(db, `users/${uid}/diagnostics/${payload.eventId}`),
          toFirestoreDiagnostic(payload),
          CALLER
        ),
        acknowledge: (eventId) => electronAPI ? electronAPI.acknowledgeDiagnostics!([eventId]) : getBrowserStore().acknowledge(eventId, uid),
        isCurrent: () => currentUser.value?.uid === uid && canFlush() && canEnterApp.value
          && (!options.isLeaseCurrent || options.isLeaseCurrent(uid))
      })
      return result.acknowledged
    } catch (error) {
      console.warn('[DIAGNOSTICS] Flush deferred:', error)
      return 0
    } finally {
      isFlushing = false
      if (flushQueued) {
        flushQueued = false
        void flush()
      }
    }
  }

  function flush(): Promise<number> {
    return ownerOperations.track(performFlush())
  }

  const onWindowError = (event: ErrorEvent) => {
    void capture({
      component: 'frontend',
      severity: 'error',
      code: 'window.error',
      message: event.message,
      stack: event.error?.stack || '',
      context: { route: route.path }
    })
  }
  const onUnhandledRejection = (event: PromiseRejectionEvent) => {
    const details = errorDetails(event.reason)
    void capture({
      component: 'frontend',
      severity: 'error',
      code: 'window.unhandled_rejection',
      message: details.message,
      stack: details.stack,
      context: { route: route.path }
    })
  }

  const previousVueErrorHandler = nuxtApp.vueApp.config.errorHandler
  const vueErrorHandler = (error: unknown, instance: unknown, info: string) => {
    const details = errorDetails(error)
    void capture({
      component: 'frontend',
      severity: 'error',
      code: 'vue.error',
      message: details.message,
      stack: details.stack,
      context: { info }
    })
    previousVueErrorHandler?.(error, instance as any, info)
  }
  nuxtApp.vueApp.config.errorHandler = vueErrorHandler

  if (typeof window !== 'undefined') {
    window.addEventListener('error', onWindowError)
    window.addEventListener('unhandledrejection', onUnhandledRejection)
    intervalId = window.setInterval(() => void flush(), CLIENT_DIAGNOSTIC_FLUSH_INTERVAL_MS)
  }

  const stopWatch = watch(
    [currentUser, canEnterApp, options.flushEnabled || options.enabled!],
    ([user, canEnter, enabled]) => {
      if (user && canEnter && enabled) void flush()
    },
    { immediate: true }
  )

  onBeforeUnmount(() => {
    stopWatch()
    if (typeof window !== 'undefined') {
      window.removeEventListener('error', onWindowError)
      window.removeEventListener('unhandledrejection', onUnhandledRejection)
    }
    if (intervalId !== null) {
      clearInterval(intervalId)
      intervalId = null
    }
    if (nuxtApp.vueApp.config.errorHandler === vueErrorHandler) {
      nuxtApp.vueApp.config.errorHandler = previousVueErrorHandler
    }
  })

  return {
    capture,
    flush,
    waitForIdle: () => ownerOperations.drain()
  }
}
