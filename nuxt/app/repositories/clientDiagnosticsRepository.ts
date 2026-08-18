import {
  collection,
  collectionGroup,
  documentId,
  limit,
  orderBy,
  query,
  startAfter,
  Timestamp,
  where,
  type DocumentData,
  type DocumentReference,
  type QueryConstraint,
  type QueryDocumentSnapshot
} from 'firebase/firestore'
import { db } from '~/config/firebase'
import {
  trackedGetCountFromServer,
  trackedGetDocs,
  trackedWriteBatch
} from '~/composables/useFirebaseTracker'
import type { ClientDiagnosticDocument, ClientDiagnosticSeverity } from '~/services/monitoring/clientDiagnosticsService'
import {
  resolveDiagnosticNickname
} from '~/utils/diagnosticsPresentation'
import {
  estimateDiagnosticsCleanup,
  estimateDiagnosticsCount,
  estimateDiagnosticsPages,
  type DiagnosticsOperationEstimate
} from '~/utils/diagnosticsCostEstimate'

const CALLER = 'ClientDiagnosticsRepository'
export const CLIENT_DIAGNOSTICS_PAGE_SIZE = 50
export const CLIENT_DIAGNOSTICS_RETENTION_DAYS = 30
export const CLIENT_DIAGNOSTICS_CLEANUP_BATCH_SIZE = 200
export const CLIENT_DIAGNOSTICS_CLEANUP_MAX_BATCHES_PER_ACTION = 5
export const CLIENT_DIAGNOSTICS_MAX_COUNT = 1000
export const CLIENT_DIAGNOSTICS_MAX_CURSOR_HOPS_PER_ACTION = 20
export const CLIENT_DIAGNOSTIC_COMPONENT_OPTIONS = ['electron', 'frontend', 'launcher', 'logger', 'updater'] as const
const CLIENT_DIAGNOSTICS_RETENTION_MS = CLIENT_DIAGNOSTICS_RETENTION_DAYS * 24 * 60 * 60 * 1000
const FIRESTORE_IN_LIMIT = 30

interface DiagnosticSnapshotDocument {
  ref: DocumentReference
  data?: () => DocumentData
}

interface DiagnosticSnapshot {
  docs: DiagnosticSnapshotDocument[]
}

export interface ClientDiagnosticsFilters {
  component?: string
  severity?: ClientDiagnosticSeverity
  startIso: string
  endExclusiveIso: string
}

export interface DeleteExpiredClientDiagnosticsOptions {
  cutoffMs?: number
  batchSize?: number
  maxBatches?: number
  cursor?: ClientDiagnosticsCursor | null
  loadBatch?: (
    cutoffMs: number,
    batchSize: number,
    cursor: ClientDiagnosticsCursor | null
  ) => Promise<DiagnosticSnapshot>
  deleteBatch?: (refs: DocumentReference[]) => Promise<void>
  onProgress?: (progress: ClientDiagnosticsCleanupResult) => void
}

export interface ClientDiagnosticItem extends ClientDiagnosticDocument {
  path: string
  pilotNickname: string
}

export interface ClientDiagnosticsPage {
  events: ClientDiagnosticItem[]
  nextCursor: ClientDiagnosticsCursor | null
  estimate: DiagnosticsOperationEstimate
}

export interface LoadClientDiagnosticsPageOptions {
  filters: ClientDiagnosticsFilters
  pageSize?: number
  cursor?: ClientDiagnosticsCursor | null
}

export interface ClientDiagnosticsCursor {
  receivedAtMs: number
  path: string
}

export interface ClientDiagnosticsCount {
  total: number
  capped: boolean
  estimate: DiagnosticsOperationEstimate
}

export interface ClientDiagnosticsCleanupResult {
  cutoffMs: number
  deleted: number
  batches: number
  done: boolean
  nextCursor: ClientDiagnosticsCursor | null
  estimate: DiagnosticsOperationEstimate
}

export class ClientDiagnosticsCleanupError extends Error {
  readonly progress: ClientDiagnosticsCleanupResult

  constructor(progress: ClientDiagnosticsCleanupResult, cause?: unknown) {
    super('Pulizia parziale: i batch confermati restano eliminati e la ripresa usa lo stesso cursore.')
    this.name = 'ClientDiagnosticsCleanupError'
    this.progress = progress
    if (cause !== undefined) (this as Error & { cause?: unknown }).cause = cause
  }
}

function timestampToIso(value: unknown): string {
  if (typeof value === 'string') return value
  if (value && typeof (value as any).toDate === 'function') {
    const date = (value as any).toDate()
    if (date instanceof Date && !Number.isNaN(date.getTime())) return date.toISOString()
  }
  return ''
}

function chunks<T>(items: T[], size: number): T[][] {
  const output: T[][] = []
  for (let index = 0; index < items.length; index += size) output.push(items.slice(index, index + size))
  return output
}

