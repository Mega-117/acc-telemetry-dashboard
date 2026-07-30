import { describe, expect, it, vi } from 'vitest'
import {
  buildRuntimeWindowSnapshot,
  isRuntimeWindowOwner,
  publishRuntimeWindowSnapshot,
  requestRuntimeWindowManualSync
} from '~/services/runtime/runtimeWindowBridge'

const state = {
  phase: 'ready' as const,
  capabilities: {
    localRead: { allowed: true, reason: 'local_invariant' as const }
  },
  events: [{
    schemaVersion: 1 as const,
    id: 'private:1:bootstrap_ready',
    coordinatorKey: 'private',
    kind: 'progress' as const,
    code: 'bootstrap_ready',
    phase: 'ready' as const,
    occurredAt: '2026-07-30T18:00:00.000Z',
    notifyNative: false,
    openUi: false as const
  }]
}

describe('runtimeWindowBridge', () => {
  it('distingue owner e consumer senza inferenze dalla route', () => {
    expect(isRuntimeWindowOwner({ runtimeBootstrapRole: 'owner' })).toBe(true)
    expect(isRuntimeWindowOwner({ runtimeBootstrapRole: 'consumer' })).toBe(false)
  })

  it('pubblica uno snapshot V1 senza identity privata', async () => {
    const publishRuntimeBootstrapState = vi.fn().mockResolvedValue({ ok: true })
    expect(await publishRuntimeWindowSnapshot({
      runtimeBootstrapRole: 'owner',
      publishRuntimeBootstrapState
    }, state)).toBe(true)

    expect(publishRuntimeBootstrapState).toHaveBeenCalledWith({
      schemaVersion: 1,
      lifecycle: 'ready',
      phase: 'ready',
      capabilities: state.capabilities,
      reasonCode: null,
      lastEvent: {
        kind: 'progress',
        code: 'bootstrap_ready',
        phase: 'ready'
      },
      migrationProgress: null
    })
    expect(buildRuntimeWindowSnapshot(state)).not.toHaveProperty('coordinatorKey')
  })

  it('inoltra manual sync solo dal consumer', async () => {
    const requestRuntimeBootstrapCommand = vi.fn().mockResolvedValue({
      schemaVersion: 1,
      status: 'accepted',
      reasonCode: null
    })
    await expect(requestRuntimeWindowManualSync({
      runtimeBootstrapRole: 'consumer',
      requestRuntimeBootstrapCommand
    })).resolves.toMatchObject({ status: 'accepted' })
    expect(requestRuntimeBootstrapCommand).toHaveBeenCalledWith({
      schemaVersion: 1,
      type: 'manual-sync'
    })

    await expect(requestRuntimeWindowManualSync({
      runtimeBootstrapRole: 'owner',
      requestRuntimeBootstrapCommand
    })).resolves.toBeNull()
    expect(requestRuntimeBootstrapCommand).toHaveBeenCalledTimes(1)
  })
})
