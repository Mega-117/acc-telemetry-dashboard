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
        const chunksRef = collection(db, `users/${userId}/sessions/${sessionId}/rawChunks`)
        const chunks = (await getDocs(query(chunksRef))).docs

        // PIP-591: sessione e chunk cambiano insieme in un solo batch (atomico, entro il limite di 500).
        // Oltre il limite l'ordine evita fughe: in revoca i chunk diventano privati PRIMA della sessione,
        // cosi' un errore lascia la sessione pubblica e "Revoca tutto" la ritrova; in pubblicazione la
        // sessione va prima, cosi' un errore lascia chunk privati, mai chunk pubblici di una sessione privata.
        const MAX_CHUNKS_PER_BATCH = 450
        const commitChunks = async () => {
            for (let start = 0; start < chunks.length; start += MAX_CHUNKS_PER_BATCH) {
                const batch = trackedWriteBatch(db, CALLER)
                chunks.slice(start, start + MAX_CHUNKS_PER_BATCH).forEach(chunkDoc => batch.update(chunkDoc.ref, { isPublic }))
                await batch.commit()
            }
        }
        if (chunks.length < MAX_CHUNKS_PER_BATCH) {
            const batch = trackedWriteBatch(db, CALLER)
            batch.update(sessionRef, { isPublic })
            chunks.forEach(chunkDoc => batch.update(chunkDoc.ref, { isPublic }))
            await batch.commit()
        } else if (isPublic) {
            await updateDoc(sessionRef, { isPublic })
            await commitChunks()
        } else {
            await commitChunks()
            await updateDoc(sessionRef, { isPublic })
        }
        console.log(`[SHARING] Session ${sessionId} set isPublic=${isPublic} with ${chunks.length} chunks`)
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
