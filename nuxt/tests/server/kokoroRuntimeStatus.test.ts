import { afterEach, describe, expect, it, vi } from 'vitest'
import { readKokoroRuntimeStatus } from '../../server/utils/kokoroRuntimeStatus'

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}

function wavResponse(status = 200) {
  return new Response(new Uint8Array([82, 73, 70, 70, 1, 2, 3, 4]), {
    status,
    headers: { 'Content-Type': 'audio/wav' },
  })
}

describe('kokoroRuntimeStatus', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('riconosce un server nuovo quando /ready risponde pronto', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({
      readiness: { message: 'ready' },
      voices: [{ id: 'if_sara' }],
    }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(readKokoroRuntimeStatus()).resolves.toEqual({
      state: 'online',
      message: 'ready',
      voices: [{ id: 'if_sara' }],
      managed: false,
      managedPid: null,
    })
  })

  it('mantiene lo stato starting quando /ready risponde 503', async () => {
    const fetchMock = vi.fn().mockResolvedValueOnce(jsonResponse({
      readiness: { message: 'warming' },
    }, 503))
    vi.stubGlobal('fetch', fetchMock)

    await expect(readKokoroRuntimeStatus()).resolves.toEqual({
      state: 'starting',
      message: 'warming',
    })
  })

  it('supporta un server legacy senza /ready se /speak genera audio', async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(jsonResponse({ error: 'Not found' }, 404))
      .mockResolvedValueOnce(wavResponse())
      .mockResolvedValueOnce(jsonResponse({ voices: [{ id: 'if_sara' }, { id: 'im_nicola' }] }))
    vi.stubGlobal('fetch', fetchMock)

    await expect(readKokoroRuntimeStatus()).resolves.toEqual({
      state: 'online',
      message: 'Server Kokoro legacy online: sintesi verificata.',
      voices: [{ id: 'if_sara' }, { id: 'im_nicola' }],
      managed: false,
      managedPid: null,
    })
  })

  it('segnala offline quando il server non risponde', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValueOnce(new Error('connection refused')))

    await expect(readKokoroRuntimeStatus()).resolves.toEqual({
      state: 'offline',
      message: 'connection refused',
    })
  })
})
