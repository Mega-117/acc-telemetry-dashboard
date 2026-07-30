import { describe, expect, it } from 'vitest'
import { deriveRuntimeUiModel } from '~/services/runtime/rendererRuntimeBootstrapAdapter'

function snapshot(input: Record<string, unknown>) {
  return {
    lifecycle: 'ready',
    phase: 'ready',
    capabilities: {
      localRead: { state: 'allowed', reason: 'offline_local_invariant' },
      localWrite: { state: 'allowed', reason: 'offline_local_invariant' },
      localProcessing: { state: 'allowed', reason: 'offline_local_invariant' },
      cloudRead: { state: 'allowed', reason: 'healthy' },
      cloudWrite: { state: 'allowed', reason: 'healthy' },
      sync: { state: 'allowed', reason: 'healthy' },
      migrate: { state: 'not_required', reason: 'healthy' },
      remoteHealth: { state: 'allowed', reason: 'healthy' }
    },
    ...input
  }
}

describe('runtime UI capability adapter', () => {
  it('non trasforma partial in un blocco globale', () => {
    const model = deriveRuntimeUiModel(snapshot({
      migrationProgress: { status: 'partial', phase: 'rebuild', progress: 64 },
      capabilities: {
        localRead: { state: 'allowed', reason: 'offline_local_invariant' },
        localWrite: { state: 'allowed', reason: 'offline_local_invariant' },
        localProcessing: { state: 'allowed', reason: 'offline_local_invariant' },
        cloudRead: { state: 'allowed', reason: 'migration_read_compatible' },
        cloudWrite: { state: 'pending', reason: 'migration_partial_resume' },
        sync: { state: 'pending', reason: 'migration_partial_resume' }
      }
    }), 'electron')

    expect(model.status).toBe('partial')
    expect(model.progress).toBe(64)
    expect(model.gates.localWrite.allowed).toBe(true)
    expect(model.gates.cloudRead.allowed).toBe(true)
    expect(model.gates.cloudWrite.allowed).toBe(false)
    expect(model.gates.sync.allowed).toBe(false)
  })

  it('distingue offline trusted read da write e sync pending', () => {
    const model = deriveRuntimeUiModel(snapshot({
      capabilities: {
        localRead: { state: 'allowed', reason: 'offline_local_invariant' },
        localWrite: { state: 'allowed', reason: 'offline_local_invariant' },
        localProcessing: { state: 'allowed', reason: 'offline_local_invariant' },
        cloudRead: { state: 'allowed', reason: 'offline_trusted_cached_read' },
        cloudWrite: { state: 'pending', reason: 'offline_cloud_pending' },
        sync: { state: 'pending', reason: 'offline_cloud_pending' }
      }
    }), 'electron')

    expect(model.status).toBe('offline')
    expect(model.gates.cloudRead.allowed).toBe(true)
    expect(model.gates.cloudWrite.message).toContain('connessione')
    expect(model.gates.sync.allowed).toBe(false)
  })

  it.each([
    ['future', 'future_schema_guard'],
    ['blocked', 'migration_persistent_failure']
  ] as const)('espone %s senza falso healthy', (expected, reason) => {
    const model = deriveRuntimeUiModel(snapshot({
      capabilities: {
        localRead: { state: 'allowed', reason: 'offline_local_invariant' },
        cloudRead: { state: 'blocked', reason },
        cloudWrite: { state: 'blocked', reason },
        sync: { state: 'blocked', reason }
      }
    }), 'electron')
    expect(model.status).toBe(expected)
    expect(model.visible).toBe(true)
    expect(model.gates.localRead.allowed).toBe(true)
  })

  it('lascia il browser compatibile senza fingere uno snapshot Electron healthy', () => {
    const model = deriveRuntimeUiModel(null, 'browser')
    expect(model.visible).toBe(false)
    expect(model.source).toBe('browser')
    expect(model.gates.cloudWrite.reason).toBe('browser_runtime_unmanaged')
  })
})
