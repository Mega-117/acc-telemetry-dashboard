import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    sendEmailVerification,
    sendPasswordResetEmail,
    updateProfile,
    verifyBeforeUpdateEmail,
    type User
} from 'firebase/auth'
import { auth } from '~/config/firebaseAuth'
import { refreshUserCredentials } from './authSessionPolicy'
import { createInitialUserDocument } from './userProvisioningService'
import { observeFirebaseAuthOperation } from '~/services/monitoring/firebaseOpsJournal'
import type { RegisterConsent } from '~/utils/legalVersions'
import { useI18n, type TranslationKey } from '~/i18n'

// Con la protezione anti-enumerazione attiva sul progetto - `accsuite117` la usa -
// Firebase non distingue piu' "utente inesistente" da "password errata": nega
// l'accesso senza rivelare quali indirizzi sono registrati, e i tre codici
// storici arrivano tutti come `auth/invalid-credential`. Un messaggio unico e'
// quindi l'unica risposta onesta, e resta corretta anche se la protezione
// venisse disattivata: i codici tornerebbero distinti ma direbbero comunque
// all'utente la sola cosa utile, ossia che cosa controllare.
const INVALID_LOGIN_MESSAGE: TranslationKey = 'auth.service.invalidLogin'

// PIP-665: codes map to dictionary keys; the text follows the interface language.
export function translateAuthError(code: string): string {
    const messages: Record<string, TranslationKey> = {
        'auth/email-already-in-use': 'auth.service.emailInUse',
        'auth/weak-password': 'auth.service.weakPassword',
        'auth/invalid-email': 'auth.service.invalidEmail',
        'auth/user-not-found': INVALID_LOGIN_MESSAGE,
        'auth/wrong-password': INVALID_LOGIN_MESSAGE,
        'auth/invalid-credential': INVALID_LOGIN_MESSAGE,
        'auth/requires-recent-login': 'auth.service.recentLogin',
        'auth/too-many-requests': 'auth.service.tooManyRequests',
        'auth/network-request-failed': 'auth.service.network',
        'auth/operation-not-allowed': 'auth.service.resetUnavailable',
        'auth/unauthorized-continue-uri': 'auth.service.continueUriUnauthorized',
        'auth/invalid-continue-uri': 'auth.service.continueUriInvalid',
        'auth/missing-continue-uri': 'auth.service.continueUriInvalid'
    }
    return useI18n().t(messages[code] || 'auth.service.generic')
}

export async function registerWithEmail(params: {
    email: string
    password: string
    nickname: string
    firstName?: string
    lastName?: string
    consent?: RegisterConsent
}) {
    const { email, password, nickname, firstName = '', lastName = '', consent } = params
    const userCredential = await observeFirebaseAuthOperation('register', () => createUserWithEmailAndPassword(auth, email, password))
    const user = userCredential.user

    let profileReady = true
    let verificationEmailSent = true

    try {
        await observeFirebaseAuthOperation('update-profile', () => updateProfile(user, { displayName: nickname }))
    } catch (error) {
        profileReady = false
        console.warn('[AUTH] Registration display profile deferred:', getAuthErrorCode(error))
    }

    try {
        await createInitialUserDocument(user, { firstName, lastName, nickname, consent })
    } catch (error) {
        profileReady = false
        console.warn('[AUTH] Registration Firestore provisioning deferred:', getAuthErrorCode(error))
    }

    try {
        await observeFirebaseAuthOperation('verification-email', () => sendEmailVerification(user))
    } catch (error) {
        verificationEmailSent = false
        console.warn('[AUTH] Registration verification email deferred:', getAuthErrorCode(error))
    }

    return { user, profileReady, verificationEmailSent }
}

function getAuthErrorCode(error: unknown): string {
    if (error && typeof error === 'object' && 'code' in error) {
        const code = (error as { code?: unknown }).code
        if (typeof code === 'string') return code
    }
    return 'unknown'
}

export async function loginWithEmail(email: string, password: string) {
    const userCredential = await observeFirebaseAuthOperation('login', () => signInWithEmailAndPassword(auth, email, password))
    // signInWithEmailAndPassword can resolve before fields such as
    // emailVerified reflect a verification completed in another session.
    // Refresh the canonical Auth user before the UI decides which surface to
    // expose, otherwise a verified user can remain trapped in the email gate.
    await refreshUserCredentials(userCredential.user)
    return { user: auth.currentUser ?? userCredential.user }
}

export async function sendPasswordResetWithEmail(email: string) {
    await observeFirebaseAuthOperation('password-reset', () => sendPasswordResetEmail(auth, email))
}

export async function logoutCurrentUser() {
    await observeFirebaseAuthOperation('logout', () => signOut(auth))
}

export async function resendCurrentVerificationEmail(user: User) {
    await observeFirebaseAuthOperation('verification-email', () => sendEmailVerification(user))
}

/**
 * Corregge l'indirizzo di un account che non puo' ricevere posta, tipicamente
 * per un refuso nel dominio scritto in registrazione.
 *
 * Usa `verifyBeforeUpdateEmail` e non `updateEmail` di proposito: l'indirizzo
 * sull'account cambia **solo** dopo che l'utente ha aperto il link recapitato
 * al nuovo indirizzo. Se anche il secondo tentativo fosse sbagliato, l'account
 * resta esattamente com'era invece di finire su una casella ancora piu'
 * irraggiungibile - la correzione non puo' peggiorare la situazione.
 */
export async function sendVerificationToUpdatedEmail(user: User, newEmail: string) {
    await observeFirebaseAuthOperation('verify-new-email', () => verifyBeforeUpdateEmail(user, newEmail))
}

export async function refreshEmailVerificationState(user: User | null) {
    if (!user) {
        return { verified: false, user: null }
    }

    // Firestore Rules bind emailVerified to the Auth token claim. Refresh the
    // token before provisioning mirrors the reloaded User state into Firestore.
    await refreshUserCredentials(user)
    return {
        verified: auth.currentUser?.emailVerified ?? false,
        user: auth.currentUser
    }
}
