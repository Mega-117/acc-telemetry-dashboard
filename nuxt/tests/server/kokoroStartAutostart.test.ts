import { afterEach, describe, expect, it, vi } from 'vitest'
const mocks = vi.hoisted(() => ({ start: vi.fn(), stop: vi.fn() }))
vi.mock('../../server/utils/managedKokoro', () => ({ managedKokoro: () => mocks }))
describe('managed Kokoro dev endpoints', () => {
  afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); vi.resetModules(); vi.resetAllMocks() })
  async function handler(file: 'start' | 'stop') {
    vi.stubGlobal('defineEventHandler', (fn: unknown) => fn)
    vi.stubGlobal('createError', (value: object) => Object.assign(new Error('request error'), value))
    return file === 'start' ? (await import('../../server/api/dev/kokoro-start.post')).default : (await import('../../server/api/dev/kokoro-stop.post')).default
  }
  it('starts through the shared managed controller', async () => {
    mocks.start.mockResolvedValue({ status: 'starting' })
    await expect((await handler('start'))({} as never)).resolves.toEqual({ status: 'starting' })
    expect(mocks.start).toHaveBeenCalledTimes(1)
  })
  it('reports an incompatible runtime rather than spawning a fallback', async () => {
    mocks.start.mockResolvedValue({ status: 'error', message: 'incompatible' })
    await expect((await handler('start'))({} as never)).rejects.toMatchObject({ statusCode: 503 })
  })
  it('uses managed ownership when stopping', async () => {
    mocks.stop.mockReturnValue({ status: 'not-managed' })
    await expect((await handler('stop'))({} as never)).resolves.toEqual({ status: 'not-managed' })
  })
  it.each(['start', 'stop'] as const)('rejects production %s before lifecycle calls', async operation => {
    vi.stubEnv('NODE_ENV', 'production')
    await expect((await handler(operation))({} as never)).rejects.toMatchObject({ statusCode: 404 })
    expect(mocks.start).not.toHaveBeenCalled(); expect(mocks.stop).not.toHaveBeenCalled()
  })
})
