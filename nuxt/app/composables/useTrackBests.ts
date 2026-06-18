// @description Calcola, memorizza nella cache e invalida i best times per tracciato, organizzati per categoria vettura e condizione di grip, con prefetch batch da Firebase.

import { ref, computed } from 'vue'
import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import { collection, query, doc, type DocumentReference, type Query } from 'firebase/firestore'
import { trackedGetDoc, trackedGetDocs, trackedSetDoc, trackedDeleteDoc, trackedWriteBatch } from './useFirebaseTracker'
import { db } from '~/config/firebase'
import {
    CAR_CATEGORIES,
    type CarCategory,
    formatDriveTime,
    getCarCategory,
} from '~/utils/telemetryFormat'
import {
    type GripBestTimes,
    createGetTheoreticalTimes,
} from '~/services/telemetry/theoreticalTimesCalculator'
import { RACE_FUEL_BUCKETS, getRaceFuelBucket } from '~/services/telemetry/raceFuelClassification'
import { TRACK_BESTS_SCHEMA_VERSION } from '~/services/sync/trackBestsProjectionService'
import { getTrackActivityTotalsFromSessions } from '~/services/telemetry/activityProjectionService'
import { globalSessions } from '~/composables/useSessionLoader'
import type { SessionDocument } from '~/composables/useSessionLoader'

const CALLER = 'TrackBests'
async function getDoc(ref: DocumentReference) { return trackedGetDoc(ref, CALLER) }
async function getDocs(q: Query) { return trackedGetDocs(q, CALLER) }

// Keys for sessionStorage cache
const CACHE_KEY_TRACK_BESTS = 'acc_trackBests_cache'
const CACHE_KEY_TRACK_ACTIVITY = 'acc_trackActivity_cache'

function saveCacheToStorage(key: string, data: any, userId: string): void {
    if (typeof window === 'undefined') return
    try {
        const payload = { userId, data, timestamp: Date.now() }
        sessionStorage.setItem(key, JSON.stringify(payload))
        console.log(`[CACHE] 💾 Saved ${key} to sessionStorage`)
    } catch (e) {
        console.warn('[CACHE] Failed to save to sessionStorage:', e)
    }
}

function loadCacheFromStorage(key: string, userId: string): any | null {
    if (typeof window === 'undefined') return null
    try {
        const stored = sessionStorage.getItem(key)
        if (!stored) return null
        const { userId: storedUserId, data, timestamp } = JSON.parse(stored)
        if (storedUserId !== userId) {
            sessionStorage.removeItem(key)
            return null
        }
        const maxAge = 3600000
        if (Date.now() - timestamp > maxAge) {
            sessionStorage.removeItem(key)
            return null
        }
        console.log(`[CACHE] ✅ Loaded ${key} from sessionStorage (age: ${Math.round((Date.now() - timestamp) / 1000)}s)`)
        return data
    } catch (e) {
        console.warn('[CACHE] Failed to load from sessionStorage:', e)
        return null
    }
}

// Type for category-organized bests
export type CategoryBests = Record<CarCategory, Record<string, GripBestTimes>>

export type TrackActivity = {
    totalLaps: number
    validLaps: number
    validPercent: number
    totalTimeMs: number
    totalTimeFormatted: string
    sessionCount: number
    lastSessionDate?: string
}

// Global prefetch state
export const globalPrefetchComplete = ref(false)
const trackBestsPrefetchInFlight = new Map<string, Promise<number>>()

// In-memory caches (module-level singleton)
const trackBestsCache = ref<Record<string, { bests: CategoryBests; lastSessionDate: string | null }>>({})
const trackActivityCache = ref<Record<string, TrackActivity>>({})

