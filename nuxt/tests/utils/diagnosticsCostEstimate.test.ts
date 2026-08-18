import { describe, expect, it } from 'vitest'
import {
  DIAGNOSTICS_ESTIMATE_SAFE_MAX,
  estimateDiagnosticsCleanup,
  estimateDiagnosticsCount,
  estimateDiagnosticsPages
} from '~/utils/diagnosticsCostEstimate'

describe('diagnosticsCostEstimate', () => {
  it('dichiara i massimi verificabili per count, pagine e cleanup', () => {
    expect(estimateDiagnosticsCount(1001)).toEqual({
      estimatedReads: 2,
      estimatedWrites: 0,
      maxEstimatedReads: 2,
      maxEstimatedWrites: 0
    })
    expect(estimateDiagnosticsPages(20, 50)).toMatchObject({
      maxEstimatedReads: 2000,
      maxEstimatedWrites: 0
    })
    expect(estimateDiagnosticsCleanup(5, 200)).toMatchObject({
      maxEstimatedReads: 1000,
      maxEstimatedWrites: 1000
    })
  })

  it('normalizza negativi e satura overflow/non-finiti senza wrap', () => {
    expect(estimateDiagnosticsPages(-1, 50).estimatedReads).toBe(0)
    expect(estimateDiagnosticsCleanup(Number.POSITIVE_INFINITY, 200).estimatedReads)
      .toBe(DIAGNOSTICS_ESTIMATE_SAFE_MAX)
    expect(estimateDiagnosticsPages(Number.MAX_SAFE_INTEGER, 2).estimatedReads)
      .toBe(DIAGNOSTICS_ESTIMATE_SAFE_MAX)
  })
})
