// ============================================
// useFirebaseTracker - Centralized Firebase Operations Tracker
// ============================================
// Wraps all Firebase Firestore operations to count reads/writes/deletes.
// Provides colored console output for debugging Firebase usage.
//
// USAGE: Import tracked functions instead of firebase/firestore originals:
//   import { trackedGetDoc, trackedGetDocs, trackedSetDoc, ... } from './useFirebaseTracker'
//
// IMPORTANT: Firestore billing counts EACH DOCUMENT read, not each query.
// A getDocs() returning 50 docs = 50 reads, not 1.

import {
    getDoc as fbGetDoc,
    getDocs as fbGetDocs,
    setDoc as fbSetDoc,
    deleteDoc as fbDeleteDoc,
    updateDoc as fbUpdateDoc,
    type DocumentReference,
    type Query,
    type SetOptions
} from 'firebase/firestore'

// === TYPES ===

interface FirebaseOperation {
    type: 'READ' | 'QUERY' | 'WRITE' | 'DELETE' | 'UPDATE'
    caller: string
    path: string
    docsCount: number
    timestamp: number
}

// === GLOBAL STATE (singleton) ===

let totalReads = 0
let totalWrites = 0
let totalDeletes = 0
let sessionStart = Date.now()
const operationLog: FirebaseOperation[] = []

// Per-caller breakdown
const callerStats: Record<string, { reads: number; writes: number; deletes: number }> = {}

function ensureCaller(caller: string) {
    if (!callerStats[caller]) {
        callerStats[caller] = { reads: 0, writes: 0, deletes: 0 }
    }
}

function logOperation(op: FirebaseOperation) {
    operationLog.push(op)

    const icons: Record<string, string> = {
        READ: '📖',
        QUERY: '📖',
        WRITE: '✏️',
        DELETE: '🗑️',
        UPDATE: '✏️'
    }
    const colors: Record<string, string> = {
        READ: 'color: #4CAF50',
        QUERY: 'color: #4CAF50',
        WRITE: 'color: #FF9800',
        DELETE: 'color: #F44336',
        UPDATE: 'color: #FF9800'
    }

    const icon = icons[op.type] || '❓'
    const docsInfo = op.docsCount > 1 ? ` (${op.docsCount} docs)` : ''

    console.log(
        `%c[🔥] ${icon} ${op.type} [${op.caller}] ${op.path}${docsInfo}`,
        colors[op.type] || 'color: gray'
    )
}

// === TRACKED OPERATIONS ===

/**
 * Tracked getDoc — counts as 1 read
 */
export async function trackedGetDoc(ref: DocumentReference, caller: string) {
    ensureCaller(caller)
    totalReads++
    callerStats[caller].reads++

    logOperation({
        type: 'READ',
        caller,
        path: ref.path,
        docsCount: 1,
        timestamp: Date.now()
    })

    return fbGetDoc(ref)
}

/**
 * Tracked getDocs — counts as N reads (1 per document returned)
 * Plus 1 minimum read even if 0 results (Firestore still charges)
 */
export async function trackedGetDocs(q: Query, caller: string) {
    ensureCaller(caller)

    const result = await fbGetDocs(q)
    const docsRead = Math.max(result.docs.length, 1) // At least 1 read per query

    totalReads += docsRead
    callerStats[caller].reads += docsRead

    logOperation({
        type: 'QUERY',
        caller,
        path: `query (${result.docs.length} docs)`,
        docsCount: docsRead,
        timestamp: Date.now()
    })

    return result
}

/**
 * Tracked setDoc — counts as 1 write
 * Supports: trackedSetDoc(ref, data, caller) and trackedSetDoc(ref, data, options, caller)
 */
export async function trackedSetDoc(ref: DocumentReference, data: any, caller: string): Promise<void>
export async function trackedSetDoc(ref: DocumentReference, data: any, options: SetOptions, caller: string): Promise<void>
export async function trackedSetDoc(ref: DocumentReference, data: any, callerOrOptions: string | SetOptions, maybeCaller?: string): Promise<void> {
    let caller: string
    let options: SetOptions | undefined

    if (typeof callerOrOptions === 'string') {
        caller = callerOrOptions
    } else {
        options = callerOrOptions
        caller = maybeCaller || 'unknown'
    }

    ensureCaller(caller)
    totalWrites++
    callerStats[caller].writes++

    logOperation({
        type: 'WRITE',
        caller,
        path: ref.path,
        docsCount: 1,
        timestamp: Date.now()
    })

    if (options) {
        return fbSetDoc(ref, data, options)
    }
    return fbSetDoc(ref, data)
}

