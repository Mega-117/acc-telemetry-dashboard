import type { PendingSyncFile } from './syncScanService'

export type SyncQueueStatus =
  | 'idle'
  | 'scanning'
  | 'queued'
  | 'uploading'
  | 'reconciling'
  | 'maintaining'
  | 'error'

export interface SyncQueueProcessOutcome<ResultType = any> {
  result: ResultType
  didChange: boolean
  dirtySessionId?: string | null
  dirtyTrack?: string | null
}

export interface SyncQueueDrainResult<ResultType = any> {
  results: ResultType[]
  dirtySessionIds: string[]
  dirtyTracks: string[]
  changedCount: number
}

export function createSyncQueueService(params?: {
  onStatusChange?: (status: SyncQueueStatus) => void
}) {
  const onStatusChange = params?.onStatusChange
  let status: SyncQueueStatus = 'idle'
  const queue = new Map<string, PendingSyncFile>()

  function setStatus(nextStatus: SyncQueueStatus) {
    status = nextStatus
    onStatusChange?.(nextStatus)
  }

  function getStatus(): SyncQueueStatus {
    return status
  }

  function size(): number {
    return queue.size
  }

  function clear() {
    queue.clear()
    setStatus('idle')
  }

  function enqueue(items: PendingSyncFile[]): number {
    let added = 0
    for (const item of items) {
      const key = item.filePath || item.sessionId || item.fileName
      if (!key) continue
      if (queue.has(key)) continue
      queue.set(key, item)
      added++
    }
    if (queue.size > 0) {
      setStatus('queued')
    }
    return added
  }

  async function drain<ResultType>(
    processor: (item: PendingSyncFile) => Promise<SyncQueueProcessOutcome<ResultType>>
  ): Promise<SyncQueueDrainResult<ResultType>> {
    if (queue.size === 0) {
      setStatus('idle')
      return {
        results: [],
        dirtySessionIds: [],
        dirtyTracks: [],
        changedCount: 0
      }
    }

    setStatus('uploading')

    const results: ResultType[] = []
    const dirtySessionIds = new Set<string>()
    const dirtyTracks = new Set<string>()
    let changedCount = 0

    const items = Array.from(queue.values())
    queue.clear()

    for (const item of items) {
      const outcome = await processor(item)
      results.push(outcome.result)
      if (outcome.didChange) {
        changedCount++
        if (outcome.dirtySessionId) dirtySessionIds.add(outcome.dirtySessionId)
        if (outcome.dirtyTrack) dirtyTracks.add(outcome.dirtyTrack)
      }
    }

    setStatus('idle')
    return {
      results,
      dirtySessionIds: Array.from(dirtySessionIds),
      dirtyTracks: Array.from(dirtyTracks),
      changedCount
    }
  }

  return {
    getStatus,
    setStatus,
    enqueue,
    size,
    clear,
    drain
  }
}