async function loadPilotNicknames(userIds: string[]): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(userIds.filter(Boolean))]
  const nicknames = new Map<string, string>()
  await Promise.all(chunks(uniqueIds, FIRESTORE_IN_LIMIT).map(async (uidBatch) => {
    const snapshot = await trackedGetDocs(
      query(collection(db, 'pilotDirectory'), where(documentId(), 'in', uidBatch)),
      CALLER
    )
    snapshot.docs.forEach((docSnap: any) => {
      const nickname = docSnap.data()?.nickname
      if (typeof nickname === 'string' && nickname.trim()) nicknames.set(docSnap.id, nickname.trim())
    })
  }))
  return nicknames
}

export function diagnosticRetentionCutoffMs(nowMs = Date.now()): number {
  return nowMs - CLIENT_DIAGNOSTICS_RETENTION_MS
}

function normalizePageSize(value?: number): number {
  return Math.max(1, Math.min(CLIENT_DIAGNOSTICS_PAGE_SIZE, value || CLIENT_DIAGNOSTICS_PAGE_SIZE))
}

function cursorFromDocument(document: DiagnosticSnapshotDocument): ClientDiagnosticsCursor {
  const receivedAt = document.data?.()?.receivedAt
  const receivedAtMs = receivedAt && typeof receivedAt.toMillis === 'function'
    ? receivedAt.toMillis()
    : Date.parse(timestampToIso(receivedAt))
  if (!Number.isFinite(receivedAtMs) || !document.ref.path) {
    throw new Error('Cursor diagnostica non valido: receivedAt server e path sono obbligatori.')
  }
  return { receivedAtMs, path: document.ref.path }
}

function diagnosticsFilterConstraints(filters: ClientDiagnosticsFilters): QueryConstraint[] {
  const startMs = Date.parse(filters.startIso)
  const endExclusiveMs = Date.parse(filters.endExclusiveIso)
  if (!Number.isFinite(startMs) || !Number.isFinite(endExclusiveMs) || startMs >= endExclusiveMs) {
    throw new Error('Intervallo diagnostica non valido.')
  }
  const constraints: QueryConstraint[] = [
    where('receivedAt', '>=', Timestamp.fromMillis(startMs)),
    where('receivedAt', '<', Timestamp.fromMillis(endExclusiveMs))
  ]
  if (filters.component) constraints.push(where('component', '==', filters.component))
  if (filters.severity) constraints.push(where('severity', '==', filters.severity))
  return constraints
}

function diagnosticsCountQuery(filters: ClientDiagnosticsFilters) {
  return query(
    collectionGroup(db, 'diagnostics'),
    ...diagnosticsFilterConstraints(filters),
    limit(CLIENT_DIAGNOSTICS_MAX_COUNT + 1)
  )
}

function diagnosticsPageQuery(
  filters: ClientDiagnosticsFilters,
  pageSize: number,
  cursor: ClientDiagnosticsCursor | null
) {
  const constraints: QueryConstraint[] = [
    ...diagnosticsFilterConstraints(filters),
    orderBy('receivedAt', 'desc'),
    orderBy(documentId(), 'desc')
  ]
  if (cursor) {
    constraints.push(startAfter(Timestamp.fromMillis(cursor.receivedAtMs), cursor.path))
  }
  constraints.push(limit(pageSize))
  return query(collectionGroup(db, 'diagnostics'), ...constraints)
}

function expiredDiagnosticsQuery(
  cutoffMs: number,
  maxItems: number,
  cursor: ClientDiagnosticsCursor | null
) {
  const constraints: QueryConstraint[] = [
    where('receivedAt', '<=', Timestamp.fromMillis(cutoffMs)),
    orderBy('receivedAt', 'asc'),
    orderBy(documentId(), 'asc')
  ]
  if (cursor) {
    constraints.push(startAfter(Timestamp.fromMillis(cursor.receivedAtMs), cursor.path))
  }
  constraints.push(limit(maxItems))
  return query(collectionGroup(db, 'diagnostics'), ...constraints)
}

export async function countExpiredClientDiagnostics(
  cutoffMs = diagnosticRetentionCutoffMs(),
  loadCount: (cutoffMs: number, maxItems: number) => Promise<number> = async (targetCutoffMs, maxItems) => {
    const snapshot = await trackedGetCountFromServer(
      expiredDiagnosticsQuery(targetCutoffMs, maxItems, null),
      CALLER
    )
    return Number(snapshot.data().count || 0)
  }
): Promise<ClientDiagnosticsCount> {
  const rawCount = Math.max(
    0,
    await loadCount(cutoffMs, CLIENT_DIAGNOSTICS_MAX_COUNT + 1)
  )
  return {
    total: Math.min(rawCount, CLIENT_DIAGNOSTICS_MAX_COUNT),
    capped: rawCount > CLIENT_DIAGNOSTICS_MAX_COUNT,
    estimate: estimateDiagnosticsCount(CLIENT_DIAGNOSTICS_MAX_COUNT + 1)
  }
}

