// ============================================
// useFirebaseTracker - Centralized Firebase operations monitor
// ============================================
// Tracks Firestore reads/writes/listeners in one place so we can:
// - estimate billed reads/writes for the current app session
// - understand which caller/path is responsible
// - debug expensive flows and optimize them over time

import { computed, ref } from 'vue'
import {
  addDoc as fbAddDoc,
  deleteDoc as fbDeleteDoc,
  getCountFromServer as fbGetCountFromServer,
  getDoc as fbGetDoc,
  getDocs as fbGetDocs,
  onSnapshot as fbOnSnapshot,
  setDoc as fbSetDoc,
  updateDoc as fbUpdateDoc,
  writeBatch as fbWriteBatch,
  type DocumentReference,
  type Firestore,
  type Query,
  type QuerySnapshot,
  type SetOptions
} from 'firebase/firestore'
import { sanitizeForFirestore } from '~/utils/firestoreSanitize'
import { canUseDevTools } from '~/utils/devToolsAccess'

type FirebaseOperationType =
  | 'READ'
  | 'QUERY'
  | 'COUNT'
  | 'WRITE'
  | 'UPDATE'
  | 'DELETE'
  | 'ADD'
  | 'LISTEN_SUBSCRIBE'
  | 'LISTEN_SNAPSHOT'
  | 'BATCH_COMMIT'

export interface FirebaseOperation {
  id: number
  type: FirebaseOperationType
  caller: string
  path: string
  pathBucket: string
  docsCount: number
  billedReads: number
  billedWrites: number
  writeDocs?: number
  deleteDocs?: number
  scenarioId?: number
  scenarioName?: string
  startedAt: number
  durationMs: number
  note?: string
}

interface FirebaseCallerStats {
  caller: string
  operations: number
  readOps: number
  queryOps: number
  countOps: number
  writeOps: number
  deleteOps: number
  listenerSnapshots: number
  batchCommits: number
  billedReads: number
  billedWrites: number
  lastSeenAt: number
}

interface FirebasePathStats {
  pathBucket: string
  operations: number
  billedReads: number
  billedWrites: number
  lastSeenAt: number
}

interface FirebaseScenarioCallerStats {
  caller: string
  operations: number
  billedReads: number
  billedWrites: number
}

export interface FirebaseScenarioReport {
  id: number
  name: string
  metadata?: Record<string, unknown>
  startedAt: number
  endedAt: number | null
  durationMs: number
  operations: number
  billedReads: number
  billedWrites: number
  byCaller: Record<string, FirebaseScenarioCallerStats>
}

const MAX_LOG_ENTRIES = 500
const MAX_SCENARIO_ENTRIES = 200

const totalsState = ref({
  readOps: 0,
  queryOps: 0,
  countOps: 0,
  writeOps: 0,
  deleteOps: 0,
  addOps: 0,
  listenerSubscriptions: 0,
  listenerSnapshots: 0,
  batchCommits: 0,
  billedReads: 0,
  billedWrites: 0
})

const sessionStart = ref(Date.now())
const operationsLog = ref<FirebaseOperation[]>([])
const callerStats = ref<Record<string, FirebaseCallerStats>>({})
const pathStats = ref<Record<string, FirebasePathStats>>({})
const scenarioReports = ref<FirebaseScenarioReport[]>([])
const verboseLogging = ref(false)
let operationCounter = 0
let scenarioCounter = 0
let activeScenarioStack: number[] = []

function cloneTotals() {
  return { ...totalsState.value }
}

function safePathSegments(target: any): string[] | null {
  const candidates = [
    target?._query?.path?.segments,
    target?._path?.segments,
    target?._key?.path?.segments
  ]

  for (const candidate of candidates) {
    if (Array.isArray(candidate) && candidate.length > 0) {
      return candidate.map((segment) => String(segment))
    }
  }

  return null
}