const emptyGripBests = (): GripBestTimes => ({
    bestQualy: null, bestQualyTemp: null, bestQualyFuel: null, bestQualySessionId: null, bestQualyDate: null,
    bestRaceSprint: null, bestRaceSprintTemp: null, bestRaceSprintFuel: null, bestRaceSprintSessionId: null, bestRaceSprintDate: null,
    bestAvgSprint: null, bestAvgSprintTemp: null, bestAvgSprintFuel: null, bestAvgSprintSessionId: null, bestAvgSprintDate: null,
    bestRaceEndurance: null, bestRaceEnduranceTemp: null, bestRaceEnduranceFuel: null, bestRaceEnduranceSessionId: null, bestRaceEnduranceDate: null,
    bestAvgEndurance: null, bestAvgEnduranceTemp: null, bestAvgEnduranceFuel: null, bestAvgEnduranceSessionId: null, bestAvgEnduranceDate: null,
    bestRace: null, bestRaceTemp: null, bestRaceFuel: null, bestRaceSessionId: null, bestRaceDate: null,
    bestAvgRace: null, bestAvgRaceTemp: null, bestAvgRaceFuel: null, bestAvgRaceSessionId: null, bestAvgRaceDate: null,
    raceBestByFuelBucket: Object.fromEntries(RACE_FUEL_BUCKETS.map((bucket) => [bucket, {}])),
    raceAvgByFuelBucket: Object.fromEntries(RACE_FUEL_BUCKETS.map((bucket) => [bucket, {}]))
})

