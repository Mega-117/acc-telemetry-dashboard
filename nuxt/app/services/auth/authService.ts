import {
    createUserWithEmailAndPassword,
    signInWithEmailAndPassword,
    signOut,
    sendEmailVerification,
    sendPasswordResetEmail,
    updateProfile,
    type User
} from 'firebase/auth'
import { auth } from '~/config/firebaseAuth'
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
        'auth/network-request-failed': 'Errore di rete, controlla la connessione',
        'auth/operation-not-allowed': 'Il recupero password non è disponibile al momento',
        'auth/unauthorized-continue-uri': 'Il link di recupero non è configurato per questa app',
        'auth/invalid-continue-uri': 'Il link di recupero non è configurato correttamente',
        'auth/missing-continue-uri': 'Il link di recupero non è configurato correttamente'
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
    // signInWithEmailAndPassword can resolve before fields such as
    // emailVerified reflect a verification completed in another session.
    // Refresh the canonical Auth user before the UI decides which surface to
    // expose, otherwise a verified user can remain trapped in the email gate.
    await userCredential.user.reload()
    await userCredential.user.getIdToken(true)
    return { user: auth.currentUser ?? userCredential.user }
}

export async function sendPasswordResetWithEmail(email: string) {
    await sendPasswordResetEmail(auth, email)
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