function extractFirestorePath(target: any): string {
  if (target && typeof target.path === 'string' && target.path.length > 0) {
    return target.path
  }

  const segments = safePathSegments(target)
  if (segments && segments.length > 0) {
    return segments.join('/')
  }

  if (typeof target?._query?.path?.canonicalString === 'function') {
    const value = String(target._query.path.canonicalString() || '')
    if (value) return value
  }

  return 'unknown'
}

function toPathBucket(path: string): string {
  if (!path || path === 'unknown') return 'unknown'
  const segments = path.split('/').filter(Boolean)
  if (segments.length === 0) return 'unknown'
  return segments
    .map((segment, index) => (index % 2 === 1 ? '*' : segment))
    .join('/')
}

function ensureCaller(caller: string): FirebaseCallerStats {
  const current = callerStats.value[caller]
  if (current) return current

  const next: FirebaseCallerStats = {
    caller,
    operations: 0,
    readOps: 0,
    queryOps: 0,
    countOps: 0,
    writeOps: 0,
    deleteOps: 0,
    listenerSnapshots: 0,
    batchCommits: 0,
    billedReads: 0,
    billedWrites: 0,
    lastSeenAt: 0
  }

  callerStats.value = {
    ...callerStats.value,
    [caller]: next
  }
  return next
}

function ensurePathBucket(pathBucket: string): FirebasePathStats {
  const current = pathStats.value[pathBucket]
  if (current) return current

  const next: FirebasePathStats = {
    pathBucket,
    operations: 0,
    billedReads: 0,
    billedWrites: 0,
    lastSeenAt: 0
  }

  pathStats.value = {
    ...pathStats.value,
    [pathBucket]: next
  }
  return next
}

function pushOperation(entry: FirebaseOperation) {
  const next = [...operationsLog.value, entry]
  if (next.length > MAX_LOG_ENTRIES) {
    next.splice(0, next.length - MAX_LOG_ENTRIES)
  }
  operationsLog.value = next
}

function maybeVerboseLog(entry: FirebaseOperation) {
  if (!verboseLogging.value) return
  const scenario = entry.scenarioName ? ` scenario=${entry.scenarioName}` : ''
  console.log(
    `[FIREBASE] ${entry.type} caller=${entry.caller}${scenario} path=${entry.pathBucket} reads=${entry.billedReads} writes=${entry.billedWrites} docs=${entry.docsCount} duration=${entry.durationMs}ms`
  )
}

function getActiveScenario(): FirebaseScenarioReport | null {
  const activeId = activeScenarioStack[activeScenarioStack.length - 1]
  if (!activeId) return null
  return scenarioReports.value.find((scenario) => scenario.id === activeId) || null
}

function trimScenarioReports() {
  while (scenarioReports.value.length > MAX_SCENARIO_ENTRIES) {
    const first = scenarioReports.value[0]
    if (!first || activeScenarioStack.includes(first.id)) break
    scenarioReports.value = scenarioReports.value.slice(1)
  }
}

function recordScenarioOperation(entry: FirebaseOperation) {
  if (!entry.scenarioId) return
  const scenario = scenarioReports.value.find((item) => item.id === entry.scenarioId)
  if (!scenario) return

  scenario.operations += 1
  scenario.billedReads += entry.billedReads
  scenario.billedWrites += entry.billedWrites
  scenario.durationMs = (scenario.endedAt || Date.now()) - scenario.startedAt

  const caller = scenario.byCaller[entry.caller] || {
    caller: entry.caller,
    operations: 0,
    billedReads: 0,
    billedWrites: 0
  }
  caller.operations += 1
  caller.billedReads += entry.billedReads
  caller.billedWrites += entry.billedWrites
  scenario.byCaller = {
    ...scenario.byCaller,
    [entry.caller]: caller
  }

  scenarioReports.value = scenarioReports.value.map((item) => (
    item.id === scenario.id ? { ...scenario, byCaller: { ...scenario.byCaller } } : item
  ))
}

