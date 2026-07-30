import { describe, expect, it, vi } from 'vitest'
import { createRuntimeBootstrapCoordinator } from '~/services/runtime/runtimeBootstrapCoordinator'

function context(overrides: Record<string, unknown> = {}) {
  return {
    coordinatorKey: 'coordinator-key-1',
    network: 'online' as const,
    auth: 'ready' as const,
    health: 'unknown' as const,
    compatibility: 'write_critical' as const,
    ...overrides
  }
}

describe('runtimeBootstrapCoordinator', () => {
  it('serializza update, migration e sync', async () => {
    const order: string[] = []
    const result = await createRuntimeBootstrapCoordinator().run(context(), {
      checkUpdate: async () => { order.push('update'); return { status: 'current' } },
      migrate: async () => { order.push('migration'); return { status: 'healthy' } },
      sync: async () => { order.push('sync'); return 'synced' }
    })
    expect(order).toEqual(['update', 'migration', 'sync'])
    expect(result).toMatchObject({ phase: 'ready', syncResult: 'synced' })
  })

  it('si ferma al restart boundary', async () => {
    const migrate = vi.fn()
    const sync = vi.fn()
    const result = await createRuntimeBootstrapCoordinator().run(context(), {
      checkUpdate: async () => ({ status: 'updated_restart_required' }), migrate, sync
    })
    expect(result.phase).toBe('restart_required')
    expect(migrate).not.toHaveBeenCalled()
    expect(sync).not.toHaveBeenCalled()
  })

  it('continua col runtime corrente e classifica una sola notifica update per boot', async () => {
    const notifications: string[] = []
    const coordinator = createRuntimeBootstrapCoordinator()
    const operations = {
      checkUpdate: async () => ({ status: 'failed' as const, errorCode: 'network' }),
      migrate: async () => ({ status: 'healthy' as const }),
      sync: async () => 'ok',
      onEvent: (event: { code: string; notifyNative: boolean }) => {
        if (event.notifyNative) notifications.push(event.code)
      }
    }
    expect((await coordinator.run(context(), operations)).phase).toBe('ready')
    expect((await coordinator.run(context(), operations)).phase).toBe('ready')
    expect(notifications).toEqual(['update_failed_current_runtime_continues'])
  })

  it('condivide la promise tra trigger concorrenti della stessa installazione', async () => {
    let releaseUpdate!: () => void
    const wait = new Promise<void>((resolve) => { releaseUpdate = resolve })
    const checkUpdate = vi.fn(async () => { await wait; return { status: 'current' as const } })
    const coordinator = createRuntimeBootstrapCoordinator()
    const operations = {
      checkUpdate,
      migrate: async () => ({ status: 'healthy' as const }),
      sync: async () => 'ok'
    }
    const first = coordinator.run(context(), operations)
    const second = coordinator.run(context(), operations)
    releaseUpdate()
    expect(first).toBe(second)
    await first
    expect(checkUpdate).toHaveBeenCalledTimes(1)
  })

  it('riprende online dopo un bootstrap offline senza toccare il locale', async () => {
    const order: string[] = []
    const coordinator = createRuntimeBootstrapCoordinator()
    const operations = {
      checkUpdate: async () => { order.push('update'); return { status: 'current' as const } },
      migrate: async () => { order.push('migration'); return { status: 'healthy' as const } },
      sync: async () => { order.push('sync'); return 'ok' }
    }
    const offline = await coordinator.run(context({ network: 'offline', auth: 'pending' }), operations)
    expect(offline.capabilities.localWrite.state).toBe('allowed')
    expect(offline.capabilities.sync.state).toBe('pending')
    expect(order).toEqual([])
    expect((await coordinator.run(context(), operations)).phase).toBe('ready')
    expect(order).toEqual(['update', 'migration', 'sync'])
  })

  it('non sincronizza partial e notifica un errore migration persistente', async () => {
    const coordinator = createRuntimeBootstrapCoordinator()
    const partialSync = vi.fn()
    const partial = await coordinator.run(context(), {
      checkUpdate: async () => ({ status: 'current' }),
      migrate: async () => ({ status: 'partial' }),
      sync: partialSync
    })
    const blocked = await coordinator.run(context({ coordinatorKey: 'coordinator-key-2' }), {
      checkUpdate: async () => ({ status: 'current' }),
      migrate: async () => ({ status: 'blocked', persistent: true, errorCode: 'permission_denied' }),
      sync: vi.fn()
    })
    expect(partial.phase).toBe('degraded')
    expect(partialSync).not.toHaveBeenCalled()
    expect(blocked.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ code: 'migration_persistent_failure', notifyNative: true, openUi: false })
    ]))
  })

  it('pubblica progresso monotono e usa il sync solo per partial recuperabile', async () => {
    const progressSnapshots: number[] = []
    const coordinator = createRuntimeBootstrapCoordinator()
    const sync = vi.fn(async () => 'recovery-uploaded')
    let migrationRun = 0
    const result = await coordinator.run(context(), {
      checkUpdate: async () => ({ status: 'current' }),
      migrate: async (onProgress) => {
        migrationRun += 1
        await onProgress({ phase: 'audit', progress: 20, status: 'running' })
        await onProgress({
          phase: 'final_verification',
          progress: 90,
          status: 'sync_pending',
          resumedFrom: 'partial'
        })
        if (migrationRun > 1) {
          return {
            status: 'healthy' as const,
            compatibility: { mode: 'write_critical' as const, trusted: true, issues: [] }
          }
        }
        return {
          status: 'partial',
          issues: ['raw_data_unavailable'],
          compatibility: {
            mode: 'write_critical' as const,
            trusted: true,
            issues: ['raw_data_unavailable']
          }
        }
      },
      sync,
      onEvent: (event) => {
        if (event.code === 'migration_progress') {
          progressSnapshots.push(coordinator.getSnapshot().migrationProgress?.progress || 0)
        }
      }
    })
    expect(progressSnapshots).toEqual([20, 90, 90, 90])
    expect(sync).toHaveBeenCalledOnce()
    expect(result).toMatchObject({
      phase: 'ready',
      syncResult: 'recovery-uploaded',
      migrationProgress: { progress: 90, resumedFrom: 'partial' }
    })
    expect(result.capabilities.sync.state).toBe('allowed')
  })

  it('impedisce a un risultato stale di sostituire lo snapshot nuovo', async () => {
    let releaseOld!: () => void
    const oldWait = new Promise<void>((resolve) => { releaseOld = resolve })
    const coordinator = createRuntimeBootstrapCoordinator()
    const oldRun = coordinator.run(context(), {
      checkUpdate: async () => { await oldWait; return { status: 'current' } },
      migrate: async () => ({ status: 'blocked', persistent: true }),
      sync: vi.fn()
    })
    coordinator.invalidate('coordinator-key-1')
    const newRun = await coordinator.run(context(), {
      checkUpdate: async () => ({ status: 'current' }),
      migrate: async () => ({ status: 'healthy' }),
      sync: async () => 'new'
    })
    releaseOld()
    await oldRun
    expect(newRun.phase).toBe('ready')
    expect(coordinator.getSnapshot().phase).toBe('ready')
  })
})
