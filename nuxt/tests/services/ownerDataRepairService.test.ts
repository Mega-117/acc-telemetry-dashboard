import { describe, expect, it, vi } from 'vitest'
import {
  isLegacyTrackBestProjectionDoc,
  runOwnerProjectionRepairWrites
} from '~/services/sync/ownerDataRepairService'

describe('isLegacyTrackBestProjectionDoc', () => {
  it('considera legacy un trackBests con schema corrente ma bestRulesVersion vecchia', () => {
    expect(isLegacyTrackBestProjectionDoc({ version: 4, bestRulesVersion: 3 })).toBe(true)
  })

  it('considera legacy un trackBests con schema vecchio anche se bestRulesVersion corrente', () => {
    expect(isLegacyTrackBestProjectionDoc({ version: 3, bestRulesVersion: 5 })).toBe(true)
  })

  it('accetta solo trackBests con schema e regole correnti', () => {
    expect(isLegacyTrackBestProjectionDoc({ version: 4, bestRulesVersion: 5 })).toBe(false)
  })
})

describe('runOwnerProjectionRepairWrites', () => {
  it('crea la directory completa prima della patch incrementale', async () => {
    const order: string[] = []
    const wrote = await runOwnerProjectionRepairWrites({
      writeFullPilotDirectory: vi.fn(async () => {
        order.push('directory')
      }),
      writeUserProjection: vi.fn(async () => {
        order.push('user-projection')
      })
    })

    expect(wrote).toBe(true)
    expect(order).toEqual(['directory', 'user-projection'])
  })

  it('mantiene riparabile la projection utente se il mirror directory fallisce', async () => {
    const writeUserProjection = vi.fn(async () => undefined)
    const wrote = await runOwnerProjectionRepairWrites({
      writeFullPilotDirectory: vi.fn(async () => {
        throw new Error('directory unavailable')
      }),
      writeUserProjection
    })

    expect(wrote).toBe(false)
    expect(writeUserProjection).toHaveBeenCalledOnce()
  })
})
