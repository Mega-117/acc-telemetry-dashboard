// @description Gestisce la condivisione delle sessioni tra utenti: rende le sessioni pubbliche/private, genera link di condivisione e revoca l'accesso.

import { useFirebaseAuth } from '~/composables/useFirebaseAuth'
import { collection, query, where, doc, type DocumentReference, type Query } from 'firebase/firestore'
import {
    trackedGetDocs,
    trackedGetCountFromServer,
    trackedUpdateDoc,
    trackedWriteBatch
} from './useFirebaseTracker'
import { db } from '~/config/firebase'

const CALLER = 'SessionSharing'
async function getDocs(q: Query) { return trackedGetDocs(q, CALLER) }
async function getCountFromServer(q: Query) { return trackedGetCountFromServer(q, CALLER) }
async function updateDoc(ref: DocumentReference, data: any) { return trackedUpdateDoc(ref, data, CALLER) }

export function useSessionSharing() {
    const { currentUser } = useFirebaseAuth()

    /**
     * Set a session as public or private.
     * Uses denormalization: updates isPublic on session AND all chunks.
     */
    async function setSessionPublic(sessionId: string, isPublic: boolean): Promise<void> {
        const userId = currentUser.value?.uid
        if (!userId) throw new Error('Not authenticated')

        const sessionRef = doc(db, `users/${userId}/sessions/${sessionId}`)
        await updateDoc(sessionRef, { isPublic })
        console.log(`[SHARING] Session ${sessionId} set isPublic=${isPublic}`)

        const chunksRef = collection(db, `users/${userId}/sessions/${sessionId}/rawChunks`)
        const chunksSnap = await getDocs(query(chunksRef))

        if (chunksSnap.docs.length > 0) {
            const batch = trackedWriteBatch(db, CALLER)
            chunksSnap.docs.forEach(chunkDoc => {
                batch.update(chunkDoc.ref, { isPublic })
            })
            await batch.commit()
            console.log(`[SHARING] Updated ${chunksSnap.docs.length} chunks with isPublic=${isPublic}`)
        }
    }

    /**
     * Count how many sessions are currently shared (isPublic=true).
     */
    async function countSharedSessions(): Promise<number> {
        const userId = currentUser.value?.uid
        if (!userId) return 0

        const sessionsRef = collection(db, `users/${userId}/sessions`)
        const q = query(sessionsRef, where('isPublic', '==', true))
        const snap = await getCountFromServer(q)
        return Number(snap.data().count || 0)
    }

    /**
     * Revoke all shared sessions (set isPublic=false on all).
     * Returns the number of sessions revoked.
     */
    async function revokeAllSharedSessions(): Promise<number> {
        const userId = currentUser.value?.uid
        if (!userId) throw new Error('Not authenticated')

        const sessionsRef = collection(db, `users/${userId}/sessions`)
        const q = query(sessionsRef, where('isPublic', '==', true))
        const snap = await getDocs(q)

        let count = 0
        for (const sessionDoc of snap.docs) {
            await setSessionPublic(sessionDoc.id, false)
            count++
        }

        console.log(`[SHARING] Revoked ${count} shared sessions`)
        return count
    }

    /**
     * Generate a shareable link for a session.
     * Also sets the session as public if not already.
     */
    async function generateShareLink(sessionId: string): Promise<string> {
        const userId = currentUser.value?.uid
        if (!userId) throw new Error('Not authenticated')

        await setSessionPublic(sessionId, true)

        const baseUrl = typeof window !== 'undefined' ? window.location.origin : ''
        return `${baseUrl}/sessioni/${sessionId}?userId=${userId}`
    }

    return {
        setSessionPublic,
        countSharedSessions,
        revokeAllSharedSessions,
        generateShareLink,
    }
}
