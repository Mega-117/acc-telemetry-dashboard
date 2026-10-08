import { expect, it, vi } from 'vitest'
import { createSyncQueueService } from '~/services/sync/syncQueueService'
import type { PendingSyncFile } from '~/services/sync/syncScanService'
const file = (id: string) => ({ fileName: `${id}.json`, sessionId: id }) as PendingSyncFile
const done = async (item: PendingSyncFile) => ({ result: item.sessionId, didChange: true, dirtySessionId: item.sessionId })

it('retains failed and unprocessed files, retries without resending acknowledged files', async () => {
  const queue = createSyncQueueService()
  queue.enqueue(['a', 'b', 'c'].map(file))
  await expect(queue.drain(async item => {
    if (item.sessionId === 'b') throw new Error('offline')
    return done(item)
  })).rejects.toThrow('offline')
  expect(queue.size()).toBe(2)
  expect(queue.getStatus()).toBe('error')
  expect((await queue.drain(done)).results).toEqual(['b', 'c'])
  expect(queue.size()).toBe(0)
})
it('logout during an upload prevents further old-owner work and preserves a new queue', async () => {
  const queue = createSyncQueueService()
  queue.enqueue(['old-a', 'old-b'].map(file))
  let finish!: () => void
  const processor = vi.fn(async (item: PendingSyncFile) => {
    await new Promise<void>(resolve => { finish = resolve })
    return done(item)
  })
  const pending = queue.drain(processor)
  queue.clear()
  queue.enqueue([file('new')])
  finish()
  expect((await pending).results).toEqual([])
  expect(processor).toHaveBeenCalledTimes(1)
  expect((await queue.drain(done)).results).toEqual(['new'])
})
