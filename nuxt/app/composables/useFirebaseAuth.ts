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
import { createAuthRevisionLeaseCoordinator, type AuthRevisionLease } from '~/services/auth/authRevisionLease'
import { createRetryableSingleFlightLoader } from '~/services/auth/retryableSingleFlightLoader'
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
let authInitializationPromise: Promise<void> | null = null
const authRevisionLease = createAuthRevisionLeaseCoordinator()
type RecoverableAuthTarget =
    | { kind: 'initialization' }
    | { kind: 'user'; user: User }
let recoverableAuthTarget: RecoverableAuthTarget | null = null

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

const authDependenciesLoader = createRetryableSingleFlightLoader(loadAuthDependencies)

function getAuthDependencies() {
    return authDependenciesLoader.load()
}

function invalidatePendingAuthWork() {
    authRevisionLease.invalidate()
    recoverableAuthTarget = null
    authRecoveryCoordinator.clear()
}

function captureCurrentAuthLease() {
    return authRevisionLease.capture(currentUser.value?.uid)
}

function isCurrentAuthLease(lease: AuthRevisionLease) {
    return authRevisionLease.isLeaseCurrent(lease, currentUser.value?.uid)
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
    recoverableAuthTarget = result.status === 'recoverable' && observedUser
        ? { kind: 'user', user: observedUser }
        : null
    if (result.status !== 'recoverable') authRecoveryCoordinator.clear()
}

async function applyObservedAuthUser(user: User | null) {
    const observation = authRevisionLease.observe(user?.uid || null)
    const revision = observation.revision
    const previousObservedUid = observation.previousUid
    const observedAuthUid = observation.uid
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
        if (!authRevisionLease.isRevisionCurrent(revision)) return
    }

    let result: AuthenticatedUserSyncResult
    if (user) {
        result = await syncAuthenticatedUser(
            user,
            () => authRevisionLease.isRevisionCurrent(revision),
        )
    } else {
        await syncLoggedOutUser()
        result = { status: 'signed-out', user: null }
    }

    if (!authRevisionLease.isRevisionCurrent(revision)) return
    commitAuthSyncResult(result, user)
    isLoading.value = false

    if (result.status === 'recoverable') authRecoveryCoordinator.schedule()
    console.log('[AUTH] State changed | Session:', result.status, '| Role:', userRole.value)
}

const authRecoveryCoordinator = createAuthSessionRecoveryCoordinator({
    getStatus: () => authSessionStatus.value,
    getRecoverableTarget: () => recoverableAuthTarget,
    retryTarget: async (target: RecoverableAuthTarget) => {
        if (target.kind === 'initialization') {
            await initAuthListener()
            return
        }
        await applyObservedAuthUser(target.user)
    },
    getEventTarget: () => typeof window === 'undefined' ? null : window,
})

async function retryRecoverableAuthSession() {
    return authRecoveryCoordinator.retryNow()
}

async function initializeAuthListener() {
    isSecondaryLocalRuntime.value = isSecondaryLocalRuntimeRenderer()
    if (!shouldObserveFirebaseAuth()) {
        isLocalRuntimeAttested.value = await requestLocalRuntimeAttestation()
        isLoading.value = false
        authListenerInitialized = true
        if (!isLocalRuntimeAttested.value) {
            console.error('[AUTH] Secondary local runtime denied by main-process attestation')
        }
        return
    }
    authRecoveryCoordinator.installTriggers()
    let authRuntime
    try {
        authRuntime = await getAuthDependencies()
    } catch (error) {
        isLoading.value = false
        authSessionStatus.value = 'recoverable'
        recoverableAuthTarget = { kind: 'initialization' }
        console.error('[AUTH] Firebase Auth initialization failed:', error)
        authRecoveryCoordinator.schedule()
        return
    }
    const { auth, onAuthStateChanged } = authRuntime
    authListenerInitialized = true
    onAuthStateChanged(auth, async (user) => {
        await applyObservedAuthUser(user)
    })
}