/**
 * Tracked deleteDoc — counts as 1 delete (billed as 1 write)
 */
export async function trackedDeleteDoc(ref: DocumentReference, caller: string) {
    ensureCaller(caller)
    totalDeletes++
    callerStats[caller].deletes++

    logOperation({
        type: 'DELETE',
        caller,
        path: ref.path,
        docsCount: 1,
        timestamp: Date.now()
    })

    return fbDeleteDoc(ref)
}

/**
 * Tracked updateDoc — counts as 1 write
 */
export async function trackedUpdateDoc(ref: DocumentReference, data: any, caller: string) {
    ensureCaller(caller)
    totalWrites++
    callerStats[caller].writes++

    logOperation({
        type: 'UPDATE',
        caller,
        path: ref.path,
        docsCount: 1,
        timestamp: Date.now()
    })

    return fbUpdateDoc(ref, data)
}

// === REPORTING ===

/**
 * Get current totals
 */
export function getFirebaseTotals() {
    return {
        reads: totalReads,
        writes: totalWrites,
        deletes: totalDeletes,
        total: totalReads + totalWrites + totalDeletes,
        sessionDurationMs: Date.now() - sessionStart,
        byComponent: { ...callerStats }
    }
}

/**
 * Print a formatted summary to console
 */
export function printFirebaseSummary(label?: string) {
    const duration = Math.round((Date.now() - sessionStart) / 1000)
    const mins = Math.floor(duration / 60)
    const secs = duration % 60

    console.log('%c[🔥] ═══════════════════════════════════════', 'color: #2196F3; font-weight: bold')
    console.log(`%c[🔥] 📊 FIREBASE OPS ${label ? `— ${label}` : ''}`, 'color: #2196F3; font-weight: bold')
    console.log('%c[🔥] ═══════════════════════════════════════', 'color: #2196F3; font-weight: bold')
    console.log(`%c[🔥] 📖 Letture:   ${totalReads}`, 'color: #4CAF50; font-weight: bold')
    console.log(`%c[🔥] ✏️  Scritture: ${totalWrites}`, 'color: #FF9800; font-weight: bold')
    console.log(`%c[🔥] 🗑️  Delete:    ${totalDeletes}`, 'color: #F44336; font-weight: bold')
    console.log(`%c[🔥] ⏱️  Durata:    ${mins}m ${secs}s`, 'color: #9E9E9E')
    console.log('%c[🔥] ───────────────────────────────────────', 'color: #2196F3')

    for (const [caller, stats] of Object.entries(callerStats)) {
        const parts = []
        if (stats.reads > 0) parts.push(`${stats.reads} reads`)
        if (stats.writes > 0) parts.push(`${stats.writes} writes`)
        if (stats.deletes > 0) parts.push(`${stats.deletes} deletes`)
        console.log(`%c[🔥]   ${caller}: ${parts.join(', ')}`, 'color: #9E9E9E')
    }

    console.log('%c[🔥] ═══════════════════════════════════════', 'color: #2196F3; font-weight: bold')
}

/**
 * Reset all counters (e.g. when starting a new test session)
 */
export function resetFirebaseTracker() {
    totalReads = 0
    totalWrites = 0
    totalDeletes = 0
    sessionStart = Date.now()
    operationLog.length = 0
    Object.keys(callerStats).forEach(k => delete callerStats[k])
    console.log('%c[🔥] 🔄 Tracker reset', 'color: #2196F3; font-weight: bold')
}

/**
 * Get full operation log (for detailed analysis)
 */
export function getFirebaseLog() {
    return [...operationLog]
}

// === AUTO-EXPOSE TO WINDOW (for console access) ===
if (typeof window !== 'undefined') {
    (window as any).__firebase = {
        summary: printFirebaseSummary,
        totals: getFirebaseTotals,
        log: getFirebaseLog,
        reset: resetFirebaseTracker
    }
}
