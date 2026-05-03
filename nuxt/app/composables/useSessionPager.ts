import { computed, ref } from 'vue'
import {
    collection,
    doc,
    limit,
    orderBy,
    query,
    startAfter,
    where,
    type DocumentData,
    type QueryConstraint,
    type QueryDocumentSnapshot
} from 'firebase/firestore'
import { trackedGetCountFromServer, trackedGetDoc, trackedGetDocs } from './useFirebaseTracker'
import { useFirebaseAuth } from './useFirebaseAuth'
import { db } from '~/config/firebase'
import { formatCarName, formatTrackName, type SessionDocument } from './useTelemetryData'
import { loadLocalTelemetrySessions } from '~/repositories/telemetryLocalRepository'
import {
    buildLogicalSessionKey,
    dedupeCloudSessions,
    mergePendingLocal,
    mergeLocalFirst
} from '~/services/telemetry/telemetryMergeService'

const CALLER = 'SessionPager'
const DEFAULT_PAGE_SIZE = 25
const CLOUD_IDENTITY_CACHE_TTL_MS = 3000

type SessionSyncState = 'synced' | 'pending_sync' | 'local_only' | 'sync_failed'

export type SessionPagerFilters = {
    sessionTypes?: number[]
    fromDateIso?: string | null
    toDateIso?: string | null
    track?: string | null
    car?: string | null
    hideEmpty?: boolean
}

type PageLoadOptions = {
    page?: number
    pageSize?: number
    reset?: boolean
    filters?: SessionPagerFilters
}

type PagerState = {
    currentPage: number
    pageSize: number
    hasNext: boolean
    hasPrev: boolean
    totalItems: number | null
    loading: boolean
}

const globalSessions = ref<SessionDocument[]>([])
const globalState = ref<PagerState>({
    currentPage: 1,
    pageSize: DEFAULT_PAGE_SIZE,
    hasNext: false,
    hasPrev: false,
    totalItems: null,
    loading: false
})
const globalError = ref<string | null>(null)
const globalOnline = ref(true)
const globalFilters = ref<SessionPagerFilters>({})
const globalTargetUser = ref<string | null>(null)
const globalCursorMap: Map<number, QueryDocumentSnapshot<DocumentData> | null> = new Map([[1, null]])
const globalPageCache = ref<Record<number, SessionDocument[]>>({})
const globalInitialized = ref(false)
const globalCloudIdentityCache = new Map<string, {
    cachedAt: number
    ids: Set<string>
    logicalKeys: Set<string>
}>()

async function getDocTracked(ref: any) { return trackedGetDoc(ref, CALLER) }
async function getDocsTracked(q: any) { return trackedGetDocs(q, CALLER) }
async function getCountTracked(q: any) { return trackedGetCountFromServer(q, CALLER) }

function normalizeIso(input?: string | null): string | null {
    if (!input) return null
    const date = new Date(input)
    if (Number.isNaN(date.getTime())) return null
    return date.toISOString()
}

function sameFilters(a: SessionPagerFilters, b: SessionPagerFilters): boolean {
    return JSON.stringify(a || {}) === JSON.stringify(b || {})
}

function sessionMs(session: SessionDocument): number {
    const date = session.meta?.date_start || ''
    const parsed = Date.parse(date)
    return Number.isFinite(parsed) ? parsed : 0
}

function matchesClientFilters(session: SessionDocument, filters: SessionPagerFilters): boolean {
    const types = (filters.sessionTypes || []).filter((t) => Number.isFinite(t))
    const type = Number(session.meta?.session_type ?? -1)
    if (types.length > 0 && !types.includes(type)) return false

    const fromMs = normalizeIso(filters.fromDateIso) ? Date.parse(normalizeIso(filters.fromDateIso) as string) : null
    const toMs = normalizeIso(filters.toDateIso) ? Date.parse(normalizeIso(filters.toDateIso) as string) : null
    const ms = sessionMs(session)
    if (fromMs !== null && ms < fromMs) return false
    if (toMs !== null && ms > toMs) return false

    if (filters.hideEmpty && Number(session.summary?.laps || 0) === 0) return false

    const filterTrack = (filters.track || '').trim().toLowerCase()
    if (filterTrack) {
        const sessionTrack = formatTrackName(session.meta?.track || '').trim().toLowerCase()
        if (sessionTrack !== filterTrack) return false
    }

    const filterCar = (filters.car || '').trim().toLowerCase()
    if (filterCar) {
        const sessionCar = formatCarName(session.meta?.car || '').trim().toLowerCase()
        if (sessionCar !== filterCar) return false
    }

    return true
}

