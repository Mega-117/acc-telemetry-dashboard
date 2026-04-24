import type { User } from 'firebase/auth'

type ElectronAPI = {
    saveUserIdentity?: (payload: {
        userId: string
        email: string | null
        displayName: string
    }) => Promise<boolean>
    clearUserIdentity?: () => Promise<boolean>
}

function getElectronAPI(): ElectronAPI | null {
    if (typeof window === 'undefined') {
        return null
    }
    return ((window as any).electronAPI || null) as ElectronAPI | null
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
