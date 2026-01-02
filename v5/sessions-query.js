// Sessions Query Module - Fetch user sessions from Firestore
// Companion to upload-sessions.js

import { getFirestore, collection, query, orderBy, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

const db = getFirestore();

/**
 * Fetch all sessions for a user, ordered by upload date (newest first)
 * @param {string} uid - User ID
 * @returns {Promise<Array>} Array of session objects with {id, track, date, summary, uploadedAt}
 */
export async function fetchSessions(uid) {
    try {
        const sessionsRef = collection(db, `users/${uid}/sessions`);
        const q = query(sessionsRef, orderBy('uploadedAt', 'desc'));
        const querySnapshot = await getDocs(q);

        const sessions = [];
        querySnapshot.forEach((doc) => {
            sessions.push({
                id: doc.id,
                track: doc.data().track,
                date: doc.data().date,
                summary: doc.data().summary,
                uploadedAt: doc.data().uploadedAt,
                fileHash: doc.data().fileHash
            });
        });

        console.log(`📥 Fetched ${sessions.length} sessions for user ${uid}`);
        return sessions;

    } catch (error) {
        console.error('Error fetching sessions:', error);
        return [];
    }
}

/**
 * Fetch a single session by ID
 * @param {string} uid - User ID
 * @param {string} sessionId - Session document ID
 * @returns {Promise<object|null>} Session object or null if not found
 */
export async function fetchSessionById(uid, sessionId) {
    try {
        const sessionRef = doc(db, `users/${uid}/sessions/${sessionId}`);
        const sessionSnap = await getDoc(sessionRef);

        if (sessionSnap.exists()) {
            return {
                id: sessionSnap.id,
                ...sessionSnap.data()
            };
        } else {
            console.warn(`Session ${sessionId} not found`);
            return null;
        }
    } catch (error) {
        console.error('Error fetching session:', error);
        return null;
    }
}

// Usage examples:
// import { fetchSessions } from './sessions-query.js';
// const sessions = await fetchSessions(auth.currentUser.uid);
// sessions.forEach(s => console.log(`${s.track} - ${s.summary.laps} laps`));