function applyClientFilters(list: SessionDocument[], filters: SessionPagerFilters): SessionDocument[] {
    return list.filter((session) => matchesClientFilters(session, filters))
}

export function buildMergedSessionPage(
    localSessions: SessionDocument[],
    cloudSessions: SessionDocument[],
    requestedPage: number,
    pageSize: number
): {
    mergedAll: SessionDocument[]
    pageSlice: SessionDocument[]
    safePage: number
    total: number
} {
    const mergedAll = mergeLocalFirst(localSessions, dedupeCloudSessions(cloudSessions))
    const total = mergedAll.length
    const safePage = Math.min(Math.max(1, requestedPage), Math.max(1, Math.ceil(total / pageSize)))
    const start = (safePage - 1) * pageSize
    return {
        mergedAll,
        pageSlice: mergedAll.slice(start, start + pageSize),
        safePage,
        total
    }
}

function normalizeCloudDoc(docSnap: QueryDocumentSnapshot<DocumentData>): SessionDocument {
    const data = docSnap.data()
    return {
        sessionId: docSnap.id,
        fileHash: data.fileHash || '',
        fileName: data.fileName || '',
        uploadedAt: data.uploadedAt || null,
        meta: data.meta || {},
        summary: data.summary || {},
        rawChunkCount: data.rawChunkCount || 0,
        rawSizeBytes: data.rawSizeBytes || 0,
        source: 'cloud',
        syncState: 'synced'
    } as SessionDocument
}

async function getLocalSessionsForUser(currentUid: string): Promise<SessionDocument[]> {
    const electronAPI = (window as any).electronAPI
    return loadLocalTelemetrySessions({
        electronAPI,
        ownerId: currentUid,
        isOnline: globalOnline.value
    })
}

function ensureInit() {
    if (globalInitialized.value) return
    globalInitialized.value = true
    if (typeof window !== 'undefined') {
        globalOnline.value = navigator.onLine
        window.addEventListener('online', () => { globalOnline.value = true })
        window.addEventListener('offline', () => { globalOnline.value = false })
    }
}

function resetPager(pageSize: number, filters: SessionPagerFilters, targetUserId: string) {
    globalState.value.currentPage = 1
    globalState.value.pageSize = pageSize
    globalState.value.hasNext = false
    globalState.value.hasPrev = false
    globalState.value.totalItems = null
    globalFilters.value = filters
    globalTargetUser.value = targetUserId
    globalCursorMap.clear()
    globalCursorMap.set(1, null)
    globalPageCache.value = {}
}

