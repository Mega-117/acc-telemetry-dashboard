import { afterEach, describe, expect, it, vi } from 'vitest'
import { readChatterboxRuntimeStatus } from '../../server/utils/chatterboxRuntimeStatus'

afterEach(() => vi.unstubAllGlobals())

describe('readChatterboxRuntimeStatus', () => {
  it('riconosce un runtime pronto', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(JSON.stringify({
      ok: true,
      readiness: { message: 'Pronto.' },
    }), { status: 200 })))

    await expect(readChatterboxRuntimeStatus()).resolves.toMatchObject({ state: 'online', message: 'Pronto.' })
  })

  it('distingue caricamento ed errore del modello', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response(JSON.stringify({ readiness: { message: 'Carico.' } }), { status: 503 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ readiness: { error: 'Dipendenza mancante.' } }), { status: 500 }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(readChatterboxRuntimeStatus()).resolves.toMatchObject({ state: 'starting', message: 'Carico.' })
    await expect(readChatterboxRuntimeStatus()).resolves.toMatchObject({ state: 'error', message: 'Dipendenza mancante.' })
  })

  it('degrada a offline quando il server non risponde', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')))
    await expect(readChatterboxRuntimeStatus()).resolves.toMatchObject({ state: 'offline', message: 'ECONNREFUSED' })
  })
})
