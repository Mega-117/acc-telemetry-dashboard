import type { User } from 'firebase/auth'
import { doc } from 'firebase/firestore'
import { db } from '~/config/firebase'
import { trackedGetDoc, trackedWriteBatch } from '~/composables/useFirebaseTracker'
import { buildPilotDirectoryFields } from '~/utils/pilotDirectoryFields'
import { buildPilotDirectoryProjection } from '~/services/pilotDirectoryProjectionService'
// PIP-442: `users/{uid}` viene letto una volta per avvio e condiviso; questo modulo e' il
// primo lettore (login/avvio) e aggiorna la copia con cio' che scrive.
import { loadOwnerDocument, rememberOwnerDocumentPatch } from '~/repositories/ownerDocumentRepository'
import { hasProfileProjectionReceipt, rememberProfileProjectionReceipt } from './profileProjectionReceipt'

const AUTH_PROVISION_CALLER = 'AuthProvisioning'

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
async function getDocTracked(ref: any) {
    return trackedGetDoc(ref, AUTH_PROVISION_CALLER)
}

export interface EnsuredUserProfile {
    role: string
    nickname: string
}

export interface UserProfileDocument extends Record<string, unknown> {
    nickname?: string
    displayName?: string
    coachId?: string | null
}

function getDefaultNickname(user: Pick<User, 'displayName' | 'email'>) {
    return user.displayName || user.email?.split('@')[0] || 'Utente'
}

function buildPublicProfilePayload(user: Pick<User, 'uid' | 'displayName' | 'email'>, nickname?: string) {
    return {
        uid: user.uid,
        nickname: nickname || getDefaultNickname(user),
        avatarUrl: null,
        updatedAt: new Date().toISOString()
    }
}

