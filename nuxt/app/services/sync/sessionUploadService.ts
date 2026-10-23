import { collection, doc, serverTimestamp } from 'firebase/firestore'
import { trackedWriteBatch } from '~/composables/useFirebaseTracker'
import type { TrackBestProjectionDelta } from './trackBestsProjectionService'
import { BEST_RULES_VERSION, extractMetadata, generateSessionId } from '~/utils/sessionParser'
import { stableStringify } from '~/utils/stableStringify'
import {
  cloudStateFromSessionDocument,
  knownRawChunkIds,
  normalizeRegistryCloudState,
  resolveKnownCloudSession,
  type RegistryCacheEntry,
  type RegistryCloudState
} from './syncRegistryPolicy'

export type { RegistryCacheEntry, RegistryCloudState } from './syncRegistryPolicy'

export function splitTextIntoChunks(str: string, size: number): string[] {
  const chunks: string[] = []
  for (let i = 0; i < str.length; i += size) {
    chunks.push(str.slice(i, i + size))
  }
  return chunks
}

export async function calculateContentHash(input: string): Promise<string> {
  const data = new TextEncoder().encode(input)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  return Array.from(new Uint8Array(hashBuffer)).map((b) => b.toString(16).padStart(2, '0')).join('')
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
function cloneWithoutDerivedSummary(rawObj: any): any {
  if (!rawObj || typeof rawObj !== 'object') return rawObj
  const cloned = JSON.parse(JSON.stringify(rawObj))
  delete cloned.summary
  delete cloned.summaryRulesVersion
  return cloned
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
export async function calculateRawDataHash(rawObj: any): Promise<string> {
  return calculateContentHash(stableStringify(cloneWithoutDerivedSummary(rawObj)))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
export async function calculateSummaryHash(summary: any): Promise<string> {
  return calculateContentHash(stableStringify(summary || null))
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
export function prepareSummaryForUpload(rawObj: any):
  | { ok: true; meta: any; summary: any; summarySource: 'canonical' }
  | { ok: false; meta: any; reason: 'legacy_local_requires_reprocess' } {
  const canonical = extractMetadata(rawObj)

  if (canonical.summarySource === 'canonical') {
    return {
      ok: true,
      meta: canonical.meta,
      // The recorded file is the historical source of truth. Parsing may normalize
      // a view for old consumers, but the synchronization copy must stay byte-for-
      // byte equivalent at the JSON value level and retain future provenance fields.
      summary: rawObj.summary,
      summarySource: 'canonical'
    }
  }

  return {
    ok: false,
    meta: canonical.meta,
    reason: 'legacy_local_requires_reprocess'
  }
}

/**
 * PIP-444: documento sessione "come lo conosce il registro locale": stessi campi che la
 * logica di aggiornamento legge da `sessions/{id}`, senza la lettura dal cloud.
 */
function existingFromCloudState(cloud: RegistryCloudState) {
  return {
    fileHash: cloud.fileHash,
    rawDataHash: cloud.rawDataHash,
    version: cloud.sessionVersion,
    rawChunkCount: cloud.rawChunkCount,
    rawSizeBytes: cloud.rawSizeBytes,
    rawEncoding: cloud.rawEncoding,
    summaryRulesVersion: cloud.summaryRulesVersion,
    summary: { best_rules_version: cloud.summaryRulesVersion }
  }
}

export function createSessionUploadService(params: {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
  db: any
  chunkSize: number
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
  getExistingSession: (uid: string, sessionId: string) => Promise<any>
  loadRegistryCache: () => Promise<Record<string, RegistryCacheEntry>>
  canSkipViaRegistry: (
    registry: Record<string, RegistryCacheEntry>,
    fileName: string,
    hashes: { fileHash: string; rawDataHash: string; summaryHash: string },
    uid: string
  ) => boolean
  listExistingChunks: (uid: string, sessionId: string) => Promise<Array<{ id: string, ref: unknown }>>
  assertActive?: () => void
}) {
  const {
    db,
    chunkSize,
    getExistingSession,
    loadRegistryCache,
    canSkipViaRegistry,
    listExistingChunks,
    assertActive = () => {}
  } = params

  return {
    async uploadOrUpdateSession(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
      rawObj: any,
      rawText: string,
      fileName: string,
      uid: string,
      options: { precomputedHash?: string } = {}
    ) {
      let committedResult: {
        committedStatus: 'created' | 'updated'
        sessionId: string
        projectionDelta: TrackBestProjectionDelta
        cloudState: RegistryCloudState | null
      } | null = null
      try {
        assertActive()
        const totalLaps = rawObj.session_info?.laps_total || 0
        if (totalLaps === 0) {
          return { status: 'skipped' as const, fileName, reason: 'zero_laps' }
        }

        const fileOwnerId = typeof rawObj.ownerId === 'string' ? rawObj.ownerId : null
        if (!fileOwnerId) {
          return { status: 'skipped' as const, fileName, reason: 'owner_missing' }
        }
        if (fileOwnerId !== uid) {
          return { status: 'skipped' as const, fileName, reason: 'owner_mismatch' }
        }
        const preparedSummary = prepareSummaryForUpload(rawObj)
        if (!preparedSummary.ok) {
          return { status: 'skipped' as const, fileName, reason: preparedSummary.reason }
        }
        const { meta, summary: summaryWithRules } = preparedSummary
        const requiredRulesVersion = meta.gameId === 'acc' ? BEST_RULES_VERSION : 1
        const summaryVersion = meta.gameId === 'acc' ? summaryWithRules.best_rules_version : summaryWithRules.version
        const sessionId = generateSessionId(meta.date_start, meta.track, meta.gameId, meta)
        const fileHash = options.precomputedHash || await calculateContentHash(rawText)
        const rawDataHash = await calculateRawDataHash(rawObj)
        const summaryHash = await calculateSummaryHash(summaryWithRules)
        assertActive()

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
        const getExistingRulesVersion = (existingDoc: any): number =>
          Number(existingDoc?.summary?.best_rules_version || existingDoc?.summaryRulesVersion || 0)

        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
        let existing: any = null
        let existingChecked = false
        const registry = await loadRegistryCache()
        assertActive()
        const registryEntry = registry[fileName]
        // PIP-444: se il registro locale conosce lo stato cloud di questa sessione (ultimo
        // caricamento riuscito da questo PC) non si rilegge `sessions/{id}` ne' si
        // interrogano i raw chunk. Registro assente o incoerente: letture come prima.
        const knownCloud = resolveKnownCloudSession({ entry: registryEntry, ownerId: uid, sessionId })
        if (canSkipViaRegistry(registry, fileName, { fileHash, rawDataHash, summaryHash }, uid)) {
          if (knownCloud && knownCloud.fileHash === fileHash && knownCloud.summaryRulesVersion >= requiredRulesVersion) {
            return { status: 'unchanged' as const, fileName, sessionId, reason: 'registry_cache_hit', cloudState: knownCloud }
          }
          if (!knownCloud) {
            existing = await getExistingSession(uid, sessionId)
            assertActive()
            existingChecked = true
            const existingRulesVersion = getExistingRulesVersion(existing)
            if (existing && existing.fileHash === fileHash && existingRulesVersion >= requiredRulesVersion) {
              return {
                status: 'unchanged' as const,
                fileName,
                sessionId,
                reason: 'registry_cache_hit',
                cloudState: cloudStateFromSessionDocument(sessionId, existing)
              }
            }
          }
        }

        if (!existingChecked) {
          if (knownCloud) {
            existing = existingFromCloudState(knownCloud)
          } else {
            existing = await getExistingSession(uid, sessionId)
            assertActive()
          }
        }

        let isUpdate = false
        let chunksNeedUpdate = true
        let isRulesMigration = false
        let existingChunks: Array<{ id: string, ref: unknown }> = []
        if (existing) {
          isUpdate = true
          const existingRulesVersion = getExistingRulesVersion(existing)
          const needsRulesMigration = existingRulesVersion < requiredRulesVersion
          const existingRawDataHash = String(existing.rawDataHash || '')
          // Export formatting changes the file hash, not the recording. Avoid
          // rewriting identical chunks (and their sharing flags) on reimport.
          if (!needsRulesMigration && existingRawDataHash === rawDataHash && existing.summaryHash === summaryHash) {
            return { status: 'unchanged' as const, fileName, sessionId, reason: 'recording_hash_match', cloudState: cloudStateFromSessionDocument(sessionId, existing) }
          }
          const registryMatchesExistingUpload = !!registryEntry
            && registryEntry.uploadedBy === uid
            && registryEntry.sessionId === sessionId
            && !!registryEntry.fileHash
            && registryEntry.fileHash === existing.fileHash
          const rawDataUnchanged = (!!existingRawDataHash && existingRawDataHash === rawDataHash)
            || (!existingRawDataHash && registryMatchesExistingUpload && needsRulesMigration)

          if (existing.fileHash === fileHash) {
            if (!needsRulesMigration) {
              return {
                status: 'unchanged' as const,
                fileName,
                sessionId,
                reason: 'firebase_hash_match',
                cloudState: knownCloud || cloudStateFromSessionDocument(sessionId, existing)
              }
            }
            chunksNeedUpdate = false
            isRulesMigration = true
          } else if (rawDataUnchanged && needsRulesMigration) {
            chunksNeedUpdate = false
            isRulesMigration = true
          } else if (knownCloud) {
            // Gli id dei chunk sono `0..n-1` per costruzione (stesso batch atomico): nessuna query.
            existingChunks = knownRawChunkIds(knownCloud).map((id) => ({
              id,
              ref: doc(collection(db, `users/${uid}/sessions/${sessionId}/rawChunks`), id)
            }))
          } else {
            assertActive()
            existingChunks = await listExistingChunks(uid, sessionId)
            assertActive()
          }
        }

        const chunks = chunksNeedUpdate ? splitTextIntoChunks(rawText, chunkSize) : []
        const batch = trackedWriteBatch(db, 'SessionUploadService')

        const sessionRef = doc(db, `users/${uid}/sessions/${sessionId}`)
        // PIP-591: la scelta di condivisione (`isPublic`) sopravvive a una nuova sincronizzazione.
        // Sessione e chunk si scrivono con mergeFields: si sostituiscono per intero i soli campi del
        // caricamento, il resto resta. I chunk NUOVI devono pero' sapere se la sessione e' condivisa:
        // se il registro locale non lo dice, una sola lettura del documento, solo in quel caso.
        let shared = existing?.isPublic === true
        if (chunksNeedUpdate && existing && existing.isPublic === undefined
            && chunks.length > Number(existing.rawChunkCount || 0)) {
          shared = (await getExistingSession(uid, sessionId))?.isPublic === true
          assertActive()
        }
        const sessionDocument = {
          fileHash,
          rawDataHash,
          summaryHash,
          fileName,
          uploadedAt: serverTimestamp(),
          meta,
          summary: summaryWithRules,
          summaryRulesVersion: Number(summaryVersion),
          rawChunkCount: chunksNeedUpdate ? chunks.length : (existing?.rawChunkCount || 0),
          rawSizeBytes: chunksNeedUpdate ? rawText.length : (existing?.rawSizeBytes || rawText.length),
          rawEncoding: existing?.rawEncoding || 'json-string',
          version: (existing?.version || 0) + 1
        }
        batch.set(sessionRef, sessionDocument, { mergeFields: Object.keys(sessionDocument) })

        // PIP-444: `uploads/{fileHash}` non viene piu' scritto. Era un registro di dedupe
        // per hash che nessun lettore consulta (rules senza get, nessun repository/admin):
        // il registro locale conserva gia' hash e stato cloud per file.

        if (chunksNeedUpdate) {
          for (let idx = 0; idx < chunks.length; idx++) {
            const chunkRef = doc(collection(db, `users/${uid}/sessions/${sessionId}/rawChunks`), `${idx}`)
            const chunkDocument = { idx, chunk: chunks[idx], ...(shared ? { isPublic: true } : {}) }
            batch.set(chunkRef, chunkDocument, { mergeFields: Object.keys(chunkDocument) })
          }
          const nextChunkIds = new Set(chunks.map((_, idx) => String(idx)))
          for (const existingChunk of existingChunks) {
            if (!nextChunkIds.has(String(existingChunk.id))) {
              batch.delete(existingChunk.ref as any)
            }
          }
        }

        const projectionDelta: TrackBestProjectionDelta = {
          sourceSessionId: meta.sourceSessionId,
          gameId: meta.gameId,
          trackVariant: meta.trackVariant,
          sessionKind: meta.sessionKind,
          trackId: meta.track,
          sessionId,
          dateStart: meta.date_start,
          sessionType: meta.session_type,
          summary: summaryWithRules,
          car: meta.car
        }
        const committedStatus = (isUpdate ? 'updated' : 'created') as 'created' | 'updated'
        const cloudState = normalizeRegistryCloudState({
          sessionId,
          fileHash,
          rawDataHash,
          summaryRulesVersion: sessionDocument.summaryRulesVersion,
          sessionVersion: sessionDocument.version,
          rawChunkCount: sessionDocument.rawChunkCount,
          rawSizeBytes: sessionDocument.rawSizeBytes,
          rawEncoding: sessionDocument.rawEncoding
        })

        assertActive()
        await batch.commit()
        committedResult = { committedStatus, sessionId, projectionDelta, cloudState }
        assertActive()

        return {
          status: committedStatus,
          fileName,
          sessionId,
          projectionDelta,
          cloudState,
          reason: isRulesMigration ? 'summary_rules_migration' : undefined
        }
      // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
      } catch (error: any) {
        return {
          status: 'error' as const,
          fileName,
          error: error.message,
          ...(committedResult || {})
        }
      }
    }
  }
}
