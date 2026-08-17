import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  runGate: vi.fn(),
  completeAfterSync: vi.fn()
}))

vi.mock('~/services/sync/ownerDataMaintenanceService', () => ({
  runOwnerDataMaintenanceGate: mocks.runGate,
  completeOwnerDataMaintenanceAfterLocalSync: mocks.completeAfterSync
}))

import { useOwnerDataMaintenance } from '~/composables/useOwnerDataMaintenance'

describe('useOwnerDataMaintenance lease wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useOwnerDataMaintenance().resetMaintenanceState()
    mocks.runGate.mockResolvedValue({ status: 'completed' })
    mocks.completeAfterSync.mockResolvedValue({ status: 'completed' })
  })

  it('inoltra lo stesso assertActive al gate e al completamento post-sync', async () => {
    const assertActive = vi.fn()
    const maintenance = useOwnerDataMaintenance()

    await maintenance.runGate('uid-a', { assertActive })
    await maintenance.completeAfterLocalSync('uid-a', { assertActive })

    expect(mocks.runGate).toHaveBeenCalledWith(expect.objectContaining({
      uid: 'uid-a',
      assertActive
    }))
    expect(mocks.completeAfterSync).toHaveBeenCalledWith(expect.objectContaining({
      uid: 'uid-a',
      assertActive
    }))
  })

  it('proietta progresso e report senza sostituire la guardia chiamante', async () => {
    const assertActive = vi.fn()
    const report = { status: 'completed', phase: 'completed' }
    mocks.runGate.mockImplementation(async (options) => {
      options.onProgress({
        status: 'running',
        phase: 'rebuild',
        progress: 70,
        message: 'Ricostruzione',
        report
      })
      return report
    })
    const maintenance = useOwnerDataMaintenance()

    await maintenance.runGate('uid-a', { assertActive })

    expect(maintenance.status.value).toBe('running')
    expect(maintenance.phase.value).toBe('rebuild')
    expect(maintenance.progress.value).toBe(70)
    expect(maintenance.report.value).toEqual(report)
    expect(mocks.runGate.mock.calls[0][0].assertActive).toBe(assertActive)
  })
})
