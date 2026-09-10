
import { expect, it, vi } from 'vitest'
import { useOverviewProjection } from '~/composables/useOverviewProjection'
it('scarta risposte obsolete e cancella subito i dati al cambio utente', async () => {
  const resolves: Array<(value: any) => void> = []
  const overview = useOverviewProjection(() => new Promise(resolve => resolves.push(resolve)))
  const a = overview.load('A')
  expect(overview.status.value).toBe('pending')
  const b = overview.load('B')
  resolves[1]({ marker: 'B' })
  await b
  resolves[0]({ marker: 'A' })
  await a
  expect(overview.projection.value).toEqual({ marker: 'B' })
  void overview.load('C')
  expect(overview.projection.value).toBeNull()
  overview.dispose()
  resolves[2]({ marker: 'C' })
  await Promise.resolve()
  expect(overview.projection.value).toBeNull()
})
it('distingue assenza riuscita da errore e conserva dati durante refresh dello stesso utente', async () => {
  const fetch = vi.fn().mockResolvedValueOnce({ marker: 'A' }).mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(null)
  const overview = useOverviewProjection(fetch)
  await overview.load('A')
  const refresh = overview.load('A')
  expect(overview.projection.value).toEqual({ marker: 'A' })
  await refresh
  expect(overview.status.value).toBe('error')
  expect(overview.projection.value).toEqual({ marker: 'A' })
  await overview.load('A')
  expect(overview.status.value).toBe('empty')
  expect(overview.projection.value).toBeNull()
  await overview.load(null)
  expect(fetch).toHaveBeenCalledTimes(3)
})