async function resolveTotals(targetUserId: string, filters: SessionPagerFilters): Promise<number | null> {
    try {
        if (!filters.track && !filters.car) {
            const sessionsRef = collection(db, `users/${targetUserId}/sessions`)
            const constraints: QueryConstraint[] = []
            const types = (filters.sessionTypes || []).filter((t) => Number.isFinite(t))

            if (types.length === 1) {
                constraints.push(where('meta.session_type', '==', types[0]!))
            } else if (types.length > 1 && types.length <= 10) {
                constraints.push(where('meta.session_type', 'in', types))
            }

            const fromIso = normalizeIso(filters.fromDateIso)
            const toIso = normalizeIso(filters.toDateIso)
            if (fromIso) constraints.push(where('meta.date_start', '>=', fromIso))
            if (toIso) constraints.push(where('meta.date_start', '<=', toIso))
            if (filters.hideEmpty) constraints.push(where('summary.laps', '>', 0))

            if (constraints.length > 0) {
                try {
                    const countSnap = await getCountTracked(query(sessionsRef, ...constraints))
                    return Number(countSnap.data().count || 0)
                } catch {
                    // Fall back to sessionIndex-derived count below when a composite index is missing.
                }
            }
        }

        const userRef = doc(db, `users/${targetUserId}`)
        const snap = await getDocTracked(userRef)
        if (!snap.exists()) return null
        const data = snap.data() || {}
        const stats = data.stats || {}
        const sessionIndex = data.sessionIndex || {}

        const hasServerFilters = (filters.sessionTypes?.length || 0) > 0
            || !!filters.fromDateIso
            || !!filters.toDateIso
            || !!filters.track
            || !!filters.car
            || !!filters.hideEmpty
        if (!hasServerFilters) {
            return Number(stats.totalSessions ?? sessionIndex.totalSessions ?? null) || null
        }

        const list = Array.isArray(sessionIndex.sessionsList) ? sessionIndex.sessionsList : []
        const totalSessions = Number(sessionIndex.totalSessions ?? list.length)
        const listIsComplete = totalSessions <= list.length
        if (!listIsComplete) return null

        const pseudoSessions: SessionDocument[] = list.map((entry: any) => ({
            sessionId: entry.id,
            fileHash: '',
            fileName: '',
            uploadedAt: null,
            meta: {
                track: entry.track,
                car: entry.car,
                date_start: entry.date,
                date_end: null,
                session_type: entry.type,
                driver: null
            },
            summary: {
                laps: entry.laps || 0,
                lapsValid: entry.lapsValid || 0,
                bestLap: entry.bestLap || null,
                avgCleanLap: null,
                totalTime: entry.totalTime || 0,
                stintCount: entry.stintCount || 0
            },
            rawChunkCount: 0,
            rawSizeBytes: 0
        } as SessionDocument))

        return applyClientFilters(pseudoSessions, filters).length
    } catch {
        return null
    }
}

async function resolveCloudTotalsOnly(targetUserId: string, filters: SessionPagerFilters): Promise<number | null> {
    try {
        if (filters.track || filters.car) return null

        const sessionsRef = collection(db, `users/${targetUserId}/sessions`)
        const constraints: QueryConstraint[] = []
        const types = (filters.sessionTypes || []).filter((t) => Number.isFinite(t))

        if (types.length === 1) {
            constraints.push(where('meta.session_type', '==', types[0]!))
        } else if (types.length > 1 && types.length <= 10) {
            constraints.push(where('meta.session_type', 'in', types))
        }

        const fromIso = normalizeIso(filters.fromDateIso)
        const toIso = normalizeIso(filters.toDateIso)
        if (fromIso) constraints.push(where('meta.date_start', '>=', fromIso))
        if (toIso) constraints.push(where('meta.date_start', '<=', toIso))
        if (filters.hideEmpty) constraints.push(where('summary.laps', '>', 0))

        const countSnap = await getCountTracked(query(sessionsRef, ...constraints))
        return Number(countSnap.data().count || 0)
    } catch {
        return null
    }
}

