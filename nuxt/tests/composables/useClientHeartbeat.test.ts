import { nextTick, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  auth: null as any,
  writeRuntimeReport: vi.fn()
}))

vi.mock('~/config/firebase', () => ({ db: {} }))
vi.mock('~/composables/useFirebaseAuth', () => ({
  useFirebaseAuth: () => mocks.auth
}))
vi.mock('~/composables/useFirebaseTracker', () => ({
  trackedWriteBatch: vi.fn()
}))
vi.mock('~/services/monitoring/clientRuntimeReportingService', () => ({
  writeClientRuntimeReport: mocks.writeRuntimeReport
}))

import { resetForcedHeartbeatsForTest, useClientHeartbeat } from '~/composables/useClientHeartbeat'

async function settle() {
  await nextTick()
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

describe('useClientHeartbeat', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    resetForcedHeartbeatsForTest()
    mocks.auth = {
      currentUser: ref<{ uid: string } | null>({ uid: 'pilot-a' }),
      canEnterApp: ref(true)
    }
    mocks.writeRuntimeReport.mockResolvedValue({ writes: 3, reads: 0 })
  })

  it('PIP-439: un solo invio forzato per caricamento, anche se authReady si riaccende', async () => {
    let resolveFirstIdentity!: (value: any) => void
    const firstIdentity = new Promise<any>((resolve) => { resolveFirstIdentity = resolve })
    const identity = {
      installationId: 'install-a',
      fallback: false,
      createdAt: '2026-08-18T00:00:00.000Z'
    }
    const getRuntimeIdentity = vi.fn()
      .mockReturnValueOnce(firstIdentity)
      .mockResolvedValue(identity)
    const electronAPI = {
      getRuntimeIdentity,
      getSuiteVersion: vi.fn().mockResolvedValue({ suite: '0.4.0-dev.1', channel: 'develop' }),
      onWindowFocused: vi.fn(() => vi.fn())
    }
    vi.stubGlobal('window', {
      electronAPI,
      setInterval: vi.fn(() => 1),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    })
    vi.stubGlobal('localStorage', {
      getItem: vi.fn(() => '2999-01-01T00:00:00.000Z'),
      setItem: vi.fn()
    })
    const enabled = ref(false)
    const owner = useClientHeartbeat({
      enabled,
      runtimeState: ref({ phase: 'ready', capabilities: {}, events: [], migrationProgress: null }),
      isLeaseCurrent: (uid) => uid === mocks.auth.currentUser.value?.uid
    })

    enabled.value = true
    await nextTick()
    expect(getRuntimeIdentity).toHaveBeenCalledTimes(1)
    await expect(owner.sendHeartbeat(true)).resolves.toBe(false)

    resolveFirstIdentity(identity)
    await settle()
    await vi.waitFor(() => expect(getRuntimeIdentity).toHaveBeenCalledTimes(2))
    await settle()
    // Il secondo forzato (accodato) segue la regola dei 15 minuti: localStorage dice "appena inviato".
    expect(mocks.writeRuntimeReport).toHaveBeenCalledTimes(1)

    enabled.value = false
    await nextTick()
    enabled.value = true
    await settle()
    expect(mocks.writeRuntimeReport).toHaveBeenCalledTimes(1)

    // Cambio account nello stesso caricamento: nuovo owner, nuovo invio forzato.
    mocks.auth.currentUser.value = { uid: 'pilot-b' }
    await settle()
    await vi.waitFor(() => expect(mocks.writeRuntimeReport).toHaveBeenCalledTimes(2))

    vi.unstubAllGlobals()
  })
})
