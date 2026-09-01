import { effectScope, nextTick, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  sync: null as any,
  heartbeat: vi.fn(),
  heartbeatIdle: vi.fn(),
  publish: vi.fn(async () => true)
}))

vi.mock('~/composables/useElectronSync', () => ({
  useElectronSync: () => mocks.sync
}))
vi.mock('~/composables/useClientHeartbeat', () => ({
  useClientHeartbeat: mocks.heartbeat
}))
vi.mock('~/services/runtime/runtimeWindowBridge', async (importOriginal) => {
  const original = await importOriginal<typeof import('~/services/runtime/runtimeWindowBridge')>()
  return { ...original, publishRuntimeWindowSnapshot: mocks.publish }
})

import { usePrimaryCloudOwner } from '~/composables/usePrimaryCloudOwner'

async function settle() {
  await nextTick()
  await Promise.resolve()
  await Promise.resolve()
}

describe('usePrimaryCloudOwner', () => {
  beforeEach(() => {
    mocks.heartbeat.mockClear()
    mocks.heartbeatIdle.mockReset()
    mocks.heartbeatIdle.mockResolvedValue(undefined)
    mocks.heartbeat.mockReturnValue({
      sendHeartbeat: vi.fn(async () => true),
      waitForIdle: mocks.heartbeatIdle
    })
    mocks.publish.mockClear()
    mocks.sync = {
      runtimeBootstrapState: ref({
        phase: 'idle',
        capabilities: {},
        events: [],
        migrationProgress: null
      }),
      setupAutoSync: vi.fn(() => vi.fn()),
      waitForOwnerIdle: vi.fn(async () => undefined)
    }
  })

  it('avvia una sessione nel primary e drena A prima di avviare B', async () => {
    vi.stubGlobal('window', {
      electronAPI: { localIdentityRole: 'primary', runtimeBootstrapRole: 'owner' }
    })
    const currentUser = ref<{ uid: string } | null>({ uid: 'uid-a' })
    const canEnterApp = ref(true)
    let releaseSecondDrain!: () => void
    const secondDrain = new Promise<void>((resolve) => { releaseSecondDrain = resolve })
    mocks.sync.waitForOwnerIdle
      .mockResolvedValueOnce(undefined)
      .mockReturnValueOnce(secondDrain)
    const scope = effectScope()
    const owner = scope.run(() => usePrimaryCloudOwner({
      currentUser,
      canEnterApp
    }))!

    await settle()
    expect(mocks.sync.waitForOwnerIdle).toHaveBeenCalledTimes(1)
    expect(mocks.heartbeatIdle).toHaveBeenCalledTimes(1)
    expect(mocks.sync.setupAutoSync).toHaveBeenCalledTimes(1)
    expect(owner.jobsEnabled.value).toBe(false)

    mocks.sync.runtimeBootstrapState.value = {
      phase: 'ready', capabilities: {}, events: [], migrationProgress: null
    }
    await settle()
    expect(owner.jobsEnabled.value).toBe(true)

    const disposeA = mocks.sync.setupAutoSync.mock.results[0].value
    currentUser.value = { uid: 'uid-b' }
    await settle()
    expect(disposeA).toHaveBeenCalledTimes(1)
    expect(mocks.sync.waitForOwnerIdle).toHaveBeenCalledTimes(2)
    expect(mocks.heartbeatIdle).toHaveBeenCalledTimes(2)
    expect(mocks.sync.setupAutoSync).toHaveBeenCalledTimes(1)

    releaseSecondDrain()
    await settle()
    expect(mocks.sync.setupAutoSync).toHaveBeenCalledTimes(2)
    expect(mocks.sync.setupAutoSync.mock.calls[1][0].lease.uid).toBe('uid-b')

    currentUser.value = { uid: 'uid-b' }
    await settle()
    expect(mocks.sync.waitForOwnerIdle).toHaveBeenCalledTimes(2)
    expect(mocks.sync.setupAutoSync).toHaveBeenCalledTimes(2)

    const disposeB = mocks.sync.setupAutoSync.mock.results[1].value
    canEnterApp.value = false
    await settle()
    expect(disposeB).toHaveBeenCalledTimes(1)
    expect(owner.jobsEnabled.value).toBe(false)
    expect(mocks.sync.setupAutoSync).toHaveBeenCalledTimes(2)

    scope.stop()
    vi.unstubAllGlobals()
  })

  it('non avvia job in un consumer attestato', async () => {
    vi.stubGlobal('window', {
      electronAPI: { localIdentityRole: 'consumer', runtimeBootstrapRole: 'consumer' }
    })
    const scope = effectScope()
    const owner = scope.run(() => usePrimaryCloudOwner({
      currentUser: ref({ uid: 'uid-consumer' }),
      canEnterApp: ref(true)
    }))!

    await settle()
    expect(owner.isExactPrimaryOwner.value).toBe(false)
    expect(mocks.sync.setupAutoSync).not.toHaveBeenCalled()
    expect(owner.jobsEnabled.value).toBe(false)

    scope.stop()
    vi.unstubAllGlobals()
  })

  it('sospende i job cloud e li ripristina senza ricreare il composable', async () => {
    vi.stubGlobal('window', {
      electronAPI: { localIdentityRole: 'primary', runtimeBootstrapRole: 'owner' }
    })
    mocks.sync.runtimeBootstrapState.value = {
      phase: 'ready', capabilities: {}, events: [], migrationProgress: null
    }
    const cloudEnabled = ref(true)
    const scope = effectScope()
    const owner = scope.run(() => usePrimaryCloudOwner({
      currentUser: ref({ uid: 'uid-sandbox' }),
      canEnterApp: ref(true),
      cloudEnabled
    }))!

    await settle()
    expect(mocks.sync.setupAutoSync).toHaveBeenCalledTimes(1)
    expect(owner.jobsEnabled.value).toBe(true)

    const disposeFirstLease = mocks.sync.setupAutoSync.mock.results[0].value
    cloudEnabled.value = false
    await settle()
    expect(disposeFirstLease).toHaveBeenCalledTimes(1)
    expect(owner.jobsEnabled.value).toBe(false)
    expect(owner.isLeaseCurrent('uid-sandbox')).toBe(false)

    cloudEnabled.value = true
    await settle()
    expect(mocks.sync.setupAutoSync).toHaveBeenCalledTimes(2)
    expect(owner.jobsEnabled.value).toBe(true)

    scope.stop()
    vi.unstubAllGlobals()
  })

  it.each([
    ['browser', undefined],
    ['owner senza identita primary', { runtimeBootstrapRole: 'owner' }],
    ['primary con ruolo bootstrap consumer', { localIdentityRole: 'primary', runtimeBootstrapRole: 'consumer' }]
  ])('non avvia job nel ramo %s', async (_label, electronAPI) => {
    vi.stubGlobal('window', electronAPI === undefined ? undefined : { electronAPI })
    const scope = effectScope()
    const owner = scope.run(() => usePrimaryCloudOwner({
      currentUser: ref({ uid: 'uid-no-owner' }),
      canEnterApp: ref(true)
    }))!

    await settle()
    expect(owner.isExactPrimaryOwner.value).toBe(false)
    expect(owner.jobsEnabled.value).toBe(false)
    expect(mocks.sync.setupAutoSync).not.toHaveBeenCalled()
    expect(mocks.sync.waitForOwnerIdle).not.toHaveBeenCalled()

    scope.stop()
    vi.unstubAllGlobals()
  })
})