// PIP-591 (X-A06-10): su un profilo pubblico che esiste, le Rules lasciano al proprietario solo
// nickname, avatarUrl e updatedAt. Aggiungere createdAt a un profilo vecchio che non l'ha faceva
// rifiutare l'intero batch di provisioning, e con lui l'accesso. La creazione resta completa.
// Un profilo con uid sbagliato o mancante si ripara solo da admin: null = non toccarlo, cosi'
// il resto del provisioning va a buon fine.
export function buildPublicProfileRepair(
    user: Pick<User, 'uid' | 'displayName' | 'email'>,
    nickname: string,
    exists: boolean,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
    current: any
): Record<string, unknown> | null {
    const payload = buildPublicProfilePayload(user, nickname)
    if (!exists) return { ...payload, createdAt: new Date().toISOString() }
    if (current?.uid !== user.uid) {
        console.warn('[AUTH] Profilo pubblico con uid non valido: lo ripara un admin.')
        return null
    }
    return { nickname: payload.nickname, avatarUrl: current?.avatarUrl ?? null, updatedAt: payload.updatedAt }
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
function sameStringArray(a: any, b: any): boolean {
    if (!Array.isArray(a) || !Array.isArray(b)) return false
    if (a.length !== b.length) return false
    return a.every((value, index) => value === b[index])
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
function needsUserDirectoryFieldRepair(data: any, uid: string, directoryFields: ReturnType<typeof buildPilotDirectoryFields>): boolean {
    return data.uid !== uid
        || data.directorySortName !== directoryFields.directorySortName
        || !sameStringArray(data.searchPrefixes, directoryFields.searchPrefixes)
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
function needsPublicProfileRepair(data: any, uid: string, nickname: string): boolean {
    return data.uid !== uid
        || data.nickname !== nickname
        || !('avatarUrl' in data)
        || typeof data.updatedAt !== 'string'
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- TODO: add precise type
function needsPilotDirectoryRepair(data: any, projection: Record<string, unknown>): boolean {
    return Object.entries(projection).some(([key, value]) => {
        if (Array.isArray(value)) return !sameStringArray(data[key], value)
        return data[key] !== value
    })
}

export async function createInitialUserDocument(
    user: User,
    {
        firstName = '',
        lastName = '',
        nickname
    }: {
        firstName?: string
        lastName?: string
        nickname: string
    }
) {
    const userDocRef = doc(db, 'users', user.uid)
    const publicProfileRef = doc(db, 'publicProfiles', user.uid)
    const pilotDirectoryRef = doc(db, 'pilotDirectory', user.uid)

    const userPayload = {
        uid: user.uid,
        firstName,
        lastName,
        nickname,
        email: user.email,
        role: 'pilot',
        coachId: null,
        createdAt: new Date().toISOString(),
        emailVerified: user.emailVerified,
        ...buildPilotDirectoryFields({
            firstName,
            lastName,
            nickname,
            email: user.email
        })
    }

    const batch = trackedWriteBatch(db, AUTH_PROVISION_CALLER)
    batch.set(userDocRef, userPayload)
    batch.set(pilotDirectoryRef, buildPilotDirectoryProjection(user.uid, userPayload), { merge: true })
    batch.set(publicProfileRef, {
        uid: user.uid,
        nickname,
        avatarUrl: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    }, { merge: true })
    await batch.commit()

    return {
        role: 'pilot',
        nickname
    }
}

export async function ensureUserDocument(user: User): Promise<EnsuredUserProfile> {
    const defaultNickname = getDefaultNickname(user)
    const userDocRef = doc(db, 'users', user.uid)
    const publicProfileRef = doc(db, 'publicProfiles', user.uid)
    const pilotDirectoryRef = doc(db, 'pilotDirectory', user.uid)
    const userSnap = await loadOwnerDocument(user.uid, { caller: AUTH_PROVISION_CALLER })

    if (!userSnap.exists) {
        const userPayload = {
            uid: user.uid,
            email: user.email,
            nickname: defaultNickname,
            role: 'pilot',
            coachId: null,
            createdAt: new Date().toISOString(),
            emailVerified: user.emailVerified,
            ...buildPilotDirectoryFields({
                nickname: defaultNickname,
                email: user.email
            })
        }
        const batch = trackedWriteBatch(db, AUTH_PROVISION_CALLER)
        batch.set(userDocRef, userPayload)
        batch.set(pilotDirectoryRef, buildPilotDirectoryProjection(user.uid, userPayload), { merge: true })
        batch.set(publicProfileRef, buildPublicProfilePayload(user, defaultNickname), { merge: true })
        await batch.commit()
        return {
            role: 'pilot',
            nickname: defaultNickname
        }
    }

    const data = userSnap.data || {}
    const role = data.role || 'pilot'
    const nickname = data.nickname || defaultNickname
    const directoryFields = buildPilotDirectoryFields({
        firstName: data.firstName || '',
        lastName: data.lastName || '',
        nickname,
        email: user.email || data.email
    })
    const shouldRepairUserDirectoryFields = needsUserDirectoryFieldRepair(data, user.uid, directoryFields)
    // PIP-591: le Rules vogliono l'email del documento uguale a quella del token. Dopo un cambio email
    // il documento ha ancora la vecchia: ogni scrittura su users/{uid} verrebbe rifiutata, riparazione compresa.
    // Senza campo email le Rules non chiedono nulla: si ripara un campo presente (anche null) e diverso.
    const shouldRepairEmail = typeof user.email === 'string' && user.email !== ''
        && 'email' in data && data.email !== user.email
    const shouldRepairEmailVerification = shouldRepairEmail || data.emailVerified !== user.emailVerified
    const emailPatch = {
        ...(shouldRepairEmail ? { email: user.email } : {}),
        ...(shouldRepairEmailVerification ? { emailVerified: user.emailVerified } : {})
    }
    const repairedUserData = {
        ...data,
        uid: user.uid,
        nickname,
        ...(shouldRepairUserDirectoryFields ? directoryFields : {}),
        ...emailPatch
    }
    const pilotDirectoryProjection = buildPilotDirectoryProjection(user.uid, repairedUserData)
    const receiptProjection = { nickname, directory: pilotDirectoryProjection }
    if (!shouldRepairUserDirectoryFields && !shouldRepairEmailVerification
        && hasProfileProjectionReceipt(user.uid, receiptProjection)) return { role, nickname }
    const [publicProfileSnap, pilotDirectorySnap] = await Promise.all([
        getDocTracked(publicProfileRef), getDocTracked(pilotDirectoryRef)
    ])
    const publicProfileData = publicProfileSnap.exists() ? (publicProfileSnap.data() || {}) : {}
    const pilotDirectoryData = pilotDirectorySnap.exists() ? (pilotDirectorySnap.data() || {}) : {}
    const shouldRepairPublicProfile = !publicProfileSnap.exists()
        || needsPublicProfileRepair(publicProfileData, user.uid, nickname)
    const shouldRepairPilotDirectory = !pilotDirectorySnap.exists()
        || needsPilotDirectoryRepair(pilotDirectoryData, pilotDirectoryProjection)

    if (
        shouldRepairUserDirectoryFields
        || shouldRepairEmailVerification
        || shouldRepairPublicProfile
        || shouldRepairPilotDirectory
    ) {
        const batch = trackedWriteBatch(db, AUTH_PROVISION_CALLER)
        const userPatch = {
            uid: user.uid,
            ...(shouldRepairUserDirectoryFields ? directoryFields : {}),
            ...emailPatch
        }
        if (shouldRepairUserDirectoryFields || shouldRepairEmailVerification) {
            batch.set(userDocRef, userPatch, { merge: true })
        }
        if (shouldRepairPilotDirectory) {
            batch.set(pilotDirectoryRef, pilotDirectoryProjection, { merge: true })
        }
        const publicProfileRepair = shouldRepairPublicProfile
            ? buildPublicProfileRepair(user, nickname, publicProfileSnap.exists(), publicProfileData)
            : null
        if (publicProfileRepair) {
            batch.set(publicProfileRef, publicProfileRepair, { merge: true })
        }
        await batch.commit()
        if (shouldRepairUserDirectoryFields || shouldRepairEmailVerification) {
            rememberOwnerDocumentPatch(user.uid, userPatch)
        }
    }

    rememberProfileProjectionReceipt(user.uid, receiptProjection)
    return { role, nickname }
}

export async function getUserProfile(uid: string, options: { fresh?: boolean } = {}): Promise<UserProfileDocument | null> {
    try {
        const snapshot = await loadOwnerDocument(uid, { fresh: options.fresh === true, caller: AUTH_PROVISION_CALLER })
        return snapshot.exists ? (snapshot.data as UserProfileDocument) : null
    } catch (error) {
        console.error('[AUTH] Get profile error:', error)
        return null
    }
}
