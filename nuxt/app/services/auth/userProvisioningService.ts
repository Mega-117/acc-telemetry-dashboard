import type { User } from 'firebase/auth'
import { doc } from 'firebase/firestore'
import { db } from '~/config/firebase'
import { trackedGetDoc, trackedWriteBatch } from '~/composables/useFirebaseTracker'
import { buildPilotDirectoryFields } from '~/utils/pilotDirectoryFields'
import { buildPilotDirectoryProjection } from '~/services/pilotDirectoryProjectionService'

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
    const [userSnap, publicProfileSnap, pilotDirectorySnap] = await Promise.all([
        getDocTracked(userDocRef),
        getDocTracked(publicProfileRef),
        getDocTracked(pilotDirectoryRef)
    ])

    if (!userSnap.exists()) {
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

    const data = userSnap.data() || {}
    const role = data.role || 'pilot'
    const nickname = data.nickname || defaultNickname
    const directoryFields = buildPilotDirectoryFields({
        firstName: data.firstName || '',
        lastName: data.lastName || '',
        nickname,
        email: data.email || user.email
    })
    const shouldRepairUserDirectoryFields = needsUserDirectoryFieldRepair(data, user.uid, directoryFields)
    const shouldRepairEmailVerification = data.emailVerified !== user.emailVerified
    const repairedUserData = {
        ...data,
        uid: user.uid,
        nickname,
        ...(shouldRepairUserDirectoryFields ? directoryFields : {}),
        ...(shouldRepairEmailVerification ? { emailVerified: user.emailVerified } : {})
    }
    const publicProfileData = publicProfileSnap.exists() ? (publicProfileSnap.data() || {}) : {}
    const pilotDirectoryData = pilotDirectorySnap.exists() ? (pilotDirectorySnap.data() || {}) : {}
    const pilotDirectoryProjection = buildPilotDirectoryProjection(user.uid, repairedUserData)
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
        if (shouldRepairUserDirectoryFields || shouldRepairEmailVerification) {
            batch.set(userDocRef, {
                uid: user.uid,
                ...(shouldRepairUserDirectoryFields ? directoryFields : {}),
                ...(shouldRepairEmailVerification ? { emailVerified: user.emailVerified } : {})
            }, { merge: true })
        }
        if (shouldRepairPilotDirectory) {
            batch.set(pilotDirectoryRef, pilotDirectoryProjection, { merge: true })
        }
        if (shouldRepairPublicProfile) {
            batch.set(publicProfileRef, {
                ...buildPublicProfilePayload(user, nickname),
                avatarUrl: publicProfileData.avatarUrl ?? null,
                ...(typeof publicProfileData.createdAt === 'string'
                    ? { createdAt: publicProfileData.createdAt }
                    : { createdAt: new Date().toISOString() })
            }, { merge: true })
        }
        await batch.commit()
    }

    return { role, nickname }
}

export async function getUserProfile(uid: string): Promise<UserProfileDocument | null> {
    try {
        const docSnap = await getDocTracked(doc(db, 'users', uid))
        if (docSnap.exists()) {
            return docSnap.data() as UserProfileDocument
        }
        return null
    } catch (error) {
        console.error('[AUTH] Get profile error:', error)
        return null
    }
}