function recordOperation(input: Omit<FirebaseOperation, 'id' | 'pathBucket'>) {
  const activeScenario = getActiveScenario()
  const entry: FirebaseOperation = {
    ...input,
    id: ++operationCounter,
    pathBucket: toPathBucket(input.path),
    scenarioId: input.scenarioId || activeScenario?.id,
    scenarioName: input.scenarioName || activeScenario?.name
  }

  const nextTotals = cloneTotals()
  nextTotals.billedReads += entry.billedReads
  nextTotals.billedWrites += entry.billedWrites

  switch (entry.type) {
    case 'READ':
      nextTotals.readOps += 1
      break
    case 'QUERY':
      nextTotals.queryOps += 1
      break
    case 'COUNT':
      nextTotals.countOps += 1
      break
    case 'WRITE':
      nextTotals.writeOps += 1
      break
    case 'UPDATE':
      nextTotals.writeOps += 1
      break
    case 'ADD':
      nextTotals.addOps += 1
      nextTotals.writeOps += 1
      break
    case 'DELETE':
      nextTotals.deleteOps += 1
      break
    case 'LISTEN_SUBSCRIBE':
      nextTotals.listenerSubscriptions += 1
      break
    case 'LISTEN_SNAPSHOT':
      nextTotals.listenerSnapshots += 1
      break
    case 'BATCH_COMMIT':
      nextTotals.batchCommits += 1
      nextTotals.writeOps += entry.writeDocs || 0
      nextTotals.deleteOps += entry.deleteDocs || 0
      break
  }

  totalsState.value = nextTotals

  const caller = ensureCaller(entry.caller)
  caller.operations += 1
  caller.billedReads += entry.billedReads
  caller.billedWrites += entry.billedWrites
  caller.lastSeenAt = entry.startedAt

  switch (entry.type) {
    case 'READ':
      caller.readOps += 1
      break
    case 'QUERY':
      caller.queryOps += 1
      break
    case 'COUNT':
      caller.countOps += 1
      break
    case 'WRITE':
    case 'UPDATE':
    case 'ADD':
      caller.writeOps += 1
      break
    case 'DELETE':
      caller.deleteOps += 1
      break
    case 'LISTEN_SNAPSHOT':
      caller.listenerSnapshots += 1
      break
    case 'BATCH_COMMIT':
      caller.batchCommits += 1
      caller.writeOps += entry.writeDocs || 0
      caller.deleteOps += entry.deleteDocs || 0
      break
  }
  callerStats.value = { ...callerStats.value, [caller.caller]: { ...caller } }

  const bucket = ensurePathBucket(entry.pathBucket)
  bucket.operations += 1
  bucket.billedReads += entry.billedReads
  bucket.billedWrites += entry.billedWrites
  bucket.lastSeenAt = entry.startedAt
  pathStats.value = { ...pathStats.value, [bucket.pathBucket]: { ...bucket } }

  recordScenarioOperation(entry)
  pushOperation(entry)
  maybeVerboseLog(entry)
}

function createOperationLogger(
  type: FirebaseOperationType,
  caller: string,
  target: any,
  billedReads: number,
  billedWrites: number,
  startedAt: number,
  docsCount: number,
  note?: string,
  scenario?: { scenarioId?: number; scenarioName?: string }
) {
  recordOperation({
    type,
    caller,
    path: extractFirestorePath(target),
    billedReads,
    billedWrites,
    startedAt,
    durationMs: Date.now() - startedAt,
    docsCount,
    note,
    scenarioId: scenario?.scenarioId,
    scenarioName: scenario?.scenarioName
  })
}

export async function trackedGetDoc(ref: DocumentReference, caller: string) {
  const startedAt = Date.now()
  const result = await fbGetDoc(ref)
  createOperationLogger('READ', caller, ref, 1, 0, startedAt, 1)
  return result
}

