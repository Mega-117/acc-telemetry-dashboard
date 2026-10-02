import { collection, doc } from 'firebase/firestore'
import { db } from '~/config/firebase'
import { trackedGetDoc, trackedGetDocs, trackedSetDoc, trackedWriteBatch } from '~/composables/useFirebaseTracker'
import { BEST_RULES_VERSION } from '~/utils/sessionParser'
import { recordingGame } from '~/services/telemetry/gameIdentity'
import { createSessionUploadService } from './sessionUploadService'
import { refreshSyncProjections } from './syncProjectionRefreshService'
import { loadOwnerSessions } from './ownerDataRepairService'
import { invalidateTelemetryCaches } from '~/services/cache/telemetryCacheInvalidationService'
import { invalidateSyncMirror } from './syncMirrorService'

/** Manual files use the same owner checks, atomic raw writes and projections as sync. */
export async function importSessionFile(file: Pick<File, 'name' | 'text'>, uid: string, assertActive: () => void) {
  const caller = 'SessionFileImport'
  assertActive()
  const rawText = await file.text()
  const raw = JSON.parse(rawText)
  if (!recordingGame(raw)) throw new Error('Formato sessione non supportato')
  const uploader = createSessionUploadService({
    db, chunkSize: 400000, assertActive,
    loadRegistryCache: async () => ({}),
    canSkipViaRegistry: () => false,
    getExistingSession: async (owner, id) => {
      const snap = await trackedGetDoc(doc(db, `users/${owner}/sessions/${id}`), caller)
      return snap.exists() ? snap.data() : null
    },
    listExistingChunks: async (owner, id) => {
      const snap = await trackedGetDocs(collection(db, `users/${owner}/sessions/${id}/rawChunks`), caller)
      return snap.docs.map(chunk => ({ id: chunk.id, ref: chunk.ref }))
    }
  })
  const result = await uploader.uploadOrUpdateSession(raw, rawText, file.name, uid)
  const committed = result.status === 'created' || result.status === 'updated' || ('committedStatus' in result && result.committedStatus)
  if (committed) {
    // Invalidate even when projection repair fails: the recording was committed.
    invalidateSyncMirror(uid)
    invalidateTelemetryCaches({ uid, scope: 'sync' })
  }
  if (result.status === 'created' || result.status === 'updated' || result.status === 'unchanged') {
    assertActive()
    // Unchanged also repairs an interrupted prior import's projections.
    await refreshSyncProjections({
      db, uid, changedCount: 1, bestRulesVersion: BEST_RULES_VERSION,
      reason: 'manual_session_import', loadFullHistory: loadOwnerSessions,
      clearTrackDerivedCaches: () => invalidateTelemetryCaches({ uid, scope: 'sync' }),
      resetAllTrackBests: async () => { throw new Error('Unexpected destructive import rebuild') },
      getDocFn: async ref => { assertActive(); return trackedGetDoc(ref, caller) },
      setDocFn: async (ref, data, options) => {
        assertActive()
        return options ? trackedSetDoc(ref, data, options, caller) : trackedSetDoc(ref, data, caller)
      },
      commitWrites: async writes => {
        assertActive()
        const batch = trackedWriteBatch(db, caller)
        for (const write of writes) {
          if (write.options) batch.set(write.ref, write.data, write.options)
          else batch.set(write.ref, write.data)
        }
        await batch.commit()
        assertActive()
      }
    })
    invalidateSyncMirror(uid)
    invalidateTelemetryCaches({ uid, scope: 'sync' })
  }
  return result
}
