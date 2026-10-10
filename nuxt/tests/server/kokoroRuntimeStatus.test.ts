import { afterEach, describe, expect, it, vi } from 'vitest'
import { readKokoroRuntimeStatus } from '../../server/utils/kokoroRuntimeStatus'
const mocks = vi.hoisted(() => ({ readStatus: vi.fn(), get: vi.fn() }))
vi.mock('../../server/utils/managedKokoro', () => ({ managedKokoro: mocks.get }))
describe('managed Kokoro status', () => {
  afterEach(() => vi.resetAllMocks())
  it.each(['online', 'starting', 'offline', 'error'])('preserves %s from the shared identity-aware controller', async state => {
    mocks.get.mockReturnValue({ readStatus: mocks.readStatus })
    mocks.readStatus.mockResolvedValue({ state, message: 'observed' })
    await expect(readKokoroRuntimeStatus()).resolves.toEqual({ state, message: 'observed' })
  })
  it('does not fall back to an arbitrary local service when configuration is missing', async () => {
    mocks.get.mockImplementation(() => { throw Error('root missing') })
    await expect(readKokoroRuntimeStatus()).resolves.toEqual({ state: 'error', message: 'root missing' })
  })
})