export async function trackedGetDocs(q: Query, caller: string) {
  const startedAt = Date.now()
  const result = await fbGetDocs(q)
  const billedReads = Math.max(result.docs.length, 1)
  createOperationLogger('QUERY', caller, q, billedReads, 0, startedAt, billedReads, `returned=${result.docs.length}`)
  return result
}

export async function trackedGetCountFromServer(q: Query, caller: string) {
  const startedAt = Date.now()
  const result = await fbGetCountFromServer(q)
  const returnedCount = Number(result.data().count || 0)
  const billedReads = Math.max(1, Math.ceil(returnedCount / 1000))
  createOperationLogger(
    'COUNT',
    caller,
    q,
    billedReads,
    0,
    startedAt,
    returnedCount,
    `returnedCount=${returnedCount}, estimated=true`
  )
  return result
}

export async function trackedSetDoc(ref: DocumentReference, data: any, caller: string): Promise<void>
export async function trackedSetDoc(ref: DocumentReference, data: any, options: SetOptions, caller: string): Promise<void>
export async function trackedSetDoc(
  ref: DocumentReference,
  data: any,
  callerOrOptions: string | SetOptions,
  maybeCaller?: string
): Promise<void> {
  const startedAt = Date.now()
  let caller: string
  let options: SetOptions | undefined

  if (typeof callerOrOptions === 'string') {
    caller = callerOrOptions
  } else {
    options = callerOrOptions
    caller = maybeCaller || 'unknown'
  }

  const sanitizedData = sanitizeForFirestore(data)
  if (options) {
    await fbSetDoc(ref, sanitizedData, options)
  } else {
    await fbSetDoc(ref, sanitizedData)
  }

  createOperationLogger('WRITE', caller, ref, 0, 1, startedAt, 1)
}

export async function trackedAddDoc(ref: any, data: any, caller: string) {
  const startedAt = Date.now()
  const created = await fbAddDoc(ref, sanitizeForFirestore(data))
  createOperationLogger('ADD', caller, created, 0, 1, startedAt, 1)
  return created
}

export async function trackedDeleteDoc(ref: DocumentReference, caller: string) {
  const startedAt = Date.now()
  await fbDeleteDoc(ref)
  createOperationLogger('DELETE', caller, ref, 0, 1, startedAt, 1)
}

export async function trackedUpdateDoc(ref: DocumentReference, data: any, caller: string) {
  const startedAt = Date.now()
  await fbUpdateDoc(ref, sanitizeForFirestore(data))
  createOperationLogger('UPDATE', caller, ref, 0, 1, startedAt, 1)
}

export function trackedOnSnapshot(
  q: Query,
  caller: string,
  onNext: (snapshot: QuerySnapshot) => void,
  onError?: (error: any) => void
) {
  const activeScenario = getActiveScenario()
  const scenario = activeScenario
    ? { scenarioId: activeScenario.id, scenarioName: activeScenario.name }
    : undefined
  createOperationLogger('LISTEN_SUBSCRIBE', caller, q, 0, 0, Date.now(), 0, undefined, scenario)

  return fbOnSnapshot(
    q,
    (snapshot) => {
      const billedReads = Math.max(snapshot.docs.length, 1)
      createOperationLogger(
        'LISTEN_SNAPSHOT',
        caller,
        q,
        billedReads,
        0,
        Date.now(),
        billedReads,
        `returned=${snapshot.docs.length}`,
        scenario
      )
      onNext(snapshot)
    },
    onError
  )
}

