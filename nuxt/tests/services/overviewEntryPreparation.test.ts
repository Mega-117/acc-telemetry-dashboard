import { afterEach, expect, it, vi } from 'vitest'
import { prepareOverviewEntry, decodeOverviewImage } from '~/services/auth/overviewEntryPreparation'
import { getOverviewCarImage } from '~/utils/overviewCarImage'

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals() })
const deferred = <T>() => {
  let resolve!: (value: T) => void
  const promise = new Promise<T>(r => { resolve = r })
  return { promise, resolve }
}

it('prepares data, calendar, code and decoded image once before revealing', async () => {
  vi.useFakeTimers()
  const image = deferred<void>()
  const data = { lastCar: { rawName: 'ferrari_296' } } as any
  const deps = { projection: vi.fn(async () => data), events: vi.fn(async () => []), image: vi.fn(() => image.promise), code: vi.fn(async () => {}) }
  const entry = prepareOverviewEntry('A', deps)
  const ready = vi.fn()
  void entry.ready.then(ready)
  await vi.advanceTimersByTimeAsync(0)
  expect(ready).not.toHaveBeenCalled()
  expect(deps.image).toHaveBeenCalledWith(data)
  image.resolve()
  await entry.ready
  expect(await entry.projection).toBe(data)
  expect(await entry.events).toEqual([])
  expect(deps.projection).toHaveBeenCalledTimes(1)
  expect(deps.events).toHaveBeenCalledTimes(1)
  expect(entry.takeProjection('B')).toBeUndefined()
  expect(entry.takeEvents('B')).toBeUndefined()
  expect(entry.takeProjection('A')).toBe(entry.projection)
  expect(entry.takeEvents('A')).toBe(entry.events)
  expect(entry.takeProjection('A')).toBeUndefined()
  expect(entry.takeEvents('A')).toBeUndefined()
  expect(vi.getTimerCount()).toBe(0)
})

it('bounds the wait and lets the mounted page reuse the still pending request', async () => {
  vi.useFakeTimers()
  const projection = deferred<any>()
  const load = vi.fn(() => projection.promise)
  const entry = prepareOverviewEntry('A', { projection: load, events: async () => [], image: async () => {}, code: async () => {} })
  const ready = vi.fn()
  void entry.ready.then(ready)
  await vi.advanceTimersByTimeAsync(2499)
  expect(ready).not.toHaveBeenCalled()
  await vi.advanceTimersByTimeAsync(1)
  expect(ready).toHaveBeenCalledOnce()
  projection.resolve(null)
  expect(await entry.projection).toBeNull()
  expect(load).toHaveBeenCalledOnce()
})

it('contains preparation failures while preserving the original error for view retry', async () => {
  const error = new Error('offline')
  const entry = prepareOverviewEntry('B', { projection: async () => { throw error }, events: async () => { throw error }, image: async () => {}, code: async () => { throw error } })
  await expect(entry.ready).resolves.toBeUndefined()
  await expect(entry.projection).rejects.toBe(error)
  await expect(entry.events).rejects.toBe(error)
})

it('decodes the selected image and keeps car aliases and default fallback', async () => {
  const decode = vi.fn(async () => {})
  let source = ''
  vi.stubGlobal('Image', class { set src(value: string) { source = value } decode = decode })
  await decodeOverviewImage(getOverviewCarImage('Ferrari_296_GT3'))
  expect(source).toContain('ferrari_296_gt3.png')
  expect(decode).toHaveBeenCalledOnce()
  expect(getOverviewCarImage('AMR V8')).toContain('aston_martin_gt3.png')
  expect(getOverviewCarImage(null)).toContain('default_gt3.png')
  expect(getOverviewCarImage('unknown')).toContain('default_gt3.png')
})
