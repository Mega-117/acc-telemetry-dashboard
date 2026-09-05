import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  runGate: vi.fn(),
  completeAfterSync: vi.fn()
}))

vi.mock('~/services/sync/ownerDataMaintenanceService', () => ({
  runOwnerDataMaintenanceGate: mocks.runGate,
  describeOwnerMaintenanceError: () => ({ reason: 'quota_exceeded', message: 'Limite temporaneo, riprova più tardi.' }),
  completeOwnerDataMaintenanceAfterLocalSync: mocks.completeAfterSync
}))

import { useOwnerDataMaintenance } from '~/composables/useOwnerDataMaintenance'

describe('useOwnerDataMaintenance lease wiring', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    useOwnerDataMaintenance().resetMaintenanceState()
    useOwnerDataMaintenance().setBrowserOwner(null)
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

  it('non proietta progresso intermedio durante un retry background ma applica il terminale', async () => {
    const maintenance = useOwnerDataMaintenance()
    const onProgress = vi.fn()
    mocks.runGate.mockImplementation(async (options) => {
      options.onProgress({
        status: 'running',
        phase: 'cloud_reprocess',
        progress: 40,
        message: 'Retry in background'
      })
      options.onProgress({
        status: 'completed',
        phase: 'completed',
        progress: 100,
        message: 'Completato'
      })
      return { status: 'completed' }
    })

    await maintenance.runGate('uid-a', { presentationMode: 'background', onProgress })

    expect(maintenance.status.value).toBe('completed')
    expect(maintenance.phase.value).toBe('completed')
    expect(maintenance.progress.value).toBe(100)
    expect(onProgress).toHaveBeenCalledTimes(2)
  })

  it('contiene il rifiuto browser, condivide il tentativo e consente riprova dopo errore', async () => {
    const maintenance = useOwnerDataMaintenance()
    maintenance.setBrowserOwner('uid-a')
    mocks.runGate.mockRejectedValueOnce(new Error('Quota exceeded.'))
    const first = maintenance.runBrowserGate('uid-a')
    expect(maintenance.runBrowserGate('uid-a')).toBe(first)
    await expect(first).resolves.toBeNull()
    expect(mocks.runGate).toHaveBeenCalledOnce()
    expect(maintenance.status.value).toBe('failed')
    expect(maintenance.report.value).toBeNull()
    await expect(maintenance.runBrowserGate('uid-a')).resolves.toMatchObject({ status: 'completed' })
    expect(mocks.runGate).toHaveBeenCalledTimes(2)
  })

  it('invalida il vecchio owner e ignora progresso e fallimenti tardivi dopo logout/relogin', async () => {
    const maintenance = useOwnerDataMaintenance()
    maintenance.setBrowserOwner('uid-a')
    let rejectOld!: (reason: unknown) => void
    mocks.runGate.mockImplementationOnce(() => new Promise((_resolve, reject) => { rejectOld = reject }))
    const old = maintenance.runBrowserGate('uid-a')
    await Promise.resolve()
    const oldOptions = mocks.runGate.mock.calls[0][0]
    maintenance.setBrowserOwner(null)
    maintenance.setBrowserOwner('uid-a')
    expect(() => oldOptions.assertActive()).toThrow('cloud_owner_lease_stale')
    expect(() => oldOptions.onProgress({ status: 'completed', progress: 100 })).toThrow('cloud_owner_lease_stale')
    rejectOld(new Error('old failure'))
    await old
    expect(maintenance.status.value).toBe('idle')
    await maintenance.runBrowserGate('uid-a')
    expect(mocks.runGate).toHaveBeenCalledTimes(2)
    await expect(maintenance.runBrowserGate('uid-other')).resolves.toBeNull()
  })
})