export function trackedWriteBatch(db: Firestore, caller: string) {
  const rawBatch = fbWriteBatch(db)
  const queuedOps: Array<{ type: 'set' | 'update' | 'delete'; path: string }> = []

  return {
    set(ref: DocumentReference, data: any, options?: SetOptions) {
      queuedOps.push({ type: 'set', path: ref.path })
      const sanitizedData = sanitizeForFirestore(data)
      if (options) {
        rawBatch.set(ref, sanitizedData, options)
      } else {
        rawBatch.set(ref, sanitizedData)
      }
    },
    update(ref: DocumentReference, data: any) {
      queuedOps.push({ type: 'update', path: ref.path })
      rawBatch.update(ref, sanitizeForFirestore(data))
    },
    delete(ref: DocumentReference) {
      queuedOps.push({ type: 'delete', path: ref.path })
      rawBatch.delete(ref)
    },
    async commit() {
      const startedAt = Date.now()
      await rawBatch.commit()

      const writes = queuedOps.filter((op) => op.type !== 'delete').length
      const deletes = queuedOps.filter((op) => op.type === 'delete').length
      const touchedBuckets = Array.from(new Set(queuedOps.map((op) => toPathBucket(op.path))))

      recordOperation({
        type: 'BATCH_COMMIT',
        caller,
        path: touchedBuckets.join(', ') || 'batch',
        billedReads: 0,
        billedWrites: writes + deletes,
        writeDocs: writes,
        deleteDocs: deletes,
        startedAt,
        durationMs: Date.now() - startedAt,
        docsCount: queuedOps.length,
        note: `writes=${writes}, deletes=${deletes}`
      })
    }
  }
}

export function getFirebaseTotals() {
  return {
    ...totalsState.value,
    totalOperations:
      totalsState.value.readOps +
      totalsState.value.queryOps +
      totalsState.value.countOps +
      totalsState.value.writeOps +
      totalsState.value.deleteOps +
      totalsState.value.listenerSubscriptions +
      totalsState.value.listenerSnapshots +
      totalsState.value.batchCommits,
    sessionDurationMs: Date.now() - sessionStart.value,
    byCaller: { ...callerStats.value },
    byPath: { ...pathStats.value }
  }
}

export function getFirebaseLog() {
  return [...operationsLog.value]
}

export function startFirebaseScenario(name: string, metadata: Record<string, unknown> = {}) {
  const scenario: FirebaseScenarioReport = {
    id: ++scenarioCounter,
    name,
    metadata,
    startedAt: Date.now(),
    endedAt: null,
    durationMs: 0,
    operations: 0,
    billedReads: 0,
    billedWrites: 0,
    byCaller: {}
  }
  activeScenarioStack = [...activeScenarioStack, scenario.id]
  scenarioReports.value = [...scenarioReports.value, scenario]
  trimScenarioReports()
  return scenario.id
}

export function endFirebaseScenario(id?: number) {
  const scenarioId = id || activeScenarioStack[activeScenarioStack.length - 1]
  if (!scenarioId) return null
  const scenario = scenarioReports.value.find((item) => item.id === scenarioId)
  activeScenarioStack = activeScenarioStack.filter((activeId) => activeId !== scenarioId)
  if (!scenario) return null

  const endedAt = Date.now()
  const endedScenario: FirebaseScenarioReport = {
    ...scenario,
    endedAt,
    durationMs: endedAt - scenario.startedAt,
    byCaller: { ...scenario.byCaller }
  }
  scenarioReports.value = scenarioReports.value.map((item) => (
    item.id === scenarioId ? endedScenario : item
  ))
  return endedScenario
}

export async function withFirebaseScenario<T>(
  name: string,
  metadata: Record<string, unknown> = {},
  fn: () => T | Promise<T>
): Promise<T> {
  const scenarioId = startFirebaseScenario(name, metadata)
  try {
    return await fn()
  } finally {
    endFirebaseScenario(scenarioId)
  }
}

export function getFirebaseScenarios() {
  return scenarioReports.value.map((scenario) => ({
    ...scenario,
    durationMs: scenario.endedAt ? scenario.durationMs : Date.now() - scenario.startedAt,
    byCaller: { ...scenario.byCaller }
  }))
}

export function resetFirebaseScenarios() {
  scenarioReports.value = []
  activeScenarioStack = []
  scenarioCounter = 0
}

