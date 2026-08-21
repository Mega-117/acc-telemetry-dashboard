import type { User } from 'firebase/auth'
import type { AuthStartupOutcome } from './authSessionPolicy'

type ElectronAPI = {
    isElectron?: boolean
    localIdentityRole?: 'primary' | 'consumer'
    attestLocalRuntime?: () => Promise<boolean>
    saveUserIdentity?: (payload: {
        userId: string
        email: string | null
        displayName: string
    }) => Promise<boolean>
    clearUserIdentity?: () => Promise<boolean>
    publishAuthStartupOutcome?: (outcome: AuthStartupOutcome) => Promise<boolean>
}

function getElectronAPI(): ElectronAPI | null {
    if (typeof window === 'undefined') {
        return null
    }
    const localWindow = window as Window & {
        accLocalIdentity?: ElectronAPI
        electronAPI?: ElectronAPI
    }
    if (!localWindow.accLocalIdentity && !localWindow.electronAPI) return null
    return {
        ...localWindow.electronAPI,
        ...localWindow.accLocalIdentity,
    }
}

export function requiresLocalIdentityBridge() {
    const electronAPI = getElectronAPI()
    return electronAPI?.localIdentityRole === 'primary'
}

export function isSecondaryLocalRuntimeRenderer() {
    const electronAPI = getElectronAPI()
    // Presence of the isolated preload bridge is the local-runtime boundary.
    // Only the explicit primary may own Firebase Auth; every other bridged
    // renderer must be authorized by the main process or remain neutral.
    return !!electronAPI && electronAPI.localIdentityRole !== 'primary'
}

export function shouldObserveFirebaseAuth() {
    const electronAPI = getElectronAPI()
    if (!electronAPI) return true
    return electronAPI.localIdentityRole === 'primary'
}

export async function requestLocalRuntimeAttestation() {
    const electronAPI = getElectronAPI()
    if (
        !electronAPI
        || electronAPI.localIdentityRole === 'primary'
        || !electronAPI.attestLocalRuntime
    ) {
        return false
    }
    try {
        return await electronAPI.attestLocalRuntime() === true
    } catch (e) {
        console.error('[AUTH] Local runtime attestation failed:', e)
        return false
    }
}

export async function saveLocalUserIdentity(user: User) {
    try {
        const electronAPI = getElectronAPI()
        if (!electronAPI?.saveUserIdentity) {
            return false
        }

        return await electronAPI.saveUserIdentity({
            userId: user.uid,
            email: user.email,
            displayName: user.displayName || user.email?.split('@')[0] || 'User'
        })
    } catch (e) {
        console.error('[AUTH] Identity save failed:', e)
        return false
    }
}

export async function clearLocalUserIdentity() {
    try {
        const electronAPI = getElectronAPI()
        if (!electronAPI?.clearUserIdentity) {
            return false
        }
        return await electronAPI.clearUserIdentity()
    } catch (e) {
        console.error('[AUTH] Identity clear failed:', e)
        return false
    }
}

export async function publishAuthStartupOutcome(outcome: AuthStartupOutcome) {
    try {
        const electronAPI = getElectronAPI()
        if (
            electronAPI?.localIdentityRole !== 'primary'
            || !electronAPI.publishAuthStartupOutcome
        ) {
            return false
        }
        return await electronAPI.publishAuthStartupOutcome(outcome) === true
    } catch (e) {
        console.error('[AUTH] Startup outcome publish failed:', e)
        return false
    }
}