async function queryCloudPage(
    targetUserId: string,
    pageSize: number,
    startCursor: QueryDocumentSnapshot<DocumentData> | null,
    filters: SessionPagerFilters
): Promise<{ sessions: SessionDocument[]; hasNext: boolean; lastDoc: QueryDocumentSnapshot<DocumentData> | null }> {
    const sessionsRef = collection(db, `users/${targetUserId}/sessions`)

    const baseConstraints: QueryConstraint[] = [orderBy('meta.date_start', 'desc')]
    const filteredConstraints: QueryConstraint[] = []

    const types = (filters.sessionTypes || []).filter((t) => Number.isFinite(t))
    if (types.length === 1) {
        filteredConstraints.push(where('meta.session_type', '==', types[0]!))
    } else if (types.length > 1 && types.length <= 10) {
        filteredConstraints.push(where('meta.session_type', 'in', types))
    }

    const fromIso = normalizeIso(filters.fromDateIso)
    const toIso = normalizeIso(filters.toDateIso)
    if (fromIso) filteredConstraints.push(where('meta.date_start', '>=', fromIso))
    if (toIso) filteredConstraints.push(where('meta.date_start', '<=', toIso))
    if (filters.hideEmpty) {
        filteredConstraints.push(where('summary.laps', '>', 0))
    }

    const visiblePairs: Array<{ docSnap: QueryDocumentSnapshot<DocumentData>; session: SessionDocument }> = []
    let cursor = startCursor
    let hasMoreRaw = true
    let useFallback = false
    let fallbackWarned = false

    while (visiblePairs.length < pageSize + 1 && hasMoreRaw) {
        const pageConstraints: QueryConstraint[] = [
            ...baseConstraints,
            ...(useFallback ? [] : filteredConstraints)
        ]
        if (cursor) pageConstraints.push(startAfter(cursor))
        pageConstraints.push(limit(pageSize + 1))

        let snapshot: any
        try {
            snapshot = await getDocsTracked(query(sessionsRef, ...pageConstraints))
        } catch (e) {
            const fallbackConstraints: QueryConstraint[] = [...baseConstraints]
            if (cursor) fallbackConstraints.push(startAfter(cursor))
            fallbackConstraints.push(limit(pageSize + 1))
            snapshot = await getDocsTracked(query(sessionsRef, ...fallbackConstraints))
            useFallback = true
            if (!fallbackWarned) {
                console.warn('[PAGER] Falling back to unfiltered query (missing index or unsupported filter combo).', e)
                fallbackWarned = true
            }
        }

        const docs = snapshot.docs || []
        if (docs.length === 0) {
            hasMoreRaw = false
            break
        }

        for (const docSnap of docs) {
            const session = normalizeCloudDoc(docSnap)
            if (!matchesClientFilters(session, filters)) continue
            visiblePairs.push({ docSnap, session })
            if (visiblePairs.length >= pageSize + 1) break
        }

        hasMoreRaw = docs.length > pageSize
        cursor = docs[docs.length - 1] || null
    }

    const hasNext = visiblePairs.length > pageSize
    const pagePairs = hasNext ? visiblePairs.slice(0, pageSize) : visiblePairs
    const lastDoc = pagePairs.length > 0 ? pagePairs[pagePairs.length - 1]!.docSnap : null
    return {
        sessions: pagePairs.map((pair) => pair.session),
        hasNext,
        lastDoc
    }
}

async function ensureCursorForPage(
    targetUserId: string,
    page: number,
    pageSize: number,
    filters: SessionPagerFilters
): Promise<number> {
    if (page <= 1) return 1
    let reachablePage = 1
    for (let p = 1; p < page; p++) {
        if (!globalCursorMap.has(p)) break
        reachablePage = p
        if (globalCursorMap.has(p + 1)) {
            reachablePage = p + 1
            continue
        }

        const startCursor = globalCursorMap.get(p) || null
        const result = await queryCloudPage(targetUserId, pageSize, startCursor, filters)
        globalPageCache.value[p] = result.sessions
        if (result.hasNext && result.lastDoc) {
            globalCursorMap.set(p + 1, result.lastDoc)
            reachablePage = p + 1
        } else {
            return p
        }
    }
    return Math.min(page, reachablePage)
}

async function loadCloudIdentitySet(targetUserId: string): Promise<{ ids: Set<string>; logicalKeys: Set<string> }> {
    const cached = globalCloudIdentityCache.get(targetUserId)
    if (cached && Date.now() - cached.cachedAt <= CLOUD_IDENTITY_CACHE_TTL_MS) {
        return {
            ids: cached.ids,
            logicalKeys: cached.logicalKeys
        }
    }

    const ids = new Set<string>()
    const logicalKeys = new Set<string>()

    try {
        const userRef = doc(db, `users/${targetUserId}`)
        const snap = await getDocTracked(userRef)
        if (snap.exists()) {
            const data = snap.data() || {}
            const list = Array.isArray(data.sessionIndex?.sessionsList) ? data.sessionIndex.sessionsList : []
            for (const entry of list) {
                if (entry?.id) ids.add(String(entry.id))
                const logicalKey = buildLogicalSessionKey({
                    date_start: entry?.date,
                    track: entry?.track
                })
                if (logicalKey) logicalKeys.add(logicalKey)
            }
        }
    } catch {
        // If the lightweight index is unavailable, keep the page resilient and
        // avoid falling back to one read per local session.
    }

    globalCloudIdentityCache.set(targetUserId, {
        cachedAt: Date.now(),
        ids,
        logicalKeys
    })

    return { ids, logicalKeys }
}

