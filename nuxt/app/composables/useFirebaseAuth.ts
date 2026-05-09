// ============================================
// useFirebaseAuth - Firebase Authentication Composable
// ============================================

import { ref, computed } from 'vue'
import { onAuthStateChanged, type User } from 'firebase/auth'
import { auth } from '~/config/firebase'
import {
    loginWithEmail,
    logoutCurrentUser,
    refreshEmailVerificationState,
    registerWithEmail,
    resendCurrentVerificationEmail,
    translateAuthError
} from '~/services/auth/authService'
import { clearLocalUserIdentity, saveLocalUserIdentity } from '~/services/auth/localIdentityBridge'
import { ensureUserDocument, getUserProfile } from '~/services/auth/userProvisioningService'

const currentUser = ref<User | null>(null)
const userRole = ref<string>('pilot')
const firestoreNickname = ref<string>('')
const isLoading = ref(true)
const authError = ref<string | null>(null)
const userProfileCache = new Map<string, any | null>()
const userProfileRequests = new Map<string, Promise<any | null>>()
const currentUserProfile = ref<any | null>(null)

let authListenerInitialized = false

async function reloadPersistedUser(user: User): Promise<User | null> {
    try {
        await user.reload()
        await user.getIdToken(true)
        return auth.currentUser
    } catch (error: any) {
        console.warn('[AUTH] Persisted user is no longer valid, signing out locally:', error?.code || error)
        await logoutCurrentUser().catch(() => {})
        return null
    }
}

async function syncAuthenticatedUser(user: User): Promise<User | null> {
    const freshUser = await reloadPersistedUser(user)

    if (!freshUser) {
        await syncLoggedOutUser()
        return null
    }

    user = freshUser

    if (!user.emailVerified) {
        currentUserProfile.value = null
        userRole.value = 'pilot'
        firestoreNickname.value = user.displayName || user.email?.split('@')[0] || ''
        await clearLocalUserIdentity()
        return user
    }

    currentUserProfile.value = userProfileCache.get(user.uid) ?? null
    const ensured = await ensureUserDocument(user)
    userRole.value = ensured.role
    firestoreNickname.value = ensured.nickname
    await saveLocalUserIdentity(user)
    return user
}

async function syncLoggedOutUser() {
    userRole.value = 'pilot'
    firestoreNickname.value = ''
    userProfileCache.clear()
    userProfileRequests.clear()
    currentUserProfile.value = null
    await clearLocalUserIdentity()
}

async function loadCachedUserProfile(uid: string, { force = false } = {}) {
    if (!force && userProfileCache.has(uid)) {
        const cached = userProfileCache.get(uid) ?? null
        if (currentUser.value?.uid === uid) currentUserProfile.value = cached
        return cached
    }

    if (!force && userProfileRequests.has(uid)) {
        return userProfileRequests.get(uid)!
    }

    const request = getUserProfile(uid)
        .then((profile) => {
            userProfileCache.set(uid, profile)
            if (currentUser.value?.uid === uid) currentUserProfile.value = profile
            return profile
        })
        .finally(() => {
            userProfileRequests.delete(uid)
        })

    userProfileRequests.set(uid, request)
    return request
}

async function refreshUserProfile(uid: string) {
    return loadCachedUserProfile(uid, { force: true })
}

function updateCachedUserProfile(uid: string, patch: Record<string, any>) {
    const nextProfile = {
        ...(userProfileCache.get(uid) || {}),
        ...patch
    }
    userProfileCache.set(uid, nextProfile)
    if (currentUser.value?.uid === uid) currentUserProfile.value = nextProfile
}

function clearCachedUserProfile(uid?: string) {
    if (uid) {
        userProfileCache.delete(uid)
        userProfileRequests.delete(uid)
        if (currentUser.value?.uid === uid) currentUserProfile.value = null
        return
    }

    userProfileCache.clear()
    userProfileRequests.clear()
    currentUserProfile.value = null
}

function initAuthListener() {
    if (authListenerInitialized) return

    authListenerInitialized = true
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            currentUser.value = await syncAuthenticatedUser(user)
        } else {
            currentUser.value = null
            await syncLoggedOutUser()
        }

        isLoading.value = false
        console.log('[AUTH] State changed:', user?.email ?? 'logged out', '| Role:', userRole.value)
    })
}

export function useFirebaseAuth() {
    const isAuthenticated = computed(() => !!currentUser.value)
    const isEmailVerified = computed(() => currentUser.value?.emailVerified ?? false)
    const needsEmailVerification = computed(() => !!currentUser.value && !isEmailVerified.value)
    const canEnterApp = computed(() => !!currentUser.value && isEmailVerified.value)
    const userEmail = computed(() => currentUser.value?.email ?? '')
    const userDisplayName = computed(() => firestoreNickname.value || currentUser.value?.displayName || '')
    const isCoach = computed(() => userRole.value === 'coach')
    const isAdmin = computed(() => userRole.value === 'admin')

    const register = async (
        email: string,
        password: string,
        nickname: string,
        firstName: string = '',
        lastName: string = ''
    ) => {
        authError.value = null
        try {
            const { user } = await registerWithEmail({ email, password, nickname, firstName, lastName })
            console.log('[AUTH] Registered:', email, 'Verification email sent')
            return { success: true, user }
        } catch (error: any) {
            console.error('[AUTH] Register error:', error.code)
            authError.value = translateAuthError(error.code)
            return { success: false, error: authError.value }
        }
    }

    const login = async (email: string, password: string) => {
        authError.value = null
        try {
            const { user } = await loginWithEmail(email, password)
            console.log('[AUTH] Logged in:', email)
            return { success: true, user }
        } catch (error: any) {
            console.error('[AUTH] Login error:', error.code)
            authError.value = translateAuthError(error.code)
            return { success: false, error: authError.value }
        }
    }

    const logout = async () => {
        try {
            await logoutCurrentUser()
            console.log('[AUTH] Logged out')
            return { success: true }
        } catch (error: any) {
            console.error('[AUTH] Logout error:', error)
            return { success: false, error: error.message }
        }
    }

    const resendVerificationEmail = async () => {
        if (!currentUser.value) {
            return { success: false, error: 'Utente non autenticato' }
        }
        try {
            await resendCurrentVerificationEmail(currentUser.value)
            console.log('[AUTH] Verification email resent')
            return { success: true }
        } catch (error: any) {
            console.error('[AUTH] Resend error:', error.code)
            return { success: false, error: translateAuthError(error.code) }
        }
    }

    const checkEmailVerified = async () => {
        if (!currentUser.value) {
            return { verified: false, error: 'Utente non autenticato' }
        }
        try {
            const refreshed = await refreshEmailVerificationState(currentUser.value)
            currentUser.value = refreshed.user
            if (refreshed.user?.emailVerified) {
                await syncAuthenticatedUser(refreshed.user)
            }
            console.log('[AUTH] Email verified check:', refreshed.verified)
            return { verified: refreshed.verified, error: null }
        } catch (error: any) {
            console.error('[AUTH] Check verification error:', error)
            return { verified: false, error: error.message }
        }
    }

    initAuthListener()

    return {
        currentUser,
        isLoading,
        authError,
        isAuthenticated,
        isEmailVerified,
        needsEmailVerification,
        canEnterApp,
        userEmail,
        userDisplayName,
        register,
        login,
        logout,
        resendVerificationEmail,
        checkEmailVerified,
        getUserProfile: loadCachedUserProfile,
        refreshUserProfile,
        updateCachedUserProfile,
        clearCachedUserProfile,
        currentUserProfile,
        userRole,
        isCoach,
        isAdmin
    }
}