async function initAuthListener() {
    if (authListenerInitialized) return
    if (authInitializationPromise) return authInitializationPromise
    authInitializationPromise = initializeAuthListener().finally(() => {
        authInitializationPromise = null
    })
    return authInitializationPromise
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
        invalidatePendingAuthWork()
        authError.value = null
        let translateError: ((code: string) => string) | null = null
        try {
            const { registerWithEmail, translateAuthError } = await getAuthDependencies()
            translateError = translateAuthError
            const { user } = await registerWithEmail({ email, password, nickname, firstName, lastName })
            console.log('[AUTH] Registration accepted')
            return { success: true, user }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
        } catch (error: any) {
            console.error('[AUTH] Register error:', error?.code || 'initialization-failed')
            authError.value = translateError?.(error?.code) || 'Errore di autenticazione'
            return { success: false, error: authError.value }
        }
    }

    const login = async (email: string, password: string) => {
        invalidatePendingAuthWork()
        authError.value = null
        let translateError: ((code: string) => string) | null = null
        try {
            const { loginWithEmail, translateAuthError } = await getAuthDependencies()
            translateError = translateAuthError
            const { user } = await loginWithEmail(email, password)
            console.log('[AUTH] Login accepted')
            return { success: true, user }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
        } catch (error: any) {
            console.error('[AUTH] Login error:', error?.code || 'initialization-failed')
            authError.value = translateError?.(error?.code) || 'Errore di autenticazione'
            return { success: false, error: authError.value }
        }
    }

    const logout = async () => {
        const previousUser = currentUser.value
        invalidatePendingAuthWork()
        currentUser.value = null
        authSessionStatus.value = 'initializing'
        await syncLoggedOutUser()
        try {
            const { logoutCurrentUser } = await getAuthDependencies()
            await logoutCurrentUser()
            console.log('[AUTH] Logged out')
            return { success: true }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
        } catch (error: any) {
            console.error('[AUTH] Logout error:', error)
            if (previousUser) {
                authSessionStatus.value = 'recoverable'
                recoverableAuthTarget = { kind: 'user', user: previousUser }
                authRecoveryCoordinator.schedule()
            }
            return { success: false, error: error.message }
        }
    }

    const resendVerificationEmail = async () => {
        const lease = captureCurrentAuthLease()
        if (!lease) {
            return { success: false, error: 'Utente non autenticato' }
        }
        const verification = await checkEmailVerified()
        if (!isCurrentAuthLease(lease)) {
            return { success: false, error: 'La sessione è cambiata. Riprova con l’utente corrente.' }
        }
        if (verification.verified) {
            return { success: true, alreadyVerified: true }
        }
        if (verification.error) {
            return { success: false, error: verification.error }
        }
        const { resendCurrentVerificationEmail, translateAuthError } = await getAuthDependencies()
        try {
            const user = currentUser.value
            if (!user || !isCurrentAuthLease(lease)) {
                return { success: false, error: 'La sessione è cambiata. Riprova con l’utente corrente.' }
            }
            await resendCurrentVerificationEmail(user)
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
        const lease = captureCurrentAuthLease()
        const user = currentUser.value
        if (!lease || !user) {
            return { verified: false, error: 'Utente non autenticato' }
        }
        const { refreshEmailVerificationState, translateAuthError } = await getAuthDependencies()
        try {
            const refreshed = await refreshEmailVerificationState(user)
            if (!isCurrentAuthLease(lease)) {
                return { verified: false, error: null, stale: true }
            }
            if (!refreshed.user) {
                await syncLoggedOutUser()
                commitAuthSyncResult({ status: 'signed-out', user: null }, null)
                return { verified: false, error: 'Sessione non più valida. Effettua nuovamente il login.' }
            }
            if (!AUTH_EMAIL_VERIFICATION_REQUIRED || refreshed.user.emailVerified) {
                const result = await syncAuthenticatedUser(
                    refreshed.user,
                    () => isCurrentAuthLease(lease),
                )
                if (!isCurrentAuthLease(lease)) {
                    return { verified: false, error: null, stale: true }
                }
                commitAuthSyncResult(result, refreshed.user)
                if (result.status !== 'ready') {
                    return {
                        verified: false,
                        error: 'Verifica completata, ma la sessione non è ancora disponibile. Controlla la connessione e riprova.',
                    }
                }
            } else {
                if (!isCurrentAuthLease(lease)) {
                    return { verified: false, error: null, stale: true }
                }
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
