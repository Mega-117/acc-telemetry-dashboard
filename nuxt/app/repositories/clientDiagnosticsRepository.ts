import {
  collection,
  collectionGroup,
  documentId,
  limit,
  orderBy,
  query,
  Timestamp,
  where,
  type DocumentReference
} from 'firebase/firestore'
import { db } from '~/config/firebase'
import {
  trackedGetCountFromServer,
  trackedGetDocs,
  trackedWriteBatch
} from '~/composables/useFirebaseTracker'
import type { ClientDiagnosticDocument, ClientDiagnosticSeverity } from '~/services/monitoring/clientDiagnosticsService'
import {
  filterAndPaginateDiagnostics,
  resolveDiagnosticNickname
} from '~/utils/diagnosticsPresentation'

const CALLER = 'ClientDiagnosticsRepository'
export const CLIENT_DIAGNOSTICS_PAGE_SIZE = 50
export const CLIENT_DIAGNOSTICS_RETENTION_DAYS = 30
export const CLIENT_DIAGNOSTICS_CLEANUP_BATCH_SIZE = 200
export const CLIENT_DIAGNOSTIC_COMPONENT_OPTIONS = ['electron', 'frontend', 'launcher', 'logger', 'updater'] as const
const CLIENT_DIAGNOSTICS_RETENTION_MS = CLIENT_DIAGNOSTICS_RETENTION_DAYS * 24 * 60 * 60 * 1000
const CLIENT_DIAGNOSTICS_MAX_CLEANUP_BATCHES = 1000
const FIRESTORE_IN_LIMIT = 30

interface DiagnosticSnapshotDocument {
  ref: DocumentReference
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
  loadBatch?: (cutoffMs: number, batchSize: number) => Promise<DiagnosticSnapshot>
  deleteBatch?: (refs: DocumentReference[]) => Promise<void>
}

export interface ClientDiagnosticItem extends ClientDiagnosticDocument {
  path: string
  pilotNickname: string
}

export interface ClientDiagnosticsPage {
  events: ClientDiagnosticItem[]
  total: number
  hasNext: boolean
}

export interface LoadClientDiagnosticsPageOptions {
  filters: ClientDiagnosticsFilters
  pageNumber: number
  pageSize?: number
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

function expiredDiagnosticsQuery(cutoffMs: number, maxItems?: number) {
  const diagnostics = collectionGroup(db, 'diagnostics')
  const receivedBeforeCutoff = where('receivedAt', '<=', Timestamp.fromMillis(cutoffMs))
  const oldestFirst = orderBy('receivedAt', 'asc')
  return maxItems === undefined
    ? query(diagnostics, receivedBeforeCutoff, oldestFirst)
    : query(diagnostics, receivedBeforeCutoff, oldestFirst, limit(maxItems))
}

export async function countExpiredClientDiagnostics(
  cutoffMs = diagnosticRetentionCutoffMs(),
  loadCount: (cutoffMs: number) => Promise<number> = async (targetCutoffMs) => {
    const snapshot = await trackedGetCountFromServer(expiredDiagnosticsQuery(targetCutoffMs), CALLER)
    return Number(snapshot.data().count || 0)
  }
): Promise<number> {
  return Math.max(0, await loadCount(cutoffMs))
}

async function loadExpiredBatch(cutoffMs: number, batchSize: number): Promise<DiagnosticSnapshot> {
  return trackedGetDocs(expiredDiagnosticsQuery(cutoffMs, batchSize), CALLER)
}

async function deleteDiagnosticBatch(refs: DocumentReference[]): Promise<void> {
  const batch = trackedWriteBatch(db, CALLER)
  refs.forEach(ref => batch.delete(ref))
  await batch.commit()
}

export async function deleteExpiredClientDiagnostics(
  options: DeleteExpiredClientDiagnosticsOptions = {}
): Promise<number> {
  const cutoffMs = options.cutoffMs ?? diagnosticRetentionCutoffMs()
  const batchSize = Math.max(
    1,
    Math.min(CLIENT_DIAGNOSTICS_CLEANUP_BATCH_SIZE, options.batchSize || CLIENT_DIAGNOSTICS_CLEANUP_BATCH_SIZE)
  )
  const loadBatch = options.loadBatch || loadExpiredBatch
  const deleteBatch = options.deleteBatch || deleteDiagnosticBatch
  let deleted = 0

  for (let batchNumber = 0; batchNumber < CLIENT_DIAGNOSTICS_MAX_CLEANUP_BATCHES; batchNumber += 1) {
    const snapshot = await loadBatch(cutoffMs, batchSize)
    if (snapshot.docs.length === 0) return deleted
    await deleteBatch(snapshot.docs.map(docSnap => docSnap.ref))
    deleted += snapshot.docs.length
  }

  throw new Error('Pulizia interrotta: superato il limite operativo di sicurezza.')
}

export async function loadClientDiagnosticsPage(
  options: LoadClientDiagnosticsPageOptions
): Promise<ClientDiagnosticsPage> {
  const pageSize = Math.max(1, Math.min(CLIENT_DIAGNOSTICS_PAGE_SIZE, options.pageSize || CLIENT_DIAGNOSTICS_PAGE_SIZE))
  const diagnosticsQuery = query(
    collectionGroup(db, 'diagnostics'),
    where('occurredAt', '>=', options.filters.startIso),
    where('occurredAt', '<', options.filters.endExclusiveIso),
    orderBy('occurredAt', 'desc')
  )
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
  const paginated = filterAndPaginateDiagnostics(rawEvents, options.filters, options.pageNumber, pageSize)
  const nicknames = await loadPilotNicknames(paginated.items.map(event => event.userId))

  return {
    events: paginated.items.map(event => ({
      ...event,
      pilotNickname: resolveDiagnosticNickname(event.userId, nicknames.get(event.userId))
    })),
    total: paginated.total,
    hasNext: options.pageNumber * pageSize < paginated.total
  }
}
