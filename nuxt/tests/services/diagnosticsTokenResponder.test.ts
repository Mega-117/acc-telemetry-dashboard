import { describe, expect, it, vi } from 'vitest'
import { createDiagnosticsTokenResponder } from '~/services/monitoring/diagnosticsTokenResponder'

describe('diagnosticsTokenResponder', () => {
  it('risponde con il token dell\'utente corrente', async () => {
    const reply = vi.fn()
    const respond = createDiagnosticsTokenResponder({
      getUser: () => ({ uid: 'u1', getIdToken: async () => 'a.b.c' }),
      isAllowed: () => true,
      reply
    })
    await respond('r1')
    expect(reply).toHaveBeenCalledWith('r1', 'a.b.c')
  })

  it('risponde null senza utente, senza permesso o con token vuoto', async () => {
    const reply = vi.fn()
    await createDiagnosticsTokenResponder({ getUser: () => null, isAllowed: () => true, reply })('r1')
    await createDiagnosticsTokenResponder({
      getUser: () => ({ uid: 'u1', getIdToken: async () => 'a.b.c' }), isAllowed: () => false, reply
    })('r2')
    await createDiagnosticsTokenResponder({
      getUser: () => ({ uid: 'u1', getIdToken: async () => '' }), isAllowed: () => true, reply
    })('r3')
    expect(reply.mock.calls).toEqual([['r1', null], ['r2', null], ['r3', null]])
  })

  it('PIP-567: con forceRefresh chiede a Firebase un token nuovo, altrimenti quello in cache', async () => {
    const reply = vi.fn()
    const getIdToken = vi.fn(async (force?: boolean) => (force ? 'fresh.b.c' : 'cached.b.c'))
    const respond = createDiagnosticsTokenResponder({ getUser: () => ({ uid: 'u1', getIdToken }), isAllowed: () => true, reply })
    await respond('r1')
    await respond('r2', { forceRefresh: true })
    await respond('r3', {})
    expect(getIdToken.mock.calls).toEqual([[], [true], []])
    expect(reply.mock.calls).toEqual([['r1', 'cached.b.c'], ['r2', 'fresh.b.c'], ['r3', 'cached.b.c']])
  })

  it('non propaga errori di getIdToken o di reply', async () => {
    const reply = vi.fn().mockRejectedValue(new Error('ipc'))
    const respond = createDiagnosticsTokenResponder({
      getUser: () => ({ uid: 'u1', getIdToken: async () => { throw new Error('offline') } }),
      isAllowed: () => true,
      reply
    })
    await expect(respond('r1')).resolves.toBeUndefined()
    expect(reply).toHaveBeenCalledWith('r1', null)
  })
})
