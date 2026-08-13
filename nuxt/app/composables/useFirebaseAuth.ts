// ============================================
// useFirebaseAuth - Firebase Authentication Composable
// ============================================

import { ref, computed } from 'vue'
import type { User } from 'firebase/auth'
import type { UserProfileDocument } from '~/services/auth/userProvisioningService'
import { AUTH_EMAIL_VERIFICATION_REQUIRED } from '~/config/authPolicy'
import {
    clearLocalUserIdentity,
    isSecondaryLocalRuntimeRenderer,
    requestLocalRuntimeAttestation,
    requiresLocalIdentityBridge,
    saveLocalUserIdentity,
    shouldObserveFirebaseAuth
} from '~/services/auth/localIdentityBridge'

const currentUser = ref<User | null>(null)
const userRole = ref<string>('pilot')
const firestoreNickname = ref<string>('')
const isLoading = ref(true)
const authError = ref<string | null>(null)
const isSecondaryLocalRuntime = ref(false)
const isLocalRuntimeAttested = ref(false)
type CachedUserProfile = UserProfileDocument
const userProfileCache = new Map<string, CachedUserProfile | null>()
const userProfileRequests = new Map<string, Promise<CachedUserProfile | null>>()
const currentUserProfile = ref<CachedUserProfile | null>(null)

let authListenerInitialized = false
let authStateRevision = 0
let observedAuthUid: string | null = null
let authDependenciesPromise: ReturnType<typeof loadAuthDependencies> | null = null

function loadAuthDependencies() {
    return Promise.all([
        import('firebase/auth'),
        import('~/config/firebaseAuth'),
        import('~/services/auth/authService'),
        import('~/services/auth/userProvisioningService')
    ]).then(([firebaseAuth, firebaseConfig, authService, userProvisioning]) => ({
        ...firebaseAuth,
        ...firebaseConfig,
        ...authService,
        ...userProvisioning
    }))
}

function getAuthDependencies() {
    authDependenciesPromise ||= loadAuthDependencies()
    return authDependenciesPromise
}

function ownsLocalIdentityBridge(): boolean {
    if (typeof window === 'undefined') return true
    return requiresLocalIdentityBridge()
}

async function reloadPersistedUser(user: User): Promise<User | null> {
    const { auth, logoutCurrentUser } = await getAuthDependencies()
    try {
        await user.reload()
        await user.getIdToken(true)
        return auth.currentUser
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
    } catch (error: any) {
        console.warn('[AUTH] Persisted user is no longer valid, signing out locally:', error?.code || error)
        await logoutCurrentUser().catch(() => {})
        return null
    }
}

async function syncAuthenticatedUser(
    user: User,
    isCurrentRevision: () => boolean = () => true,
): Promise<User | null> {
    const { ensureUserDocument, logoutCurrentUser } = await getAuthDependencies()
    const freshUser = await reloadPersistedUser(user)

    if (!freshUser) {
        if (!isCurrentRevision()) return null
        await syncLoggedOutUser()
        return null
    }
    if (!isCurrentRevision()) return null

    user = freshUser

    if (AUTH_EMAIL_VERIFICATION_REQUIRED && !user.emailVerified) {
        if (!isCurrentRevision()) return null
        currentUserProfile.value = null
        userRole.value = 'pilot'
        firestoreNickname.value = user.displayName || user.email?.split('@')[0] || ''
        if (ownsLocalIdentityBridge()) await clearLocalUserIdentity()
        return user
    }

    currentUserProfile.value = userProfileCache.get(user.uid) ?? null
    const ensured = await ensureUserDocument(user)
    if (!isCurrentRevision()) return null
    userRole.value = ensured.role
    firestoreNickname.value = ensured.nickname
    if (ownsLocalIdentityBridge()) {
        if (!isCurrentRevision()) return null
        const saved = await saveLocalUserIdentity(user)
        if (!isCurrentRevision()) return null
        if (requiresLocalIdentityBridge() && !saved) {
            console.error('[AUTH] Local runtime rejected identity; signing out fail-closed')
            await logoutCurrentUser().catch(() => {})
            await syncLoggedOutUser()
            return null
        }
    }
    return user
}

