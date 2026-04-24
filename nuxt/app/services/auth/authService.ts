import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    sendEmailVerification,
    updateProfile,
    type User
} from 'firebase/auth'
import { auth } from '~/config/firebase'
import { createInitialUserDocument } from './userProvisioningService'

export function translateAuthError(code: string): string {
    const messages: Record<string, string> = {
        'auth/email-already-in-use': 'Email gia registrata',
        'auth/weak-password': 'Password troppo debole (min. 6 caratteri)',
        'auth/invalid-email': 'Email non valida',
        'auth/user-not-found': 'Utente non trovato',
        'auth/wrong-password': 'Password errata',
        'auth/invalid-credential': 'Credenziali non valide',
        'auth/too-many-requests': 'Troppi tentativi, riprova piu tardi',
        'auth/network-request-failed': 'Errore di rete, controlla la connessione'
    }
    return messages[code] || 'Errore di autenticazione'
}

export async function registerWithEmail(params: {
    email: string
    password: string
    nickname: string
    firstName?: string
    lastName?: string
}) {
    const { email, password, nickname, firstName = '', lastName = '' } = params
    const userCredential = await createUserWithEmailAndPassword(auth, email, password)
    const user = userCredential.user

    await updateProfile(user, { displayName: nickname })
    await createInitialUserDocument(user, { firstName, lastName, nickname })
    await sendEmailVerification(user)

    return { user }
}

export async function loginWithEmail(email: string, password: string) {
    const userCredential = await signInWithEmailAndPassword(auth, email, password)
    return { user: userCredential.user }
}

export async function logoutCurrentUser() {
    await signOut(auth)
}

export async function resendCurrentVerificationEmail(user: User) {
    await sendEmailVerification(user)
}

export async function refreshEmailVerificationState(user: User | null) {
    if (!user) {
        return { verified: false, user: null }
    }

    await user.reload()
    return {
        verified: auth.currentUser?.emailVerified ?? false,
        user: auth.currentUser
    }
}
