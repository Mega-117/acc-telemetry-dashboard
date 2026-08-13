// @description Carica e gestisce la lista di sessioni telemetria da sorgenti locali (Electron) e cloud (Firebase), con merge deterministico e cache in-memory.

import { ref, computed } from 'vue'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import { type DocumentReference, type Query } from 'firebase/firestore'
import { trackedGetDoc, trackedGetDocs } from './useFirebaseTracker'
import { db } from '~/config/firebase'
import {
    loadLocalTelemetrySessions,
    findLocalFullSessionById
} from '~/repositories/telemetryLocalRepository'
import {
    loadCloudSessionsBounded,
    loadCloudSessionIndexList,
    fetchCloudFullSession
} from '~/repositories/telemetryCloudRepository'
import {
    dedupeCloudSessions as dedupeCloudSessionsService,
    mergeSessionsDeterministic as mergeSessionsDeterministicService
} from '~/services/telemetry/telemetryMergeService'
import type { FullSession, LoadSessionsOptions, SessionDocument } from '~/types/telemetry'

const CALLER = 'SessionLoader'
async function getDoc(ref: DocumentReference) { return trackedGetDoc(ref, CALLER) }
async function getDocs(q: Query) { return trackedGetDocs(q, CALLER) }

const FIREBASE_SESSIONS_FALLBACK_LIMIT = 200

// === GLOBAL STATE (singleton, persiste tra navigazioni) ===
export const globalSessions = ref<SessionDocument[]>([])
export const globalIsLoading = ref(false)
export const globalError = ref<string | null>(null)
export const globalLastUserId = ref<string | null>(null)

