// ============================================
// useFirebaseAuth - Firebase Authentication Composable
// ============================================

import { ref, computed } from 'vue'
import type { User } from 'firebase/auth'
import type { UserProfileDocument } from '~/services/auth/userProvisioningService'
import { AUTH_EMAIL_VERIFICATION_REQUIRED } from '~/config/authPolicy'
import {
    refreshPersistedAuthSession,
    type AuthSessionStatus,
    type PersistedAuthRefreshResult,
} from '~/services/auth/authSessionPolicy'
import { createAuthSessionRecoveryCoordinator } from '~/services/auth/authSessionRecoveryCoordinator'
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
const authSessionStatus = ref<AuthSessionStatus>('initializing')
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
let recoverableAuthUser: User | null = null

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

async function reloadPersistedUser(user: User): Promise<PersistedAuthRefreshResult> {
    const { auth, logoutCurrentUser } = await getAuthDependencies()
    return refreshPersistedAuthSession(user, {
        getCurrentUser: () => auth.currentUser,
        signOut: logoutCurrentUser,
    })
}

type AuthenticatedUserSyncResult =
    | { status: 'ready' | 'unverified'; user: User }
    | { status: 'recoverable' | 'signed-out'; user: null }

async function syncAuthenticatedUser(
    user: User,
    isCurrentRevision: () => boolean = () => true,
): Promise<AuthenticatedUserSyncResult> {
    const { ensureUserDocument, logoutCurrentUser } = await getAuthDependencies()
    const refreshResult = await reloadPersistedUser(user)

    if (refreshResult.status === 'invalid') {
        console.warn('[AUTH] Persisted session is definitively invalid:', refreshResult.errorCode)
        if (!isCurrentRevision()) return { status: 'signed-out', user: null }
        await syncLoggedOutUser()
        return { status: 'signed-out', user: null }
    }
    if (refreshResult.status === 'recoverable') {
        console.warn('[AUTH] Persisted session refresh deferred:', refreshResult.errorCode)
        if (!isCurrentRevision()) return { status: 'recoverable', user: null }
        // Firebase persistence remains untouched. Only the derived local
        // identity/runtime is revoked until an authoritative retry succeeds.
        await syncLoggedOutUser()
        return { status: 'recoverable', user: null }
    }
    if (!isCurrentRevision()) return { status: 'recoverable', user: null }

    user = refreshResult.user

    if (AUTH_EMAIL_VERIFICATION_REQUIRED && !user.emailVerified) {
        if (!isCurrentRevision()) return { status: 'recoverable', user: null }
        currentUserProfile.value = null
        userRole.value = 'pilot'
        firestoreNickname.value = user.displayName || user.email?.split('@')[0] || ''
        if (ownsLocalIdentityBridge()) await clearLocalUserIdentity()
        return { status: 'unverified', user }
    }

    currentUserProfile.value = userProfileCache.get(user.uid) ?? null
    let ensured
    try {
        ensured = await ensureUserDocument(user)
    } catch (error) {
        console.warn('[AUTH] Authenticated profile provisioning deferred:', error)
        if (isCurrentRevision()) await syncLoggedOutUser()
        return { status: 'recoverable', user: null }
    }
    if (!isCurrentRevision()) return { status: 'recoverable', user: null }
    userRole.value = ensured.role
    firestoreNickname.value = ensured.nickname
    if (ownsLocalIdentityBridge()) {
        if (!isCurrentRevision()) return { status: 'recoverable', user: null }
        const saved = await saveLocalUserIdentity(user)
        if (!isCurrentRevision()) return { status: 'recoverable', user: null }
        if (requiresLocalIdentityBridge() && !saved) {
            console.error('[AUTH] Local runtime rejected identity; signing out fail-closed')
            await logoutCurrentUser().catch(() => {})
            await syncLoggedOutUser()
            return { status: 'signed-out', user: null }
        }
    }
    return { status: 'ready', user }
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

function commitAuthSyncResult(result: AuthenticatedUserSyncResult, observedUser: User | null) {
    currentUser.value = result.user
    authSessionStatus.value = result.status
    recoverableAuthUser = result.status === 'recoverable' ? observedUser : null
    if (result.status !== 'recoverable') authRecoveryCoordinator.clear()
}

async function applyObservedAuthUser(user: User | null) {
    const revision = ++authStateRevision
    const previousObservedUid = observedAuthUid
    observedAuthUid = user?.uid || null
    const previousUid = currentUser.value?.uid || null
    if (!user || previousUid !== user.uid) {
        // Never keep the previous user's dashboard/settings visible while
        // provisioning, switching account or revoking an expired session.
        currentUser.value = null
        authSessionStatus.value = 'initializing'
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

    let result: AuthenticatedUserSyncResult
    if (user) {
        result = await syncAuthenticatedUser(
            user,
            () => revision === authStateRevision,
        )
    } else {
        await syncLoggedOutUser()
        result = { status: 'signed-out', user: null }
    }

    if (revision !== authStateRevision) return
    commitAuthSyncResult(result, user)
    isLoading.value = false

    if (result.status === 'recoverable') authRecoveryCoordinator.schedule()
    console.log('[AUTH] State changed:', user?.email ?? 'logged out', '| Session:', result.status, '| Role:', userRole.value)
}

const authRecoveryCoordinator = createAuthSessionRecoveryCoordinator({
    getStatus: () => authSessionStatus.value,
    getRecoverableUser: () => recoverableAuthUser,
    retryUser: applyObservedAuthUser,
    getEventTarget: () => typeof window === 'undefined' ? null : window,
})

async function retryRecoverableAuthSession() {
    return authRecoveryCoordinator.retryNow()
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
        authSessionStatus.value = 'signed-out'
        console.error('[AUTH] Firebase Auth initialization failed:', error)
        return
    }
    const { auth, onAuthStateChanged } = authRuntime
    authRecoveryCoordinator.installTriggers()
    onAuthStateChanged(auth, async (user) => {
        await applyObservedAuthUser(user)
    })
}

export function useFirebaseAuth() {
    const isAuthenticated = computed(() => !!currentUser.value)
    const isEmailVerified = computed(() => currentUser.value?.emailVerified ?? false)
    const needsEmailVerification = computed(() => authSessionStatus.value === 'unverified')
    const canEnterApp = computed(() => (
        authSessionStatus.value === 'ready'
        && !!currentUser.value
        && (!AUTH_EMAIL_VERIFICATION_REQUIRED || currentUser.value.emailVerified)
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
        const verification = await checkEmailVerified()
        if (verification.verified) {
            return { success: true, alreadyVerified: true }
        }
        if (verification.error) {
            return { success: false, error: verification.error }
        }
        const { resendCurrentVerificationEmail, translateAuthError } = await getAuthDependencies()
        try {
            await resendCurrentVerificationEmail(currentUser.value)
            console.log('[AUTH] Verification email resent')
            return { success: true, alreadyVerified: false }
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

    async function checkEmailVerified() {
        if (!currentUser.value) {
            return { verified: false, error: 'Utente non autenticato' }
        }
        const { refreshEmailVerificationState, translateAuthError } = await getAuthDependencies()
        try {
            const refreshed = await refreshEmailVerificationState(currentUser.value)
            if (!refreshed.user) {
                await syncLoggedOutUser()
                commitAuthSyncResult({ status: 'signed-out', user: null }, null)
                return { verified: false, error: 'Sessione non più valida. Effettua nuovamente il login.' }
            }
            if (!AUTH_EMAIL_VERIFICATION_REQUIRED || refreshed.user.emailVerified) {
                const result = await syncAuthenticatedUser(refreshed.user)
                commitAuthSyncResult(result, refreshed.user)
                if (result.status !== 'ready') {
                    return {
                        verified: false,
                        error: 'Verifica completata, ma la sessione non è ancora disponibile. Controlla la connessione e riprova.',
                    }
                }
            } else {
                commitAuthSyncResult({ status: 'unverified', user: refreshed.user }, refreshed.user)
            }
            console.log('[AUTH] Email verified check:', refreshed.verified)
            return { verified: refreshed.verified, error: null }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
        } catch (error: any) {
            console.error('[AUTH] Check verification error:', error?.code || 'unknown')
            return { verified: false, error: translateAuthError(error?.code) }
        }
    }

    void initAuthListener()

    return {
        currentUser,
        isLoading,
        authSessionStatus,
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
        retryRecoverableAuthSession,
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
