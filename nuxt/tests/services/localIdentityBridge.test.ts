// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  isSecondaryLocalRuntimeRenderer,
  requestLocalRuntimeAttestation,
  publishAuthStartupOutcome,
  requiresLocalIdentityBridge,
  resolveLocalRuntimeCapability,
  saveLocalUserIdentity,
  shouldObserveFirebaseAuth,
} from '~/services/auth/localIdentityBridge'

describe('local identity runtime bridge', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('separa l ingresso dashboard dalla capability dei renderer attestati', () => {
    expect(resolveLocalRuntimeCapability({
      isSecondaryLocalRuntime: false,
      isLocalRuntimeAttested: false,
      canEnterApp: true,
    })).toBe(true)
    expect(resolveLocalRuntimeCapability({
      isSecondaryLocalRuntime: true,
      isLocalRuntimeAttested: true,
      canEnterApp: false,
    })).toBe(true)
    expect(resolveLocalRuntimeCapability({
      isSecondaryLocalRuntime: true,
      isLocalRuntimeAttested: false,
      canEnterApp: true,
    })).toBe(false)
  })

  it('e obbligatorio soltanto nel renderer Electron primario', () => {
    vi.stubGlobal('window', {
      electronAPI: {
        isElectron: true,
        localIdentityRole: 'primary',
      },
    })
    expect(requiresLocalIdentityBridge()).toBe(true)
  })

  it('mantiene Firebase nel browser e nel renderer Electron primario', () => {
    expect(shouldObserveFirebaseAuth()).toBe(true)

    vi.stubGlobal('window', {
      electronAPI: { isElectron: true, localIdentityRole: 'primary' },
    })
    expect(shouldObserveFirebaseAuth()).toBe(true)
    expect(isSecondaryLocalRuntimeRenderer()).toBe(false)
  })

  it('richiede l’attestazione main-process nei renderer secondari', async () => {
    const attestLocalRuntime = vi.fn().mockResolvedValue(true)
    vi.stubGlobal('window', {
      electronAPI: {
        isElectron: true,
        localIdentityRole: 'consumer',
        attestLocalRuntime,
      },
    })

    expect(isSecondaryLocalRuntimeRenderer()).toBe(true)
    expect(shouldObserveFirebaseAuth()).toBe(false)
    await expect(requestLocalRuntimeAttestation()).resolves.toBe(true)
    expect(attestLocalRuntime).toHaveBeenCalledOnce()
  })

  it('usa il ruolo consumer come classificazione anche con marker Electron legacy incompleto', async () => {
    const attestLocalRuntime = vi.fn().mockResolvedValue(true)
    vi.stubGlobal('window', {
      electronAPI: {
        localIdentityRole: 'consumer',
        attestLocalRuntime,
      },
    })

    expect(isSecondaryLocalRuntimeRenderer()).toBe(true)
    expect(shouldObserveFirebaseAuth()).toBe(false)
    await expect(requestLocalRuntimeAttestation()).resolves.toBe(true)
    expect(attestLocalRuntime).toHaveBeenCalledOnce()
  })

  it('funziona con il bridge identita minimo senza il bridge dashboard', async () => {
    const attestLocalRuntime = vi.fn().mockResolvedValue(true)
    vi.stubGlobal('window', {
      accLocalIdentity: {
        isElectron: true,
        localIdentityRole: 'consumer',
        attestLocalRuntime,
      },
    })

    expect(isSecondaryLocalRuntimeRenderer()).toBe(true)
    expect(shouldObserveFirebaseAuth()).toBe(false)
    await expect(requestLocalRuntimeAttestation()).resolves.toBe(true)
    expect(attestLocalRuntime).toHaveBeenCalledOnce()
  })

  it('nega un consumer privo del bridge di attestazione', async () => {
    vi.stubGlobal('window', {
      electronAPI: { isElectron: true, localIdentityRole: 'consumer' },
    })
    await expect(requestLocalRuntimeAttestation()).resolves.toBe(false)
  })

  it('mantiene fail-closed un renderer Electron non gestito', async () => {
    vi.stubGlobal('window', {
      electronAPI: { isElectron: true },
    })

    expect(isSecondaryLocalRuntimeRenderer()).toBe(true)
    expect(shouldObserveFirebaseAuth()).toBe(false)
    await expect(requestLocalRuntimeAttestation()).resolves.toBe(false)
  })

  it('delega al main la decisione per un bridge con ruolo locale sconosciuto', async () => {
    const attestLocalRuntime = vi.fn().mockResolvedValue(false)
    vi.stubGlobal('window', {
      electronAPI: {
        isElectron: true,
        localIdentityRole: 'unexpected',
        attestLocalRuntime,
      },
    })

    expect(isSecondaryLocalRuntimeRenderer()).toBe(true)
    expect(shouldObserveFirebaseAuth()).toBe(false)
    await expect(requestLocalRuntimeAttestation()).resolves.toBe(false)
    expect(attestLocalRuntime).toHaveBeenCalledOnce()
  })

  it('non e obbligatorio nel browser, negli overlay consumer o nel RuntimeWindow owner', () => {
    vi.stubGlobal('window', {})
    expect(requiresLocalIdentityBridge()).toBe(false)

    vi.stubGlobal('window', {
      electronAPI: {
        localIdentityRole: 'consumer',
        saveUserIdentity: vi.fn(),
      },
    })
    expect(requiresLocalIdentityBridge()).toBe(false)

    vi.stubGlobal('window', {
      electronAPI: {
        runtimeBootstrapRole: 'owner',
        saveUserIdentity: vi.fn(),
      },
    })
    expect(requiresLocalIdentityBridge()).toBe(false)
  })

  it('inoltra uid e email nulla senza inventare un account', async () => {
    const saveUserIdentity = vi.fn().mockResolvedValue(true)
    vi.stubGlobal('window', {
      electronAPI: { localIdentityRole: 'primary', saveUserIdentity },
    })

    await expect(saveLocalUserIdentity({
      uid: 'uid-driver',
      email: null,
      displayName: null,
    } as any)).resolves.toBe(true)
    expect(saveUserIdentity).toHaveBeenCalledWith({
      userId: 'uid-driver',
      email: null,
      displayName: 'User',
    })
  })

  it('pubblica lo startup auth soltanto dal renderer primario', async () => {
    const publish = vi.fn().mockResolvedValue(true)
    vi.stubGlobal('window', {
      electronAPI: {
        localIdentityRole: 'primary',
        publishAuthStartupOutcome: publish,
      },
    })

    await expect(publishAuthStartupOutcome('login-required')).resolves.toBe(true)
    expect(publish).toHaveBeenCalledWith('login-required')

    vi.stubGlobal('window', {
      electronAPI: {
        localIdentityRole: 'consumer',
        publishAuthStartupOutcome: publish,
      },
    })
    await expect(publishAuthStartupOutcome('ready')).resolves.toBe(false)
    expect(publish).toHaveBeenCalledOnce()
  })
})
