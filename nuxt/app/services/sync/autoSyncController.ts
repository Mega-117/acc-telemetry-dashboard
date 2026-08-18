import type { SyncTrigger } from './syncTriggerPolicy'
import type { TelemetryFileDescriptor } from './syncScanService'

const WINDOW_FOCUS_SYNC_THROTTLE_MS = 5000
const AUTH_READY_RETRY_DELAY_MS = 1000
const AUTH_READY_MAX_ATTEMPTS = 3
const AUTH_READY_RECOVERY_RETRY_DELAY_MS = 60_000
const AUTH_READY_MAX_TOTAL_ATTEMPTS = 15
const MAX_BUFFERED_CHANGED_FILES = 500

export interface CloudOwnerLease {
  uid: string
  generation: number
}

export function createCloudOwnerLeaseController() {
  let generation = 0
  let active: CloudOwnerLease | null = null

  function start(uid: string): CloudOwnerLease {
    if (active?.uid === uid) return active
    generation += 1
    active = Object.freeze({ uid, generation })
    return active
  }

  function revoke(): number {
    generation += 1
    active = null
    return generation
  }

  function isCurrent(lease: CloudOwnerLease): boolean {
    return active?.uid === lease.uid && active.generation === lease.generation
  }

  return {
    start,
    revoke,
    isCurrent,
    getActive: () => active,
    getGeneration: () => generation
  }
}

type AutoSyncElectronApi = {
  onFilesChanged?: (callback: (data: { new?: TelemetryFileDescriptor[]; modified?: TelemetryFileDescriptor[] }) => void) => (() => void) | void
  onWindowFocused?: (callback: () => void) => (() => void) | void
  onInitialFiles?: (callback: (data: { files?: unknown[]; registry?: unknown }) => void) => (() => void) | void
  onRuntimeBootstrapCommand?: (callback: (command: { schemaVersion?: number; type?: string }) => void) => (() => void) | void
}

export interface AutoSyncTriggerPayload {
  files?: TelemetryFileDescriptor[]
  uid?: string
  backgroundRetry?: boolean
}

