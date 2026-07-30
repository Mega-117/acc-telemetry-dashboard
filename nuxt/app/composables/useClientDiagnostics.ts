import { onBeforeUnmount, watch, type Ref } from 'vue'
import { doc } from 'firebase/firestore'
import { db } from '~/config/firebase'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import { trackedGetDoc, trackedSetDoc } from '~/composables/useFirebaseTracker'
import {
  CLIENT_DIAGNOSTIC_FLUSH_INTERVAL_MS,
  buildDiagnosticDocument,
  createLocalDiagnostic,
  flushDiagnosticOutbox,
  shouldCaptureDiagnostic,
  type DiagnosticSuiteContext,
  type LocalClientDiagnostic
} from '~/services/monitoring/clientDiagnosticsService'

const CALLER = 'ClientDiagnostics'

type ElectronDiagnosticsApi = {
  captureDiagnostic?: (event: LocalClientDiagnostic) => Promise<unknown>
  listDiagnostics?: (limit?: number) => Promise<LocalClientDiagnostic[]>
  acknowledgeDiagnostics?: (eventIds: string[]) => Promise<number>
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

export function useClientDiagnostics(options: {
  enabled?: Ref<boolean>
  captureEnabled?: Ref<boolean>
  flushEnabled?: Ref<boolean>
}) {
  const { currentUser, canEnterApp } = useFirebaseAuth()
  const nuxtApp = useNuxtApp()
  const route = useRoute()
  const lastCapturedByFingerprint = new Map<string, number>()
  let intervalId: number | null = null
  let isFlushing = false
  const canCapture = () => options.captureEnabled?.value ?? options.enabled?.value ?? false
  const canFlush = () => options.flushEnabled?.value ?? options.enabled?.value ?? false

  async function capture(input: LocalClientDiagnostic): Promise<boolean> {
    try {
      if (!canCapture()) return false
      const event = createLocalDiagnostic(input)
      const now = Date.now()
      if (!shouldCaptureDiagnostic(lastCapturedByFingerprint.get(event.fingerprint), now)) {
        return false
      }
      lastCapturedByFingerprint.set(event.fingerprint, now)

      const electronAPI = getElectronApi()
      if (electronAPI?.captureDiagnostic) {
        await electronAPI.captureDiagnostic(event)
        return true
      }

      const uid = currentUser.value?.uid
      if (!uid || !canEnterApp.value) return false
      const suite = electronAPI?.getSuiteVersion ? await electronAPI.getSuiteVersion() : null
      const payload = buildDiagnosticDocument(event, uid, suite)
      await trackedSetDoc(
        doc(db, `users/${uid}/diagnostics/${payload.eventId}`),
        payload,
        CALLER
      )
      return true
    } catch {
      // Diagnostics must never become a second application failure.
      return false
    }
  }

  async function flush(): Promise<number> {
    const uid = currentUser.value?.uid
    const electronAPI = getElectronApi()
    if (
      !canFlush()
      || !uid
      || !canEnterApp.value
      || !electronAPI?.listDiagnostics
      || !electronAPI?.acknowledgeDiagnostics
      || isFlushing
    ) {
      return 0
    }

    isFlushing = true
    try {
      const [events, suite] = await Promise.all([
        electronAPI.listDiagnostics(50),
        electronAPI.getSuiteVersion ? electronAPI.getSuiteVersion() : Promise.resolve(null)
      ])
      const result = await flushDiagnosticOutbox({
        events: events || [],
        uid,
        suite,
        isUploaded: async (eventId) => {
          const snapshot = await trackedGetDoc(
            doc(db, `users/${uid}/diagnostics/${eventId}`),
            CALLER
          )
          return snapshot.exists()
        },
        upload: (payload) => trackedSetDoc(
          doc(db, `users/${uid}/diagnostics/${payload.eventId}`),
          payload,
          CALLER
        ),
        acknowledge: (eventId) => electronAPI.acknowledgeDiagnostics!([eventId])
      })
      return result.acknowledged
    } catch (error) {
      console.warn('[DIAGNOSTICS] Flush deferred:', error)
      return 0
    } finally {
      isFlushing = false
    }
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

  return { capture, flush }
}
