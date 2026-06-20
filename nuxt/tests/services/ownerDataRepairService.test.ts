import { describe, expect, it } from 'vitest'
import { isLegacyTrackBestProjectionDoc } from '~/services/sync/ownerDataRepairService'

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