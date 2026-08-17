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

import { useClientHeartbeat } from '~/composables/useClientHeartbeat'

async function settle() {
  await nextTick()
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

describe('useClientHeartbeat', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.auth = {
      currentUser: ref<{ uid: string } | null>({ uid: 'pilot-a' }),
      canEnterApp: ref(true)
    }
    mocks.writeRuntimeReport.mockResolvedValue({ writes: 3, reads: 0 })
  })

  it('preserva il force di un heartbeat accodato durante authReady', async () => {
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
      isLeaseCurrent: (uid) => uid === 'pilot-a'
    })

    enabled.value = true
    await nextTick()
    expect(getRuntimeIdentity).toHaveBeenCalledTimes(1)
    await expect(owner.sendHeartbeat(true)).resolves.toBe(false)

    resolveFirstIdentity(identity)
    await settle()
    await vi.waitFor(() => expect(mocks.writeRuntimeReport).toHaveBeenCalledTimes(2))
    expect(getRuntimeIdentity).toHaveBeenCalledTimes(2)

    vi.unstubAllGlobals()
  })
})
