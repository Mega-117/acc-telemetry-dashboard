
import { expect, it } from 'vitest'
import { createAuthTransitionQueue } from '~/services/auth/authTransitionQueue'
it('ordina effetti e continua dopo errore senza anticipare il lavoro successivo', async () => {
  const queue = createAuthTransitionQueue()
  const calls: string[] = []
  let release!: () => void
  const first = queue.run(async () => {
    calls.push('stop')
    await new Promise<void>(resolve => { release = resolve })
    throw new Error('stop failed')
  })
  const rejected = expect(first).rejects.toThrow('stop failed')
  const second = queue.run(async () => { calls.push('retry'); return 42 })
  await Promise.resolve()
  expect(calls).toEqual(['stop'])
  release()
  await rejected
  expect(await second).toBe(42)
  await queue.whenIdle()
  expect(calls).toEqual(['stop', 'retry'])
})
