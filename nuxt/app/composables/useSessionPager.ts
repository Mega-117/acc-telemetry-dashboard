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
import { trackedGetDoc, trackedGetDocs } from './useFirebaseTracker'
import { useFirebaseAuth } from './useFirebaseAuth'
import { db } from '~/config/firebase'
import { extractMetadata, generateSessionId } from '~/utils/sessionParser'
import type { SessionDocument } from './useTelemetryData'

const CALLER = 'SessionPager'
const DEFAULT_PAGE_SIZE = 25

type SessionSyncState = 'synced' | 'pending_sync' | 'local_only' | 'sync_failed'

export type SessionPagerFilters = {
    sessionTypes?: number[]
    fromDateIso?: string | null
    toDateIso?: string | null
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
const globalStartCursorByPage = ref<Record<number, QueryDocumentSnapshot<DocumentData> | null>>({ 1: null })
const globalPageCache = ref<Record<number, SessionDocument[]>>({})
const globalInitialized = ref(false)

async function getDocTracked(ref: any) { return trackedGetDoc(ref, CALLER) }
async function getDocsTracked(q: any) { return trackedGetDocs(q, CALLER) }

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

function applyClientFilters(list: SessionDocument[], filters: SessionPagerFilters): SessionDocument[] {
    const fromMs = normalizeIso(filters.fromDateIso) ? Date.parse(normalizeIso(filters.fromDateIso) as string) : null
    const toMs = normalizeIso(filters.toDateIso) ? Date.parse(normalizeIso(filters.toDateIso) as string) : null
    const types = (filters.sessionTypes || []).filter(t => Number.isFinite(t))

    return list.filter((session) => {
        const type = Number(session.meta?.session_type ?? -1)
        if (types.length > 0 && !types.includes(type)) return false

        const ms = sessionMs(session)
        if (fromMs !== null && ms < fromMs) return false
        if (toMs !== null && ms > toMs) return false
        return true
    })
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
    if (!electronAPI?.getTelemetryFiles || !electronAPI?.readFile) return []

    const files = await electronAPI.getTelemetryFiles()
    if (!Array.isArray(files) || files.length === 0) return []
    const registry = (await electronAPI.getRegistry?.()) || {}

    const sessions: SessionDocument[] = []
    for (const file of files) {
        try {
            const raw = await electronAPI.readFile(file.path)
            if (!raw) continue
            if (raw.ownerId && raw.ownerId !== currentUid) continue

            const { meta, summary } = extractMetadata(raw)
            const sessionId = generateSessionId(meta.date_start, meta.track)
            const reg = registry[file.name]
            const isSynced = !!(
                reg
                && reg.uploadedBy === currentUid
                && reg.sessionId === sessionId
            )
            sessions.push({
                sessionId,
                fileHash: '',
                fileName: file.name,
                uploadedAt: null,
                meta,
                summary,
                rawChunkCount: 0,
                rawSizeBytes: 0,
                source: 'local',
                syncState: isSynced ? 'synced' : (globalOnline.value ? 'pending_sync' : 'local_only')
            } as SessionDocument)
        } catch {
            // Keep pager resilient on malformed files.
        }
    }

    sessions.sort((a, b) => (b.meta?.date_start || '').localeCompare(a.meta?.date_start || ''))
    return sessions
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
    globalStartCursorByPage.value = { 1: null }
    globalPageCache.value = {}
}

async function resolveTotals(targetUserId: string, filters: SessionPagerFilters): Promise<number | null> {
    try {
        const userRef = doc(db, `users/${targetUserId}`)
        const snap = await getDocTracked(userRef)
        if (!snap.exists()) return null
        const data = snap.data() || {}
        const stats = data.stats || {}
        const sessionIndex = data.sessionIndex || {}

        const hasServerFilters = (filters.sessionTypes?.length || 0) > 0 || !!filters.fromDateIso || !!filters.toDateIso
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

async function queryCloudPage(
    targetUserId: string,
    pageSize: number,
    startCursor: QueryDocumentSnapshot<DocumentData> | null,
    filters: SessionPagerFilters
): Promise<{ sessions: SessionDocument[]; hasNext: boolean; lastDoc: QueryDocumentSnapshot<DocumentData> | null }> {
    const sessionsRef = collection(db, `users/${targetUserId}/sessions`)

    const baseConstraints: QueryConstraint[] = [orderBy('meta.date_start', 'desc')]
    const filteredConstraints: QueryConstraint[] = []

    const types = (filters.sessionTypes || []).filter(t => Number.isFinite(t))
    if (types.length === 1) {
        filteredConstraints.push(where('meta.session_type', '==', types[0]))
    } else if (types.length > 1 && types.length <= 10) {
        filteredConstraints.push(where('meta.session_type', 'in', types))
    }

    const fromIso = normalizeIso(filters.fromDateIso)
    const toIso = normalizeIso(filters.toDateIso)
    if (fromIso) filteredConstraints.push(where('meta.date_start', '>=', fromIso))
    if (toIso) filteredConstraints.push(where('meta.date_start', '<=', toIso))

    const pageConstraints: QueryConstraint[] = [...baseConstraints, ...filteredConstraints]
    if (startCursor) pageConstraints.push(startAfter(startCursor))
    pageConstraints.push(limit(pageSize + 1))

    let snapshot: any
    try {
        snapshot = await getDocsTracked(query(sessionsRef, ...pageConstraints))
    } catch (e) {
        // Fallback path: avoid hard failure if a composite index is missing.
        const fallbackConstraints: QueryConstraint[] = [...baseConstraints]
        if (startCursor) fallbackConstraints.push(startAfter(startCursor))
        fallbackConstraints.push(limit(pageSize + 1))
        snapshot = await getDocsTracked(query(sessionsRef, ...fallbackConstraints))
        console.warn('[PAGER] Falling back to unfiltered query (missing index or unsupported filter combo).', e)
    }

    const docs = snapshot.docs || []
    const hasNext = docs.length > pageSize
    const pageDocs = hasNext ? docs.slice(0, pageSize) : docs
    const lastDoc = pageDocs.length > 0 ? pageDocs[pageDocs.length - 1] : null

    const sessions = pageDocs.map((docSnap: QueryDocumentSnapshot<DocumentData>) => normalizeCloudDoc(docSnap))
    const finalSessions = applyClientFilters(sessions, filters).sort((a, b) => (b.meta.date_start || '').localeCompare(a.meta.date_start || ''))
    return { sessions: finalSessions, hasNext, lastDoc }
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
        if (!(p in globalStartCursorByPage.value)) break
        reachablePage = p
        if (globalStartCursorByPage.value[p + 1] !== undefined) continue

        const startCursor = globalStartCursorByPage.value[p] || null
        const result = await queryCloudPage(targetUserId, pageSize, startCursor, filters)
        globalPageCache.value[p] = result.sessions
        if (result.hasNext && result.lastDoc) {
            globalStartCursorByPage.value[p + 1] = result.lastDoc
            reachablePage = p + 1
        } else {
            return p
        }
    }
    return Math.min(page, reachablePage)
}

function mergePendingLocal(cloudPage: SessionDocument[], localSessions: SessionDocument[], includeLocal: boolean): SessionDocument[] {
    if (!includeLocal) return cloudPage
    const cloudIds = new Set(cloudPage.map(s => s.sessionId))
    const pending = localSessions.filter(local =>
        local.syncState !== 'synced' && !cloudIds.has(local.sessionId)
    )
    const merged = [...pending, ...cloudPage]
    merged.sort((a, b) => (b.meta.date_start || '').localeCompare(a.meta.date_start || ''))
    return merged
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

            // Offline owner flow: local cache only (still paginated).
            if (isOwner && isElectron.value && !globalOnline.value) {
                const localAll = applyClientFilters(await getLocalSessionsForUser(targetUserId), filters)
                const total = localAll.length
                const safePage = Math.min(requestedPage, Math.max(1, Math.ceil(total / pageSize)))
                const start = (safePage - 1) * pageSize
                const pageSlice = localAll.slice(start, start + pageSize).map(s => ({
                    ...s,
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
            const startCursor = globalStartCursorByPage.value[reachablePage] || null
            const cloudResult = await queryCloudPage(targetUserId, pageSize, startCursor, filters)

            globalPageCache.value[reachablePage] = cloudResult.sessions
            if (cloudResult.hasNext && cloudResult.lastDoc) {
                globalStartCursorByPage.value[reachablePage + 1] = cloudResult.lastDoc
            } else if (globalStartCursorByPage.value[reachablePage + 1] === undefined) {
                globalStartCursorByPage.value[reachablePage + 1] = null
            }

            let pageSessions = cloudResult.sessions
            if (isOwner && isElectron.value && reachablePage === 1) {
                const localSessions = await getLocalSessionsForUser(targetUserId)
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