export function useSessionLoader() {
    const sessions = globalSessions
    const isLoading = globalIsLoading
    const error = globalError

    const { currentUser } = useFirebaseAuth()

    const isElectron = computed(() => {
        if (typeof window === 'undefined') return false
        return !!(window as any).electronAPI
    })

    function isSessionFileCandidate(fileName: string, rawObj: any): boolean {
        const normalized = (fileName || '').toLowerCase()
        if (!normalized.endsWith('.json')) return false
        if (normalized === 'live_state.json') return false
        if (!rawObj?.session_info?.date_start) return false
        if (!rawObj?.session_info?.track) return false
        return true
    }

    async function loadFromLocalFiles(ownerId?: string): Promise<SessionDocument[]> {
        if (!isElectron.value) return []
        const electronAPI = (window as any).electronAPI
        return loadLocalTelemetrySessions({
            electronAPI,
            ownerId: ownerId || currentUser.value?.uid,
            isOnline: typeof window === 'undefined' ? true : navigator.onLine
        })
    }

    async function loadFromFirebase(targetUserId: string, maxItems: number = FIREBASE_SESSIONS_FALLBACK_LIMIT): Promise<SessionDocument[]> {
        return loadCloudSessionsBounded({
            db,
            targetUserId,
            maxItems,
            getDocsFn: getDocs
        })
    }

    async function loadSessions(
        userId?: string,
        forceReload: boolean = false,
        options: LoadSessionsOptions = {}
    ): Promise<SessionDocument[]> {
        const targetUserId = userId || currentUser.value?.uid
        if (!targetUserId) {
            console.warn('[SESSION_LOADER] No user ID provided')
            return []
        }

        const sourceMode = options.sourceMode || 'auto'
        const context = options.context || 'default'

        const userChanged = globalLastUserId.value !== targetUserId
        const canUseInMemoryCache = sourceMode !== 'cloud_fresh'
        if (canUseInMemoryCache && !forceReload && !userChanged && sessions.value.length > 0) {
            console.log(`[SESSION_LOADER] Using cached sessions (${sessions.value.length}), skipping query`)
            return sessions.value
        }

        globalLastUserId.value = targetUserId
        isLoading.value = true
        error.value = null

        try {
            const isLoadingOwnData = !userId || userId === currentUser.value?.uid
            const isOnline = typeof window === 'undefined' ? true : navigator.onLine
            const shouldTrySessionIndex = sourceMode !== 'cloud_fresh'
            let usedSessionIndex = false
            let sourceLabel = 'cloudQuery'
            let localSessions: SessionDocument[] = []

            const shouldLoadLocal = isElectron.value && (sourceMode === 'local_first' || isLoadingOwnData)
            if (shouldLoadLocal) {
                try {
                    localSessions = await loadFromLocalFiles(targetUserId)
                } catch (localReadError) {
                    localSessions = []
                    console.warn('[SESSION_LOADER] Local preload failed:', localReadError)
                }
            }

            // Offline owner: local cache/outbox only.
            if (isElectron.value && isLoadingOwnData && !isOnline) {
                sessions.value = localSessions.map((session) => ({
                    ...session,
                    syncState: session.syncState === 'synced' ? 'synced' : 'local_only'
                }))
                console.log(`[SESSION_LOADER] Offline mode: loaded ${sessions.value.length} local sessions`)
                return sessions.value
            }

            let cloudSessions: SessionDocument[] = []

            if (shouldTrySessionIndex) {
                try {
                    cloudSessions = await loadCloudSessionIndexList({
                        db,
                        targetUserId,
                        getDocFn: getDoc
                    })
                    usedSessionIndex = cloudSessions.length > 0
                } catch (indexError) {
                    console.warn('[SESSION_LOADER] SessionIndex read failed, fallback to bounded query:', indexError)
                }
            }

            if (cloudSessions.length === 0) {
                cloudSessions = await loadFromFirebase(targetUserId, FIREBASE_SESSIONS_FALLBACK_LIMIT)
            }

            const uniqueCloudSessions = dedupeCloudSessionsService(cloudSessions)
            let mergedSessions = uniqueCloudSessions

            if (sourceMode === 'local_first') {
                if (localSessions.length > 0) {
                    mergedSessions = mergeSessionsDeterministicService(localSessions, uniqueCloudSessions, {
                        localWins: true,
                        includeSyncedLocal: true
                    })
                    sourceLabel = uniqueCloudSessions.length > 0 ? 'local_first+cloud_merge' : 'local_first'
                } else {
                    sourceLabel = usedSessionIndex ? 'cloud_fallback_sessionIndex' : 'cloud_fallback_query'
                }
            } else if (isElectron.value && isLoadingOwnData) {
                mergedSessions = mergeSessionsDeterministicService(localSessions, uniqueCloudSessions, {
                    localWins: false,
                    includeSyncedLocal: false
                })
                sourceLabel = usedSessionIndex ? 'sessionIndex+pendingLocal' : 'cloudQuery+pendingLocal'
            } else {
                sourceLabel = usedSessionIndex ? 'sessionIndex' : 'cloudQuery'
            }

            sessions.value = mergedSessions
            console.log(`[SESSION_LOADER] Loaded ${sessions.value.length} sessions (mode=${sourceMode}, source=${sourceLabel}, context=${context})`)
            return sessions.value
        } catch (e: any) {
            console.error('[SESSION_LOADER] Error loading sessions:', e)
            error.value = e.message
            return []
        } finally {
            isLoading.value = false
        }
    }

    async function fetchSessionFull(sessionId: string, userId?: string, isCoachAccess: boolean = false): Promise<FullSession | null> {
        const targetUserId = userId || currentUser.value?.uid
        if (!targetUserId) return null

        const isLoadingOwnData = !userId || userId === currentUser.value?.uid

        if (isElectron.value && isLoadingOwnData) {
            try {
                const electronAPI = (window as any).electronAPI
                const localSession = await findLocalFullSessionById({
                    electronAPI,
                    sessionId,
                    ownerId: targetUserId
                })
                if (localSession) {
                    console.log(`[SESSION_LOADER] Loaded full session from LOCAL file (0 Firebase reads)`)
                    return localSession
                }
            } catch (localError) {
                console.warn('[SESSION_LOADER] Local fetchSessionFull failed, falling back to Firebase:', localError)
            }
        }

        try {
            const isExternalSession = targetUserId !== currentUser.value?.uid && !isCoachAccess
            const raw = await fetchCloudFullSession({
                db,
                targetUserId,
                sessionId,
                isExternalSession,
                getDocFn: getDoc,
                getDocsFn: getDocs
            })
            if (!raw) return null
            console.log(`[SESSION_LOADER] Loaded full session from Firebase chunks${isExternalSession ? ' (EXTERNAL)' : ''}`)
            return raw
        } catch (e) {
            console.error('[SESSION_LOADER] Error fetching full session:', e)
            return null
        }
    }

    return {
        sessions,
        isLoading,
        error,
        isElectron,
        isSessionFileCandidate,
        loadFromLocalFiles,
        loadFromFirebase,
        loadSessions,
        fetchSessionFull,
    }
}