export function exportFirebaseReport() {
  return {
    generatedAt: new Date().toISOString(),
    sessionStartedAt: new Date(sessionStart.value).toISOString(),
    totals: getFirebaseTotals(),
    operations: getFirebaseLog(),
    scenarios: getFirebaseScenarios()
  }
}

export function printFirebaseSummary(label?: string) {
  const totals = getFirebaseTotals()
  const durationSec = Math.round(totals.sessionDurationMs / 1000)
  console.log(`[FIREBASE] Summary${label ? ` - ${label}` : ''}`)
  console.log(`[FIREBASE] billedReads=${totals.billedReads} billedWrites=${totals.billedWrites} duration=${durationSec}s`)
  console.log(`[FIREBASE] readOps=${totals.readOps} queryOps=${totals.queryOps} countOps=${totals.countOps} writeOps=${totals.writeOps} deleteOps=${totals.deleteOps} batchCommits=${totals.batchCommits} listenerSnapshots=${totals.listenerSnapshots}`)
}

export function resetFirebaseTracker() {
  totalsState.value = {
    readOps: 0,
    queryOps: 0,
    countOps: 0,
    writeOps: 0,
    deleteOps: 0,
    addOps: 0,
    listenerSubscriptions: 0,
    listenerSnapshots: 0,
    batchCommits: 0,
    billedReads: 0,
    billedWrites: 0
  }
  sessionStart.value = Date.now()
  operationsLog.value = []
  callerStats.value = {}
  pathStats.value = {}
  operationCounter = 0
  resetFirebaseScenarios()
  console.log('[FIREBASE] Tracker reset')
}

export function setFirebaseTrackerVerbose(enabled: boolean) {
  verboseLogging.value = !!enabled
  console.log(`[FIREBASE] Verbose logging ${verboseLogging.value ? 'enabled' : 'disabled'}`)
}

export function useFirebaseMonitor() {
  const totals = computed(() => ({
    ...getFirebaseTotals(),
    sessionStartedAt: new Date(sessionStart.value).toISOString()
  }))

  const recentOperations = computed(() => [...operationsLog.value].reverse())
  const callerBreakdown = computed(() =>
    Object.values(callerStats.value).sort((a, b) => {
      const delta = b.billedReads + b.billedWrites - (a.billedReads + a.billedWrites)
      if (delta !== 0) return delta
      return b.operations - a.operations
    })
  )
  const pathBreakdown = computed(() =>
    Object.values(pathStats.value).sort((a, b) => {
      const delta = b.billedReads + b.billedWrites - (a.billedReads + a.billedWrites)
      if (delta !== 0) return delta
      return b.operations - a.operations
    })
  )
  const scenarioBreakdown = computed(() =>
    getFirebaseScenarios().sort((a, b) => {
      const delta = b.billedReads + b.billedWrites - (a.billedReads + a.billedWrites)
      if (delta !== 0) return delta
      return b.operations - a.operations
    })
  )
  const recentScenarios = computed(() => [...getFirebaseScenarios()].reverse())

  return {
    totals,
    recentOperations,
    callerBreakdown,
    pathBreakdown,
    scenarioBreakdown,
    recentScenarios,
    verboseLogging,
    resetFirebaseTracker,
    resetFirebaseScenarios,
    setFirebaseTrackerVerbose,
    printFirebaseSummary,
    exportFirebaseReport
  }
}

if (typeof window !== 'undefined' && canUseDevTools()) {
  ;(window as any).__firebase = {
    summary: printFirebaseSummary,
    totals: getFirebaseTotals,
    log: getFirebaseLog,
    reset: resetFirebaseTracker,
    export: exportFirebaseReport,
    scenarios: getFirebaseScenarios,
    resetScenarios: resetFirebaseScenarios,
    startScenario: startFirebaseScenario,
    endScenario: endFirebaseScenario,
    verbose: setFirebaseTrackerVerbose
  }
}