export function useTrackBests() {
    const { currentUser } = useFirebaseAuth()
    const sessions = globalSessions

    const isElectron = computed(() => {
        if (typeof window === 'undefined') return false
        return !!(window as any).electronAPI
    })

    async function calculateAllBestTimesForTrack(
        trackId: string,
        userId?: string
    ): Promise<{ bests: CategoryBests; lastSessionDate: string | null }> {
        const trackIdNorm = trackId.toLowerCase().replace(/[^a-z0-9]/g, '_')
        const gripConditions = ['Flood', 'Wet', 'Damp', 'Greasy', 'Green', 'Fast', 'Optimum']

        const categoryBests: CategoryBests = {} as CategoryBests
        for (const cat of CAR_CATEGORIES) {
            categoryBests[cat] = {}
            for (const grip of gripConditions) {
                categoryBests[cat][grip] = emptyGripBests()
            }
        }

        const trackSessionsList = sessions.value.filter((s: SessionDocument) => {
            const sessionTrackId = s.meta.track.toLowerCase().replace(/[^a-z0-9]/g, '_')
            return sessionTrackId.includes(trackIdNorm) || trackIdNorm.includes(sessionTrackId)
        })

        if (trackSessionsList.length === 0) {
            return { bests: categoryBests, lastSessionDate: null }
        }

        let lastSessionDate: string | null = null

        for (const session of trackSessionsList) {
            const sessionDate = session.meta.date_start || null
            const bestByGrip = session.summary?.best_by_grip

            if (sessionDate && (!lastSessionDate || sessionDate > lastSessionDate)) {
                lastSessionDate = sessionDate
            }

            if (!bestByGrip) continue

            const category = getCarCategory(session.meta.car)

            for (const grip of gripConditions) {
                const sessionBest = bestByGrip[grip]
                if (!sessionBest) continue

                const currentBest = categoryBests[category][grip]
                if (!currentBest) continue

                // Best Qualy
                if (sessionBest.bestQualy && (!currentBest.bestQualy || sessionBest.bestQualy < currentBest.bestQualy)) {
                    currentBest.bestQualy = sessionBest.bestQualy
                    currentBest.bestQualyTemp = sessionBest.bestQualyTemp
                    currentBest.bestQualyFuel = sessionBest.bestQualyFuel ?? null
                    currentBest.bestQualySessionId = session.sessionId
                    currentBest.bestQualyDate = sessionDate
                }

                for (const bucket of RACE_FUEL_BUCKETS) {
                    const raceRecord = sessionBest.raceBestByFuelBucket?.[bucket]
                    if (raceRecord?.timeMs && (!currentBest.bestRace || raceRecord.timeMs < currentBest.bestRace)) {
                        currentBest.bestRace = raceRecord.timeMs
                        currentBest.bestRaceTemp = raceRecord.airTemp ?? null
                        currentBest.bestRaceFuel = raceRecord.fuel ?? null
                        currentBest.bestRaceSessionId = raceRecord.sessionId || session.sessionId
                        currentBest.bestRaceDate = raceRecord.date || sessionDate
                        currentBest.raceBestByFuelBucket![bucket] = raceRecord
                    }

                    const avgRecord = sessionBest.raceAvgByFuelBucket?.[bucket]
                    if (avgRecord?.timeMs && (!currentBest.bestAvgRace || avgRecord.timeMs < currentBest.bestAvgRace)) {
                        currentBest.bestAvgRace = avgRecord.timeMs
                        currentBest.bestAvgRaceTemp = avgRecord.airTemp ?? null
                        currentBest.bestAvgRaceFuel = avgRecord.fuel ?? null
                        currentBest.bestAvgRaceSessionId = avgRecord.sessionId || session.sessionId
                        currentBest.bestAvgRaceDate = avgRecord.date || sessionDate
                        currentBest.raceAvgByFuelBucket![bucket] = avgRecord
                    }
                }

                // Best Race Sprint
                const sprintTime = sessionBest.bestRaceSprint || (sessionBest.bestRace && getRaceFuelBucket(sessionBest.bestRaceFuel) && sessionBest.bestRaceFuel <= 80 ? sessionBest.bestRace : null)
                if (sprintTime && (!currentBest.bestRaceSprint || sprintTime < currentBest.bestRaceSprint)) {
                    currentBest.bestRaceSprint = sprintTime
                    currentBest.bestRaceSprintTemp = sessionBest.bestRaceSprintTemp || sessionBest.bestRaceTemp
                    currentBest.bestRaceSprintFuel = sessionBest.bestRaceSprintFuel ?? sessionBest.bestRaceFuel ?? null
                    currentBest.bestRaceSprintSessionId = session.sessionId
                    currentBest.bestRaceSprintDate = sessionDate
                }

                // Best Race Endurance
                const enduranceTime = sessionBest.bestRaceEndurance || (sessionBest.bestRace && sessionBest.bestRaceFuel && sessionBest.bestRaceFuel > 80 ? sessionBest.bestRace : null)
                if (enduranceTime && (!currentBest.bestRaceEndurance || enduranceTime < currentBest.bestRaceEndurance)) {
                    currentBest.bestRaceEndurance = enduranceTime
                    currentBest.bestRaceEnduranceTemp = sessionBest.bestRaceEnduranceTemp || sessionBest.bestRaceTemp
                    currentBest.bestRaceEnduranceFuel = sessionBest.bestRaceEnduranceFuel ?? sessionBest.bestRaceFuel ?? null
                    currentBest.bestRaceEnduranceSessionId = session.sessionId
                    currentBest.bestRaceEnduranceDate = sessionDate
                }

                // Best Avg Sprint
                const avgSprintTime = sessionBest.bestAvgSprint || (sessionBest.bestAvgRace && getRaceFuelBucket(sessionBest.bestAvgRaceFuel) && sessionBest.bestAvgRaceFuel <= 80 ? sessionBest.bestAvgRace : null)
                if (avgSprintTime && (!currentBest.bestAvgSprint || avgSprintTime < currentBest.bestAvgSprint)) {
                    currentBest.bestAvgSprint = avgSprintTime
                    currentBest.bestAvgSprintTemp = sessionBest.bestAvgSprintTemp || sessionBest.bestAvgRaceTemp
                    currentBest.bestAvgSprintFuel = sessionBest.bestAvgSprintFuel ?? sessionBest.bestAvgRaceFuel ?? null
                    currentBest.bestAvgSprintSessionId = session.sessionId
                    currentBest.bestAvgSprintDate = sessionDate
                }

                // Best Avg Endurance
                const avgEnduranceTime = sessionBest.bestAvgEndurance || (sessionBest.bestAvgRace && sessionBest.bestAvgRaceFuel && sessionBest.bestAvgRaceFuel > 80 ? sessionBest.bestAvgRace : null)
                if (avgEnduranceTime && (!currentBest.bestAvgEndurance || avgEnduranceTime < currentBest.bestAvgEndurance)) {
                    currentBest.bestAvgEndurance = avgEnduranceTime
                    currentBest.bestAvgEnduranceTemp = sessionBest.bestAvgEnduranceTemp || sessionBest.bestAvgRaceTemp
                    currentBest.bestAvgEnduranceFuel = sessionBest.bestAvgEnduranceFuel ?? sessionBest.bestAvgRaceFuel ?? null
                    currentBest.bestAvgEnduranceSessionId = session.sessionId
                    currentBest.bestAvgEnduranceDate = sessionDate
                }

                // Backward compat: compute bestRace as min(sprint, endurance)
                const bestRaceVal = currentBest.bestRaceSprint && currentBest.bestRaceEndurance
                    ? Math.min(currentBest.bestRaceSprint, currentBest.bestRaceEndurance)
                    : currentBest.bestRaceSprint || currentBest.bestRaceEndurance
                if (bestRaceVal) {
                    const isSprintBetter = currentBest.bestRaceSprint === bestRaceVal
                    currentBest.bestRace = bestRaceVal
                    currentBest.bestRaceTemp = isSprintBetter ? currentBest.bestRaceSprintTemp : currentBest.bestRaceEnduranceTemp
                    currentBest.bestRaceFuel = isSprintBetter ? currentBest.bestRaceSprintFuel : currentBest.bestRaceEnduranceFuel
                    currentBest.bestRaceSessionId = isSprintBetter ? currentBest.bestRaceSprintSessionId : currentBest.bestRaceEnduranceSessionId
                    currentBest.bestRaceDate = isSprintBetter ? currentBest.bestRaceSprintDate : currentBest.bestRaceEnduranceDate
                }

                const bestAvgVal = currentBest.bestAvgSprint && currentBest.bestAvgEndurance
                    ? Math.min(currentBest.bestAvgSprint, currentBest.bestAvgEndurance)
                    : currentBest.bestAvgSprint || currentBest.bestAvgEndurance
                if (bestAvgVal) {
                    const isSprintBetter = currentBest.bestAvgSprint === bestAvgVal
                    currentBest.bestAvgRace = bestAvgVal
                    currentBest.bestAvgRaceTemp = isSprintBetter ? currentBest.bestAvgSprintTemp : currentBest.bestAvgEnduranceTemp
                    currentBest.bestAvgRaceFuel = isSprintBetter ? currentBest.bestAvgSprintFuel : currentBest.bestAvgEnduranceFuel
                    currentBest.bestAvgRaceSessionId = isSprintBetter ? currentBest.bestAvgSprintSessionId : currentBest.bestAvgEnduranceSessionId
                    currentBest.bestAvgRaceDate = isSprintBetter ? currentBest.bestAvgSprintDate : currentBest.bestAvgEnduranceDate
                }
            }
        }

        console.log(`[TRACK_BESTS] ⚡ Calculated V2 for ${trackIdNorm} from ${trackSessionsList.length} sessions (0 extra queries)`)
        return { bests: categoryBests, lastSessionDate }
    }

    async function getBestTimesForGrip(
        trackId: string,
        grip: string = 'Optimum',
        category: CarCategory = 'GT3',
        userId?: string
    ): Promise<GripBestTimes> {
        const allBests = await getTrackBests(trackId, category, userId)
        return allBests[grip] || emptyGripBests()
    }

    async function getTrackBests(
        trackId: string,
        category: CarCategory = 'GT3',
        userId?: string
    ): Promise<Record<string, GripBestTimes>> {
        const targetUserId = userId || currentUser.value?.uid
        const trackIdNorm = trackId.toLowerCase().replace(/[^a-z0-9]/g, '_')
        const cacheKey = `${trackIdNorm}_${targetUserId || 'anon'}`

        if (trackBestsCache.value[cacheKey]) {
            console.log(`[TRACK_BESTS] cache HIT for ${trackIdNorm} (category: ${category})`)
            const cached = trackBestsCache.value[cacheKey]
            return cached.bests[category] || {}
        }

        const prefetchInFlight = targetUserId ? trackBestsPrefetchInFlight.get(targetUserId) : null
        if (prefetchInFlight) {
            console.log(`[TRACK_BESTS] waiting for batch prefetch (${trackIdNorm})`)
            await prefetchInFlight.catch(() => 0)
            const cachedAfterPrefetch = (
                trackBestsCache.value as Record<string, { bests: CategoryBests; lastSessionDate: string | null } | undefined>
            )[cacheKey]
            if (cachedAfterPrefetch) {
                return cachedAfterPrefetch.bests[category] || {}
            }
        }

        if (targetUserId) {
            try {
                const docRef = doc(db, `users/${targetUserId}/trackBests/${trackIdNorm}`)
                const docSnap = await getDoc(docRef)

                if (docSnap.exists()) {
                    const data = docSnap.data()
                    const version = data.version || 1

                    if (version >= TRACK_BESTS_SCHEMA_VERSION && data.bests) {
                        console.log(`[TRACK_BESTS] Firebase HIT V2 for ${trackIdNorm}`)
                        const isV2Structure = CAR_CATEGORIES.some(cat => data.bests[cat])
                        if (isV2Structure) {
                            const cached = {
                                bests: data.bests as CategoryBests,
                                lastSessionDate: data.lastSessionDate || null
                            }
                            trackBestsCache.value[cacheKey] = cached
                            return cached.bests[category] || {}
                        }
                    }

                    console.log(`[TRACK_BESTS] V1 detected for ${trackIdNorm}, migrating to V2...`)
                }
            } catch (e) {
                console.warn(`[TRACK_BESTS] Error reading from Firebase:`, e)
            }
        }

        console.log(`[TRACK_BESTS] calculating V2 for ${trackIdNorm}...`)
        const calculated = await calculateAllBestTimesForTrack(trackId, userId)

        if (targetUserId && !isElectron.value) {
            try {
                const docRef = doc(db, `users/${targetUserId}/trackBests/${trackIdNorm}`)
                await trackedSetDoc(docRef, {
                    version: TRACK_BESTS_SCHEMA_VERSION,
                    trackId: trackIdNorm,
                    bests: calculated.bests,
                    lastSessionDate: calculated.lastSessionDate,
                    lastUpdated: new Date().toISOString()
                }, CALLER)
                console.log(`[TRACK_BESTS] V2 SAVED to Firebase for ${trackIdNorm}`)
            } catch (e) {
                console.warn(`[TRACK_BESTS] Error saving to Firebase:`, e)
            }
        }

        trackBestsCache.value[cacheKey] = calculated
        return calculated.bests[category] || {}
    }

    async function invalidateTrackBests(trackId: string, userId?: string, clearFirebase: boolean = false) {
        const trackIdNorm = trackId.toLowerCase().replace(/[^a-z0-9]/g, '_')
        const targetUserId = userId || currentUser.value?.uid
        const cacheKey = `${trackIdNorm}_${targetUserId || 'anon'}`

        delete trackBestsCache.value[cacheKey]
        console.log(`[TRACK_BESTS] cache INVALIDATED for ${trackIdNorm}`)

        if (clearFirebase && targetUserId && !isElectron.value) {
            try {
                const docRef = doc(db, `users/${targetUserId}/trackBests/${trackIdNorm}`)
                await trackedDeleteDoc(docRef, CALLER)
                console.log(`[TRACK_BESTS] DELETED from Firebase for ${trackIdNorm}`)
            } catch (e) {
                console.warn(`[TRACK_BESTS] Error deleting from Firebase:`, e)
            }
        }
    }

    function clearTrackDerivedCaches() {
        trackBestsCache.value = {}
        trackActivityCache.value = {}
        try {
            sessionStorage.removeItem(CACHE_KEY_TRACK_BESTS)
            sessionStorage.removeItem(CACHE_KEY_TRACK_ACTIVITY)
        } catch {
            // Ignore storage errors in constrained environments.
        }
        console.log('[TRACK_BESTS] Cleared overview caches (trackBests + trackActivity)')
    }

    async function forceRecalculateTrackBests(
        trackId: string,
        category: CarCategory = 'GT3',
        userId?: string
    ): Promise<Record<string, GripBestTimes>> {
        console.log(`[TRACK_BESTS] FORCE RECALCULATING for ${trackId} (category: ${category})`)
        await invalidateTrackBests(trackId, userId, true)
        return await getTrackBests(trackId, category, userId)
    }

    async function resetAllTrackBests(userId?: string): Promise<number> {
        const targetUserId = userId || currentUser.value?.uid
        if (!targetUserId) {
            console.warn('[TRACK_BESTS] No user ID, cannot reset trackBests')
            return 0
        }

        console.log(`[TRACK_BESTS] 🗑️ Resetting ALL trackBests for user ${targetUserId}...`)

        try {
            const trackBestsRef = collection(db, `users/${targetUserId}/trackBests`)
            const snapshot = await getDocs(query(trackBestsRef))

            if (snapshot.empty) {
                console.log('[TRACK_BESTS] No trackBests found to delete')
                trackBestsCache.value = {}
                return 0
            }

            const batch = trackedWriteBatch(db, CALLER)
            snapshot.docs.forEach(docSnap => {
                batch.delete(docSnap.ref)
            })
            await batch.commit()

            const count = snapshot.size
            console.log(`[TRACK_BESTS] ✅ Deleted ${count} trackBests documents from Firebase`)

            trackBestsCache.value = {}
            trackActivityCache.value = {}

            try {
                sessionStorage.removeItem('acc_trackBests_cache')
                sessionStorage.removeItem('acc_trackActivity_cache')
            } catch (e) {
                // Ignore storage errors
            }

            return count
        } catch (e) {
            console.error('[TRACK_BESTS] Error resetting trackBests:', e)
            throw e
        }
    }

    async function prefetchAllTrackBests(userId?: string): Promise<number> {
        const targetUserId = userId || currentUser.value?.uid
        if (!targetUserId) {
            console.warn('[PREFETCH] No user ID, skipping prefetch')
            return 0
        }

        const storedBests = loadCacheFromStorage(CACHE_KEY_TRACK_BESTS, targetUserId)
        const storedActivity = loadCacheFromStorage(CACHE_KEY_TRACK_ACTIVITY, targetUserId)

        if (storedBests && Object.keys(storedBests).length > 0) {
            console.log(`[PREFETCH] ⚡ Using sessionStorage cache: ${Object.keys(storedBests).length} trackBests`)
            Object.assign(trackBestsCache.value, storedBests)
            if (storedActivity) {
                Object.assign(trackActivityCache.value, storedActivity)
            }
            globalPrefetchComplete.value = true
            return Object.keys(storedBests).length
        }

        const existingPrefetch = trackBestsPrefetchInFlight.get(targetUserId)
        if (existingPrefetch) {
            console.log(`[PREFETCH] Reusing in-flight trackBests prefetch for user ${targetUserId}`)
            return existingPrefetch
        }

        const prefetchRequest = (async (): Promise<number> => {
            console.log(`[PREFETCH] 🚀 Starting batch prefetch for user ${targetUserId}`)
            const startTime = Date.now()

            try {
                const trackBestsRef = collection(db, `users/${targetUserId}/trackBests`)
                const snapshot = await getDocs(query(trackBestsRef))

                let loadedCount = 0
                const standardGrips = ['Flood', 'Wet', 'Damp', 'Greasy', 'Green', 'Fast', 'Optimum']

                snapshot.forEach(docSnap => {
                    const trackIdNorm = docSnap.id
                    const data = docSnap.data()
                    const cacheKey = `${trackIdNorm}_${targetUserId}`
                    const version = data.version || 1

                    if (version >= TRACK_BESTS_SCHEMA_VERSION && data.bests) {
                        const isV2Structure = CAR_CATEGORIES.some(cat => data.bests[cat])
                        if (isV2Structure) {
                            trackBestsCache.value[cacheKey] = {
                                bests: data.bests as CategoryBests,
                                lastSessionDate: data.lastSessionDate || null
                            }
                            loadedCount++

                            if (data.activity) {
                                const activity = data.activity
                                trackActivityCache.value[cacheKey] = {
                                    totalLaps: activity.totalLaps || 0,
                                    validLaps: activity.validLaps || 0,
                                    validPercent: activity.totalLaps > 0
                                        ? Math.round((activity.validLaps / activity.totalLaps) * 100)
                                        : 0,
                                    totalTimeMs: activity.totalTimeMs || 0,
                                    totalTimeFormatted: formatDriveTime(activity.totalTimeMs || 0),
                                    sessionCount: activity.sessionCount || 0,
                                    lastSessionDate: activity.lastSessionDate
                                }
                            }
                            return
                        }
                    }

                    // V1 legacy: Convert grip-level structure to V2 category structure
                    const result: Record<string, GripBestTimes> = {}
                    const bestsSource = data.bests || data

                    for (const grip of standardGrips) {
                        if (bestsSource[grip]) {
                            result[grip] = bestsSource[grip] as GripBestTimes
                        }
                    }

                    // Handle legacy 'Opt' -> merge into 'Optimum'
                    if (bestsSource['Opt']) {
                        const legacyOpt = bestsSource['Opt'] as GripBestTimes
                        if (!result['Optimum']) {
                            result['Optimum'] = legacyOpt
                        } else {
                            const opt = result['Optimum']
                            if (legacyOpt.bestQualy && (!opt.bestQualy || legacyOpt.bestQualy < opt.bestQualy)) {
                                opt.bestQualy = legacyOpt.bestQualy
                                opt.bestQualyTemp = legacyOpt.bestQualyTemp
                                opt.bestQualySessionId = legacyOpt.bestQualySessionId
                                opt.bestQualyDate = legacyOpt.bestQualyDate
                            }
                            if (legacyOpt.bestRace && (!opt.bestRace || legacyOpt.bestRace < opt.bestRace)) {
                                opt.bestRace = legacyOpt.bestRace
                                opt.bestRaceTemp = legacyOpt.bestRaceTemp
                                opt.bestRaceSessionId = legacyOpt.bestRaceSessionId
                                opt.bestRaceDate = legacyOpt.bestRaceDate
                            }
                            if (legacyOpt.bestAvgRace && (!opt.bestAvgRace || legacyOpt.bestAvgRace < opt.bestAvgRace)) {
                                opt.bestAvgRace = legacyOpt.bestAvgRace
                                opt.bestAvgRaceTemp = legacyOpt.bestAvgRaceTemp
                                opt.bestAvgRaceSessionId = legacyOpt.bestAvgRaceSessionId
                                opt.bestAvgRaceDate = legacyOpt.bestAvgRaceDate
                            }
                        }
                    }

                    // Convert V1 to V2 (all legacy data defaults to GT3)
                    const v2Bests: CategoryBests = {} as CategoryBests
                    for (const cat of CAR_CATEGORIES) {
                        v2Bests[cat] = {}
                        for (const grip of standardGrips) {
                            v2Bests[cat][grip] = cat === 'GT3' && result[grip] ? result[grip] : emptyGripBests()
                        }
                    }

                    trackBestsCache.value[cacheKey] = {
                        bests: v2Bests,
                        lastSessionDate: data.lastSessionDate || null
                    }

                    if (data.activity) {
                        const activity = data.activity
                        trackActivityCache.value[cacheKey] = {
                            totalLaps: activity.totalLaps || 0,
                            validLaps: activity.validLaps || 0,
                            validPercent: activity.totalLaps > 0
                                ? Math.round((activity.validLaps / activity.totalLaps) * 100)
                                : 0,
                            totalTimeMs: activity.totalTimeMs || 0,
                            totalTimeFormatted: formatDriveTime(activity.totalTimeMs || 0),
                            sessionCount: activity.sessionCount || 0,
                            lastSessionDate: activity.lastSessionDate
                        }
                    }

                    loadedCount++
                })

                const elapsed = Date.now() - startTime
                console.log(`[PREFETCH] ✅ Loaded ${loadedCount} trackBests in ${elapsed}ms (1 query instead of ${loadedCount})`)

                saveCacheToStorage(CACHE_KEY_TRACK_BESTS, trackBestsCache.value, targetUserId)
                saveCacheToStorage(CACHE_KEY_TRACK_ACTIVITY, trackActivityCache.value, targetUserId)

                globalPrefetchComplete.value = true
                return loadedCount

            } catch (e) {
                console.error('[PREFETCH] Error during batch prefetch:', e)
                globalPrefetchComplete.value = true
                return 0
            }
        })()

        trackBestsPrefetchInFlight.set(targetUserId, prefetchRequest)
        try {
            return await prefetchRequest
        } finally {
            trackBestsPrefetchInFlight.delete(targetUserId)
        }
    }

    async function getTrackActivity(trackId: string, userId?: string): Promise<TrackActivity> {
        const trackIdNorm = trackId.toLowerCase().replace(/[^a-z0-9]/g, '_')
        const targetUserId = userId || currentUser.value?.uid
        const cacheKey = `${trackIdNorm}_${targetUserId || 'anon'}`

        if (trackActivityCache.value[cacheKey]) {
            return trackActivityCache.value[cacheKey]
        }

        if (targetUserId && !isElectron.value) {
            try {
                const docRef = doc(db, `users/${targetUserId}/trackBests/${trackIdNorm}`)
                const docSnap = await getDoc(docRef)

                if (docSnap.exists()) {
                    const data = docSnap.data()
                    if (data.activity) {
                        const activity = data.activity
                        const result: TrackActivity = {
                            totalLaps: activity.totalLaps || 0,
                            validLaps: activity.validLaps || 0,
                            validPercent: activity.totalLaps > 0
                                ? Math.round((activity.validLaps / activity.totalLaps) * 100)
                                : 0,
                            totalTimeMs: activity.totalTimeMs || 0,
                            totalTimeFormatted: formatDriveTime(activity.totalTimeMs || 0),
                            sessionCount: activity.sessionCount || 0,
                            lastSessionDate: activity.lastSessionDate
                        }
                        trackActivityCache.value[cacheKey] = result
                        console.log(`[TRACK_BESTS] trackActivity Firebase HIT for ${trackIdNorm}`)
                        return result
                    }
                }
            } catch (e) {
                console.warn(`[TRACK_BESTS] Error reading trackActivity from Firebase:`, e)
            }
        }

        console.log(`[TRACK_BESTS] trackActivity MISS for ${trackIdNorm}, calculating...`)
        const trackSessions = sessions.value.filter(
            (s: SessionDocument) => (s.meta.track || '').toLowerCase() === trackId.toLowerCase()
        )
        const calculated = getTrackActivityTotalsFromSessions(trackSessions, formatDriveTime)
        trackActivityCache.value[cacheKey] = calculated
        return calculated
    }

    const getTheoreticalTimes = createGetTheoreticalTimes(getBestTimesForGrip)

    return {
        calculateAllBestTimesForTrack,
        getBestTimesForGrip,
        getTrackBests,
        invalidateTrackBests,
        clearTrackDerivedCaches,
        forceRecalculateTrackBests,
        resetAllTrackBests,
        prefetchAllTrackBests,
        getTrackActivity,
        getTheoreticalTimes,
        isPrefetchComplete: computed(() => globalPrefetchComplete.value),
    }
}
