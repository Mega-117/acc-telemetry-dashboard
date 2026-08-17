import { nextTick, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  auth: null as any,
  trackedGetDoc: vi.fn(),
  trackedSetDoc: vi.fn()
}))

vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, path: string) => ({ path }),
  serverTimestamp: () => ({ serverTimestamp: true })
}))
vi.mock('~/config/firebase', () => ({ db: {} }))
vi.mock('~/composables/useFirebaseAuth', () => ({
  useFirebaseAuth: () => mocks.auth
}))
vi.mock('~/composables/useFirebaseTracker', () => ({
  trackedGetDoc: mocks.trackedGetDoc,
  trackedSetDoc: mocks.trackedSetDoc
}))

import { useClientDiagnostics } from '~/composables/useClientDiagnostics'

async function settle() {
  await nextTick()
  await Promise.resolve()
  await Promise.resolve()
  await Promise.resolve()
}

describe('useClientDiagnostics', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.auth = {
      currentUser: ref<{ uid: string } | null>({ uid: 'pilot-a' }),
      canEnterApp: ref(true)
    }
    vi.stubGlobal('useNuxtApp', () => ({
      vueApp: { config: { errorHandler: undefined } }
    }))
    vi.stubGlobal('useRoute', () => ({ path: '/dashboard' }))
  })

  it('preserva outbox e blocca ogni ack quando il lease scade durante list', async () => {
    let resolveList!: (value: any[]) => void
    const pendingList = new Promise<any[]>((resolve) => { resolveList = resolve })
    const listDiagnostics = vi.fn()
      .mockReturnValueOnce(pendingList)
      .mockResolvedValue([])
    const acknowledgeDiagnostics = vi.fn().mockResolvedValue(1)
    vi.stubGlobal('window', {
      electronAPI: {
        listDiagnostics,
        acknowledgeDiagnostics,
        getSuiteVersion: vi.fn().mockResolvedValue(null)
      },
      setInterval: vi.fn(() => 1),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn()
    })
    const flushEnabled = ref(false)
    let current = true
    const diagnostics = useClientDiagnostics({
      flushEnabled,
      captureEnabled: ref(false),
      isLeaseCurrent: (uid) => current && uid === 'pilot-a'
    })

    flushEnabled.value = true
    await nextTick()
    expect(listDiagnostics).toHaveBeenCalledTimes(1)
    await expect(diagnostics.flush()).resolves.toBe(0)

    current = false
    resolveList([{
      eventId: 'event-a',
      component: 'electron',
      severity: 'error',
      code: 'test',
      message: 'failure',
      occurredAt: '2026-08-18T00:00:00.000Z'
    }])
    await settle()

    expect(listDiagnostics).toHaveBeenCalledTimes(1)
    expect(mocks.trackedGetDoc).not.toHaveBeenCalled()
    expect(mocks.trackedSetDoc).not.toHaveBeenCalled()
    expect(acknowledgeDiagnostics).not.toHaveBeenCalled()

    vi.unstubAllGlobals()
  })
})