function countLocalOnlySessions(
    localSessions: SessionDocument[],
    cloudIdentities: { ids: Set<string>; logicalKeys: Set<string> }
): number {
    const checks = localSessions.map((session) => {
        if (session.syncState === 'synced') return false
        if (!session.sessionId) return true
        if (cloudIdentities.ids.has(session.sessionId)) return false
        const logicalKey = buildLogicalSessionKey(session.meta || {})
        if (logicalKey && cloudIdentities.logicalKeys.has(logicalKey)) return false
        return true
    })
    return checks.filter(Boolean).length
}

async function buildMergedOnlineOwnerPage(
    targetUserId: string,
    requestedPage: number,
    pageSize: number,
    filters: SessionPagerFilters,
    localSessions: SessionDocument[]
): Promise<{
    pageSessions: SessionDocument[]
    currentPage: number
    hasPrev: boolean
    hasNext: boolean
    totalItems: number | null
}> {
    const localFiltered = applyClientFilters(localSessions, filters)

    const [cloudTotal, cloudIdentities] = await Promise.all([
        resolveCloudTotalsOnly(targetUserId, filters),
        loadCloudIdentitySet(targetUserId)
    ])
    const localOnlyCount = countLocalOnlySessions(localFiltered, cloudIdentities)

    const mergedTotal = cloudTotal !== null ? cloudTotal + localOnlyCount : null
    const requestedSafePage = mergedTotal !== null
        ? Math.min(requestedPage, Math.max(1, Math.ceil(mergedTotal / pageSize)))
        : Math.max(1, requestedPage)
    const endExclusive = requestedSafePage * pageSize

    let accumulatedCloud: SessionDocument[] = []
    let startCursor: QueryDocumentSnapshot<DocumentData> | null = null
    let cloudHasNext = true
    let fetchedAtLeastOneCloudPage = false

    while (true) {
        if (!fetchedAtLeastOneCloudPage) {
            const cloudResult = await queryCloudPage(targetUserId, pageSize, startCursor, filters)
            accumulatedCloud = dedupeCloudSessions([...accumulatedCloud, ...cloudResult.sessions])
            startCursor = cloudResult.lastDoc
            cloudHasNext = cloudResult.hasNext
            fetchedAtLeastOneCloudPage = true
            continue
        }

        const mergedPreview = buildMergedSessionPage(localFiltered, accumulatedCloud, requestedSafePage, pageSize)
        if (mergedPreview.total > endExclusive || !cloudHasNext) {
            let finalPage = requestedSafePage
            let finalTotal = mergedTotal
            if (!cloudHasNext) {
                finalTotal = mergedPreview.total
                finalPage = Math.min(finalPage, Math.max(1, Math.ceil(finalTotal / pageSize)))
            }
            const finalMerged = buildMergedSessionPage(localFiltered, accumulatedCloud, finalPage, pageSize)
            const start = (finalMerged.safePage - 1) * pageSize
            const hasNext = finalTotal !== null
                ? start + pageSize < finalTotal
                : finalMerged.total > start + pageSize || cloudHasNext

            return {
                pageSessions: finalMerged.pageSlice,
                currentPage: finalMerged.safePage,
                hasPrev: finalMerged.safePage > 1,
                hasNext,
                totalItems: finalTotal
            }
        }

        const cloudResult = await queryCloudPage(targetUserId, pageSize, startCursor, filters)
        accumulatedCloud = dedupeCloudSessions([...accumulatedCloud, ...cloudResult.sessions])
        startCursor = cloudResult.lastDoc
        cloudHasNext = cloudResult.hasNext
    }
}