export function setupAutoSyncController(params: {
  isElectron: boolean
  electronAPI: AutoSyncElectronApi | null | undefined
  lease: CloudOwnerLease
  isLeaseCurrent: (lease: CloudOwnerLease) => boolean
  handleTrigger: (trigger: SyncTrigger, payload?: AutoSyncTriggerPayload) => Promise<void>
  onInitialRegistry?: (data: { files?: unknown[]; registry?: unknown }) => void
  maxAuthReadyAttempts?: number
  maxAuthReadyTotalAttempts?: number
  retryDelayMs?: number
  recoveryRetryDelayMs?: number
  setTimeoutFn?: typeof window.setTimeout
  clearTimeoutFn?: typeof window.clearTimeout
}): () => void {
  const {
    isElectron,
    electronAPI,
    lease,
    isLeaseCurrent,
    handleTrigger,
    onInitialRegistry,
    maxAuthReadyAttempts = AUTH_READY_MAX_ATTEMPTS,
    maxAuthReadyTotalAttempts = AUTH_READY_MAX_TOTAL_ATTEMPTS,
    retryDelayMs = AUTH_READY_RETRY_DELAY_MS,
    recoveryRetryDelayMs = AUTH_READY_RECOVERY_RETRY_DELAY_MS,
    setTimeoutFn = window.setTimeout.bind(window),
    clearTimeoutFn = window.clearTimeout.bind(window)
  } = params

  if (!isElectron || !electronAPI) return () => {}

  let disposed = false
  let authReady = false
  let authReadyAttempts = 0
  let authReadyTotalAttempts = 0
  let hasAttemptedAuthReady = false
  let authReadyInFlight: Promise<void> | null = null
  let rearmRequested = false
  let retryTimer: number | null = null
  let lastWindowFocusSyncAt = 0
  let bufferedChangedFiles: TelemetryFileDescriptor[] = []
  const unsubscribers: Array<() => void> = []

  const current = () => !disposed && isLeaseCurrent(lease)
  const rememberUnsubscribe = (candidate: (() => void) | void) => {
    if (typeof candidate === 'function') unsubscribers.push(candidate)
  }

  function clearRetry() {
    if (retryTimer === null) return
    clearTimeoutFn(retryTimer)
    retryTimer = null
  }

  function rearmAuthReadyBudget(): boolean {
    if (!current() || authReady || authReadyInFlight) return false
    authReadyAttempts = 0
    authReadyTotalAttempts = 0
    clearRetry()
    return true
  }

  function requestAuthReadyRearm() {
    if (!current() || authReady) return
    if (authReadyInFlight) {
      rearmRequested = true
      return
    }
    if (rearmAuthReadyBudget()) void runAuthReady()
  }

  function scheduleAuthReadyRetry() {
    if (!current() || authReady || retryTimer !== null || authReadyTotalAttempts >= maxAuthReadyTotalAttempts) return
    const delayMs = authReadyAttempts >= maxAuthReadyAttempts
      ? recoveryRetryDelayMs
      : retryDelayMs
    retryTimer = setTimeoutFn(() => {
      retryTimer = null
      void runAuthReady()
    }, delayMs)
  }

  async function runAuthReady(): Promise<void> {
    if (!current() || authReady || authReadyInFlight || authReadyTotalAttempts >= maxAuthReadyTotalAttempts) return
    authReadyAttempts += 1
    authReadyTotalAttempts += 1
    const backgroundRetry = hasAttemptedAuthReady
    hasAttemptedAuthReady = true
    authReadyInFlight = (async () => {
      try {
        await handleTrigger('authReady', { uid: lease.uid, backgroundRetry })
        if (current()) {
          authReady = true
          const pendingFiles = bufferedChangedFiles
          bufferedChangedFiles = []
          if (pendingFiles.length > 0) {
            await runAfterReady('filesChanged', { files: pendingFiles })
          }
        }
      } catch {
        scheduleAuthReadyRetry()
      } finally {
        authReadyInFlight = null
        const shouldRearm = rearmRequested && current() && !authReady
        rearmRequested = false
        if (shouldRearm) {
          authReadyAttempts = 0
          authReadyTotalAttempts = 0
          clearRetry()
          void runAuthReady()
        }
      }
    })()
    await authReadyInFlight
  }

  async function runAfterReady(trigger: SyncTrigger, payload?: { files?: TelemetryFileDescriptor[] }) {
    if (!current() || !authReady) return
    try {
      await handleTrigger(trigger, payload ? { ...payload, uid: lease.uid } : { uid: lease.uid })
    } catch (error) {
      if (current()) console.warn(`[SYNC] ${trigger} failed:`, error)
    }
  }

  rememberUnsubscribe(electronAPI.onFilesChanged?.((data) => {
    const changedFiles = [...(data?.new || []), ...(data?.modified || [])]
    if (!current() || changedFiles.length === 0) return
    if (!authReady) {
      bufferedChangedFiles = [...bufferedChangedFiles, ...changedFiles].slice(-MAX_BUFFERED_CHANGED_FILES)
      return
    }
    void runAfterReady('filesChanged', { files: changedFiles })
  }))

  rememberUnsubscribe(electronAPI.onWindowFocused?.(() => {
    const now = Date.now()
    if (now - lastWindowFocusSyncAt < WINDOW_FOCUS_SYNC_THROTTLE_MS) return
    lastWindowFocusSyncAt = now
    if (!authReady) {
      requestAuthReadyRearm()
      return
    }
    void runAfterReady('windowFocused')
  }))

  rememberUnsubscribe(electronAPI.onInitialFiles?.((data) => {
    if (!current()) return
    onInitialRegistry?.(data)
    void runAfterReady('initialFiles')
  }))

  rememberUnsubscribe(electronAPI.onRuntimeBootstrapCommand?.((command) => {
    if (command?.schemaVersion !== 1 || command?.type !== 'manual-sync') return
    void runAfterReady('manualForceSync')
  }))

  const handleOnline = () => {
    if (!current()) return
    if (authReady) {
      void runAfterReady('windowFocused')
      return
    }
    requestAuthReadyRearm()
  }
  window.addEventListener('online', handleOnline)

  // The caller creates this controller only after the primary Auth observer
  // has produced a verified UID, so authReady starts immediately and once.
  void Promise.resolve().then(runAuthReady)

  return () => {
    if (disposed) return
    disposed = true
    clearRetry()
    rearmRequested = false
    bufferedChangedFiles = []
    window.removeEventListener('online', handleOnline)
    for (const unsubscribe of unsubscribers.splice(0)) unsubscribe()
  }
}