async function syncLoggedOutUser() {
    userRole.value = 'pilot'
    firestoreNickname.value = ''
    userProfileCache.clear()
    userProfileRequests.clear()
    currentUserProfile.value = null
    if (ownsLocalIdentityBridge()) await clearLocalUserIdentity()
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

    const { getUserProfile } = await getAuthDependencies()
    const request: Promise<CachedUserProfile | null> = getUserProfile(uid)
        .then((profile) => {
            const cachedProfile = profile && typeof profile === 'object'
                ? profile as CachedUserProfile
                : null
            userProfileCache.set(uid, cachedProfile)
            if (currentUser.value?.uid === uid) currentUserProfile.value = cachedProfile
            return cachedProfile
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

function updateCachedUserProfile(uid: string, patch: CachedUserProfile) {
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

async function initAuthListener() {
    if (authListenerInitialized) return

    authListenerInitialized = true
    isSecondaryLocalRuntime.value = isSecondaryLocalRuntimeRenderer()
    if (!shouldObserveFirebaseAuth()) {
        isLocalRuntimeAttested.value = await requestLocalRuntimeAttestation()
        isLoading.value = false
        if (!isLocalRuntimeAttested.value) {
            console.error('[AUTH] Secondary local runtime denied by main-process attestation')
        }
        return
    }
    let authRuntime
    try {
        authRuntime = await getAuthDependencies()
    } catch (error) {
        isLoading.value = false
        console.error('[AUTH] Firebase Auth initialization failed:', error)
        return
    }
    const { auth, onAuthStateChanged } = authRuntime
    onAuthStateChanged(auth, async (user) => {
        const revision = ++authStateRevision
        const previousObservedUid = observedAuthUid
        observedAuthUid = user?.uid || null
        const previousUid = currentUser.value?.uid || null
        if (!user || previousUid !== user.uid) {
            // Never keep the previous user's dashboard/settings visible while
            // provisioning, switching account or revoking an expired session.
            currentUser.value = null
        }

        if (
            ownsLocalIdentityBridge()
            && previousObservedUid
            && previousObservedUid !== observedAuthUid
        ) {
            // Revoke the previous core before provisioning another UID. Any
            // older callback sees the revision change at its next await.
            await clearLocalUserIdentity()
            if (revision !== authStateRevision) return
        }

        let synchronizedUser: User | null = null
        if (user) {
            synchronizedUser = await syncAuthenticatedUser(
                user,
                () => revision === authStateRevision,
            )
        } else {
            await syncLoggedOutUser()
        }

        if (revision !== authStateRevision) return
        currentUser.value = synchronizedUser

        isLoading.value = false
        console.log('[AUTH] State changed:', user?.email ?? 'logged out', '| Role:', userRole.value)
    })
}

export function useFirebaseAuth() {
    const isAuthenticated = computed(() => !!currentUser.value)
    const isEmailVerified = computed(() => currentUser.value?.emailVerified ?? false)
    const needsEmailVerification = computed(() => (
        AUTH_EMAIL_VERIFICATION_REQUIRED && !!currentUser.value && !isEmailVerified.value
    ))
    const canEnterApp = computed(() => (
        !!currentUser.value && (!AUTH_EMAIL_VERIFICATION_REQUIRED || isEmailVerified.value)
    ))
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
        const { registerWithEmail, translateAuthError } = await getAuthDependencies()
        try {
            const { user } = await registerWithEmail({ email, password, nickname, firstName, lastName })
            console.log('[AUTH] Registered:', email, 'Verification email sent')
            return { success: true, user }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
        } catch (error: any) {
            console.error('[AUTH] Register error:', error.code)
            authError.value = translateAuthError(error.code)
            return { success: false, error: authError.value }
        }
    }

    const login = async (email: string, password: string) => {
        authError.value = null
        const { loginWithEmail, translateAuthError } = await getAuthDependencies()
        try {
            const { user } = await loginWithEmail(email, password)
            console.log('[AUTH] Logged in:', email)
            return { success: true, user }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
        } catch (error: any) {
            console.error('[AUTH] Login error:', error.code)
            authError.value = translateAuthError(error.code)
            return { success: false, error: authError.value }
        }
    }

    const logout = async () => {
        const { logoutCurrentUser } = await getAuthDependencies()
        try {
            await logoutCurrentUser()
            console.log('[AUTH] Logged out')
            return { success: true }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
        } catch (error: any) {
            console.error('[AUTH] Logout error:', error)
            return { success: false, error: error.message }
        }
    }

    const resendVerificationEmail = async () => {
        if (!currentUser.value) {
            return { success: false, error: 'Utente non autenticato' }
        }
        const { resendCurrentVerificationEmail, translateAuthError } = await getAuthDependencies()
        try {
            await resendCurrentVerificationEmail(currentUser.value)
            console.log('[AUTH] Verification email resent')
            return { success: true }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
        } catch (error: any) {
            console.error('[AUTH] Resend error:', error.code)
            return { success: false, error: translateAuthError(error.code) }
        }
    }

    const resetPassword = async (email: string) => {
        const { sendPasswordResetWithEmail, translateAuthError } = await getAuthDependencies()
        try {
            await sendPasswordResetWithEmail(email)
            return { success: true }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- Firebase Auth errors expose a runtime code
        } catch (error: any) {
            console.error('[AUTH] Password reset error:', error?.code || 'unknown')
            return { success: false, error: translateAuthError(error?.code) }
        }
    }

    const checkEmailVerified = async () => {
        if (!currentUser.value) {
            return { verified: false, error: 'Utente non autenticato' }
        }
        const { refreshEmailVerificationState } = await getAuthDependencies()
        try {
            const refreshed = await refreshEmailVerificationState(currentUser.value)
            currentUser.value = refreshed.user
            if (refreshed.user && (!AUTH_EMAIL_VERIFICATION_REQUIRED || refreshed.user.emailVerified)) {
                await syncAuthenticatedUser(refreshed.user)
            }
            console.log('[AUTH] Email verified check:', refreshed.verified)
            return { verified: refreshed.verified, error: null }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
        } catch (error: any) {
            console.error('[AUTH] Check verification error:', error)
            return { verified: false, error: error.message }
        }
    }

    void initAuthListener()

    return {
        currentUser,
        isLoading,
        isSecondaryLocalRuntime,
        isLocalRuntimeAttested,
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
        resetPassword,
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