export function useSessionPager() {
    const { currentUser } = useFirebaseAuth()
    ensureInit()

    const isElectron = computed(() => {
        if (typeof window === 'undefined') return false
        return !!(window as any).electronAPI
    })

    async function loadPage(targetUserIdInput?: string, options: PageLoadOptions = {}): Promise<SessionDocument[]> {
        const targetUserId = targetUserIdInput || currentUser.value?.uid
        if (!targetUserId) return []

        const pageSize = options.pageSize || globalState.value.pageSize || DEFAULT_PAGE_SIZE
        const requestedPage = Math.max(1, Number(options.page || globalState.value.currentPage || 1))
        const filters = options.filters || globalFilters.value || {}
        const resetNeeded = !!options.reset
            || globalTargetUser.value !== targetUserId
            || globalState.value.pageSize !== pageSize
            || !sameFilters(filters, globalFilters.value)

        if (resetNeeded) {
            resetPager(pageSize, filters, targetUserId)
        }

        globalError.value = null
        globalState.value.loading = true

        try {
            const isOwner = targetUserId === currentUser.value?.uid
            const localSessions = (isElectron.value ? await getLocalSessionsForUser(targetUserId) : [])

            if (isOwner && isElectron.value && globalOnline.value) {
                const mergedResult = await buildMergedOnlineOwnerPage(
                    targetUserId,
                    requestedPage,
                    pageSize,
                    filters,
                    localSessions
                )

                globalSessions.value = mergedResult.pageSessions
                globalState.value.currentPage = mergedResult.currentPage
                globalState.value.hasPrev = mergedResult.hasPrev
                globalState.value.hasNext = mergedResult.hasNext
                globalState.value.totalItems = mergedResult.totalItems
                return globalSessions.value
            }

            if (isOwner && isElectron.value && !globalOnline.value) {
                const localAll = applyClientFilters(localSessions, filters)
                const total = localAll.length
                const safePage = Math.min(requestedPage, Math.max(1, Math.ceil(total / pageSize)))
                const start = (safePage - 1) * pageSize
                const pageSlice = localAll.slice(start, start + pageSize).map((session) => ({
                    ...session,
                    syncState: 'local_only' as SessionSyncState
                }))

                globalSessions.value = pageSlice
                globalState.value.currentPage = safePage
                globalState.value.hasPrev = safePage > 1
                globalState.value.hasNext = start + pageSize < total
                globalState.value.totalItems = total
                return globalSessions.value
            }

            const reachablePage = await ensureCursorForPage(targetUserId, requestedPage, pageSize, filters)
            const startCursor = globalCursorMap.get(reachablePage) || null
            const cloudResult = await queryCloudPage(targetUserId, pageSize, startCursor, filters)

            globalPageCache.value[reachablePage] = cloudResult.sessions
            if (cloudResult.hasNext && cloudResult.lastDoc) {
                globalCursorMap.set(reachablePage + 1, cloudResult.lastDoc)
            }

            let pageSessions = cloudResult.sessions
            if (isOwner && isElectron.value && reachablePage === 1) {
                pageSessions = mergePendingLocal(pageSessions, localSessions, true)
            }

            globalSessions.value = pageSessions
            globalState.value.currentPage = reachablePage
            globalState.value.hasPrev = reachablePage > 1
            globalState.value.hasNext = cloudResult.hasNext
            globalState.value.totalItems = await resolveTotals(targetUserId, filters)
            return globalSessions.value
        } catch (e: any) {
            globalError.value = e?.message || 'Errore caricamento sessioni paginato'
            console.error('[PAGER] loadPage error:', e)
            return []
        } finally {
            globalState.value.loading = false
        }
    }

    async function nextPage(targetUserIdInput?: string): Promise<SessionDocument[]> {
        if (!globalState.value.hasNext) return globalSessions.value
        return loadPage(targetUserIdInput, { page: globalState.value.currentPage + 1 })
    }

    async function prevPage(targetUserIdInput?: string): Promise<SessionDocument[]> {
        if (!globalState.value.hasPrev) return globalSessions.value
        return loadPage(targetUserIdInput, { page: globalState.value.currentPage - 1 })
    }

    return {
        sessions: globalSessions,
        state: computed(() => globalState.value),
        isOnline: computed(() => globalOnline.value),
        error: globalError,
        loadPage,
        nextPage,
        prevPage
    }
}
