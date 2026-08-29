import { describe, expect, it, vi } from 'vitest'
import { createRetryableSingleFlightLoader } from '~/services/auth/retryableSingleFlightLoader'

describe('retryable single-flight loader', () => {
  it('condivide una sola richiesta mentre il caricamento è in corso', async () => {
    let resolve!: (value: string) => void
    const source = vi.fn(() => new Promise<string>((done) => { resolve = done }))
    const loader = createRetryableSingleFlightLoader(source)

    const first = loader.load()
    const second = loader.load()
    expect(first).toBe(second)
    expect(source).toHaveBeenCalledOnce()

    resolve('ready')
    await expect(first).resolves.toBe('ready')
  })

  it('svuota una richiesta rifiutata e consente il retry senza riavvio', async () => {
    const source = vi.fn()
      .mockRejectedValueOnce(new Error('chunk unavailable'))
      .mockResolvedValueOnce('ready')
    const loader = createRetryableSingleFlightLoader(source)

    await expect(loader.load()).rejects.toThrow('chunk unavailable')
    await expect(loader.load()).resolves.toBe('ready')
    expect(source).toHaveBeenCalledTimes(2)
  })
})
