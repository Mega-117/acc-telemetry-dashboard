import type { User } from 'firebase/auth'
import { doc } from 'firebase/firestore'
import { db } from '~/config/firebase'
import { trackedGetDoc, trackedSetDoc } from '~/composables/useFirebaseTracker'

const AUTH_PROVISION_CALLER = 'AuthProvisioning'

async function getDocTracked(ref: any) {
    return trackedGetDoc(ref, AUTH_PROVISION_CALLER)
}

async function setDocTracked(ref: any, data: any, options?: any) {
    if (options) {
        return trackedSetDoc(ref, data, options, AUTH_PROVISION_CALLER)
    }
    return trackedSetDoc(ref, data, AUTH_PROVISION_CALLER)
}

export interface EnsuredUserProfile {
    role: string
    nickname: string
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

    await setDocTracked(userDocRef, {
        firstName,
        lastName,
        nickname,
        email: user.email,
        role: 'pilot',
        coachId: null,
        createdAt: new Date().toISOString(),
        emailVerified: user.emailVerified
    })

    await setDocTracked(publicProfileRef, {
        uid: user.uid,
        nickname,
        avatarUrl: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
    }, { merge: true })

    return {
        role: 'pilot',
        nickname
    }
}

export async function ensureUserDocument(user: User): Promise<EnsuredUserProfile> {
    const defaultNickname = getDefaultNickname(user)

    try {
        const userDocRef = doc(db, 'users', user.uid)
        const docSnap = await getDocTracked(userDocRef)

        const publicProfileRef = doc(db, 'publicProfiles', user.uid)
        const publicProfilePayload = buildPublicProfilePayload(user, defaultNickname)

        if (!docSnap.exists()) {
            await setDocTracked(userDocRef, {
                email: user.email,
                nickname: defaultNickname,
                role: 'pilot',
                createdAt: new Date().toISOString(),
                emailVerified: user.emailVerified
            })
            await setDocTracked(publicProfileRef, publicProfilePayload, { merge: true })
            return {
                role: 'pilot',
                nickname: defaultNickname
            }
        }

        const data = docSnap.data() || {}
        const role = data.role || 'pilot'
        const nickname = data.nickname || defaultNickname

        await setDocTracked(publicProfileRef, {
            uid: user.uid,
            nickname,
            avatarUrl: data.avatarUrl || null,
            updatedAt: new Date().toISOString()
        }, { merge: true })

        return {
            role,
            nickname
        }
    } catch (e) {
        console.error('[AUTH] Failed to ensure user document:', e)
        return {
            role: 'pilot',
            nickname: defaultNickname
        }
    }
}

export async function getUserProfile(uid: string) {
    try {
        const docSnap = await getDocTracked(doc(db, 'users', uid))
        if (docSnap.exists()) {
            return docSnap.data()
        }
        return null
    } catch (error) {
        console.error('[AUTH] Get profile error:', error)
        return null
    }
}
