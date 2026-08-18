import type { TrackBestProjectionDelta } from './trackBestsProjectionService'
import type { UserProjectionDelta } from './syncUserProjectionDeltaService'

export interface SyncMutationSnapshot {
  localStateChanged: boolean
  cloudChangedCount: number
  dirtySessionIds: string[]
  dirtyTracks: string[]
  trackBestDeltas: TrackBestProjectionDelta[]
  userProjectionDeltas: UserProjectionDelta[]
}

export interface SyncMutationJournal {
  recordLocalMutation: () => void
  recordUploadMutation: (mutation: {
    status: string
    committedStatus?: 'created' | 'updated' | null
    sessionId?: string | null
    dirtyTrack?: string | null
    projectionDelta?: TrackBestProjectionDelta | null
  }) => void
  snapshot: () => SyncMutationSnapshot
}

export function createSyncMutationJournal(): SyncMutationJournal {
  let localStateChanged = false
  let cloudChangedCount = 0
  const dirtySessionIds = new Set<string>()
  const dirtyTracks = new Set<string>()
  const trackBestDeltas: TrackBestProjectionDelta[] = []
  const userProjectionDeltas: UserProjectionDelta[] = []

  return {
    recordLocalMutation() {
      localStateChanged = true
    },
    recordUploadMutation(mutation) {
      const committedStatus = mutation.status === 'created' || mutation.status === 'updated'
        ? mutation.status
        : mutation.committedStatus
      if (committedStatus !== 'created' && committedStatus !== 'updated') return
      cloudChangedCount++
      if (mutation.sessionId) dirtySessionIds.add(mutation.sessionId)
      if (mutation.dirtyTrack) dirtyTracks.add(mutation.dirtyTrack)
      if (mutation.projectionDelta) {
        trackBestDeltas.push(mutation.projectionDelta)
        userProjectionDeltas.push({
          ...mutation.projectionDelta,
          status: committedStatus
        } as UserProjectionDelta)
      }
    },
    snapshot() {
      return {
        localStateChanged,
        cloudChangedCount,
        dirtySessionIds: Array.from(dirtySessionIds),
        dirtyTracks: Array.from(dirtyTracks),
        trackBestDeltas: [...trackBestDeltas],
        userProjectionDeltas: [...userProjectionDeltas]
      }
    }
  }
}

export async function runLocalMutationBoundary<T>(params: {
  journal: SyncMutationJournal
  run: () => Promise<T>
  didMutate: (result: T) => boolean
}): Promise<T> {
  try {
    const result = await params.run()
    if (params.didMutate(result)) params.journal.recordLocalMutation()
    return result
  } catch (error) {
    // A rejected multi-file main IPC may have committed an earlier file. Mark
    // the local cache dirty pessimistically so recovery cannot treat it as a no-op.
    params.journal.recordLocalMutation()
    throw error
  }
}

export async function recoverPartialSyncMutations(params: {
  snapshot: SyncMutationSnapshot
  isCurrent: () => boolean
  invalidate: () => void
  reconcileCloud: (snapshot: SyncMutationSnapshot) => Promise<void>
}): Promise<boolean> {
  const { snapshot, isCurrent, invalidate, reconcileCloud } = params
  const hasMutation = snapshot.localStateChanged || snapshot.cloudChangedCount > 0
  if (!hasMutation) return false

  invalidate()
  if (snapshot.cloudChangedCount > 0 && isCurrent()) {
    await reconcileCloud(snapshot)
  }
  return true
}