export async function countClientDiagnostics(
  filters: ClientDiagnosticsFilters,
  loadCount: (filters: ClientDiagnosticsFilters, maxItems: number) => Promise<number> = async (
    targetFilters,
    maxItems
  ) => {
    const snapshot = await trackedGetCountFromServer(diagnosticsCountQuery(targetFilters), CALLER)
    return Math.min(Number(snapshot.data().count || 0), maxItems)
  }
): Promise<ClientDiagnosticsCount> {
  const rawCount = Math.max(
    0,
    await loadCount(filters, CLIENT_DIAGNOSTICS_MAX_COUNT + 1)
  )
  return {
    total: Math.min(rawCount, CLIENT_DIAGNOSTICS_MAX_COUNT),
    capped: rawCount > CLIENT_DIAGNOSTICS_MAX_COUNT,
    estimate: estimateDiagnosticsCount(CLIENT_DIAGNOSTICS_MAX_COUNT + 1)
  }
}

async function loadExpiredBatch(
  cutoffMs: number,
  batchSize: number,
  cursor: ClientDiagnosticsCursor | null
): Promise<DiagnosticSnapshot> {
  return trackedGetDocs(expiredDiagnosticsQuery(cutoffMs, batchSize, cursor), CALLER)
}

async function deleteDiagnosticBatch(refs: DocumentReference[]): Promise<void> {
  const batch = trackedWriteBatch(db, CALLER)
  refs.forEach(ref => batch.delete(ref))
  await batch.commit()
}

export async function deleteExpiredClientDiagnostics(
  options: DeleteExpiredClientDiagnosticsOptions = {}
): Promise<ClientDiagnosticsCleanupResult> {
  const cutoffMs = options.cutoffMs ?? diagnosticRetentionCutoffMs()
  const batchSize = Math.max(
    1,
    Math.min(CLIENT_DIAGNOSTICS_CLEANUP_BATCH_SIZE, options.batchSize || CLIENT_DIAGNOSTICS_CLEANUP_BATCH_SIZE)
  )
  const maxBatches = Math.max(
    1,
    Math.min(
      CLIENT_DIAGNOSTICS_CLEANUP_MAX_BATCHES_PER_ACTION,
      options.maxBatches || CLIENT_DIAGNOSTICS_CLEANUP_MAX_BATCHES_PER_ACTION
    )
  )
  const loadBatch = options.loadBatch || loadExpiredBatch
  const deleteBatch = options.deleteBatch || deleteDiagnosticBatch
  let deleted = 0
  let completedBatches = 0
  let cursor = options.cursor || null

  for (let batchNumber = 0; batchNumber < maxBatches; batchNumber += 1) {
    const snapshot = await loadBatch(cutoffMs, batchSize, cursor)
    if (snapshot.docs.length === 0) {
      return {
        cutoffMs,
        deleted,
        batches: completedBatches,
        done: true,
        nextCursor: cursor,
        estimate: estimateDiagnosticsCleanup(completedBatches, batchSize)
      }
    }
    try {
      await deleteBatch(snapshot.docs.map(docSnap => docSnap.ref))
    } catch (cause) {
      throw new ClientDiagnosticsCleanupError({
        cutoffMs,
        deleted,
        batches: completedBatches,
        done: false,
        nextCursor: cursor,
        estimate: estimateDiagnosticsCleanup(completedBatches, batchSize)
      }, cause)
    }
    deleted += snapshot.docs.length
    completedBatches += 1
    cursor = cursorFromDocument(snapshot.docs[snapshot.docs.length - 1]!)
    const progress = {
      cutoffMs,
      deleted,
      batches: completedBatches,
      done: snapshot.docs.length < batchSize,
      nextCursor: cursor,
      estimate: estimateDiagnosticsCleanup(completedBatches, batchSize)
    }
    options.onProgress?.(progress)
    if (progress.done) return progress
  }

  return {
    cutoffMs,
    deleted,
    batches: completedBatches,
    done: false,
    nextCursor: cursor,
    estimate: estimateDiagnosticsCleanup(maxBatches, batchSize)
  }
}

export async function loadClientDiagnosticsPage(
  options: LoadClientDiagnosticsPageOptions
): Promise<ClientDiagnosticsPage> {
  const pageSize = normalizePageSize(options.pageSize)
  const diagnosticsQuery = diagnosticsPageQuery(options.filters, pageSize, options.cursor || null)
  const snapshot = await trackedGetDocs(diagnosticsQuery, CALLER)
  const rawEvents = snapshot.docs.map((docSnap: any) => {
    const data = docSnap.data()
    return {
      ...(data as ClientDiagnosticDocument),
      userId: typeof data.userId === 'string' ? data.userId : '',
      receivedAt: timestampToIso(data.receivedAt),
      path: docSnap.ref.path
    }
  })
  const nicknames = await loadPilotNicknames(rawEvents.map(event => event.userId))
  const lastDocument = snapshot.docs[snapshot.docs.length - 1] as QueryDocumentSnapshot | undefined

  return {
    events: rawEvents.map(event => ({
      ...event,
      pilotNickname: resolveDiagnosticNickname(event.userId, nicknames.get(event.userId))
    })),
    nextCursor: snapshot.docs.length === pageSize && lastDocument
      ? cursorFromDocument(lastDocument)
      : null,
    estimate: estimateDiagnosticsPages(1, pageSize)
  }
}
