import { describe, expect, it, vi } from 'vitest'
import {
  buildRendererBootstrapContext,
  canRunBootstrapSync,
  recordRendererBootstrapEvent,
  resolveMaintenanceMigrationResult,
  resolveRendererUpdateResult
} from '~/services/runtime/rendererRuntimeBootstrapAdapter'

describe('rendererRuntimeBootstrapAdapter', () => {
  it('riusa identity PIP-283, auth e rete senza inventare fonti', async () => {
    const context = await buildRendererBootstrapContext({
      electronAPI: { getRuntimeIdentity: async () => ({ coordinatorKey: 'canonical-key' }) },
      uid: 'uid-1',
      canEnterApp: true,
      isOnline: false
    })
    expect(context).toMatchObject({
      coordinatorKey: 'canonical-key', network: 'offline', auth: 'ready', compatibility: 'write_critical'
    })
  })

  it('mappa current.json pending/failure e maintenance senza falso healthy', () => {
    expect(resolveRendererUpdateResult({ updateState: 'pending' }).status).toBe('updated_restart_required')
    expect(resolveRendererUpdateResult({
      bootstrapUpdate: { status: 'failed', failure: { phase: 'manifest', errorType: 'network' } }
    })).toEqual({ status: 'failed', errorCode: 'manifest:network' })
    expect(resolveMaintenanceMigrationResult({ status: 'skipped', healthStatus: 'partial' }).status)
      .toBe('partial')
    expect(resolveMaintenanceMigrationResult({ status: 'skipped' }).status).toBe('partial')
    expect(canRunBootstrapSync({ capabilities: { sync: { state: 'pending' } } })).toBe(false)
    expect(canRunBootstrapSync({ capabilities: { sync: { state: 'allowed' } } })).toBe(true)
  })

  it('persiste solo eventi tecnici sanitizzati e non apre la UI', async () => {
    const captureDiagnostic = vi.fn(async () => true)
    await recordRendererBootstrapEvent({ captureDiagnostic }, {
      schemaVersion: 1,
      id: 'event-1',
      coordinatorKey: 'not-forwarded',
      kind: 'native_notification',
      code: 'migration_persistent_failure',
      phase: 'degraded',
      occurredAt: '2026-07-30T18:00:00Z',
      notifyNative: true,
      openUi: false
    })
    expect(captureDiagnostic).toHaveBeenCalledWith(expect.objectContaining({
      component: 'runtime-bootstrap',
      code: 'bootstrap.migration_persistent_failure',
      context: expect.objectContaining({ notifyNative: true, openUi: false })
    }))
    expect(JSON.stringify(captureDiagnostic.mock.calls[0][0])).not.toContain('not-forwarded')
  })
})
