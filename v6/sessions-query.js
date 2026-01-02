// ========================================
// SESSIONS QUERY - Fetch user sessions from Firestore
// ========================================
// Supports chunked rawData reconstruction

import { db } from './firebase-init.js';
import { collection, query, orderBy, getDocs, doc, getDoc } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

/**
 * Fetch session metadata (without rawData) for a user
 * @param {string} uid - User ID
 * @returns {Promise<Array>} Array of session metadata objects
 */
export async function fetchSessionMetas(uid) {
    console.log('🔍 Fetching session metas for UID:', uid);
    const path = `users/${uid}/sessions`;

    try {
        const sessionsRef = collection(db, path);

        // Try with orderBy first, fallback without if it fails
        let querySnapshot;
        try {
            const q = query(sessionsRef, orderBy('uploadedAt', 'desc'));
            querySnapshot = await getDocs(q);
        } catch (orderError) {
            console.warn('⚠️ orderBy failed, fetching without order:', orderError.message);
            querySnapshot = await getDocs(sessionsRef);
        }

        const metas = [];
        querySnapshot.forEach((docSnap) => {
            const data = docSnap.data();
            metas.push({
                sessionId: docSnap.id,
                fileHash: data.fileHash || null,
                fileName: data.fileName || null,
                uploadedAt: data.uploadedAt || null,
                meta: data.meta || {},
                summary: data.summary || {},
                rawChunkCount: data.rawChunkCount || 0,
                rawSizeBytes: data.rawSizeBytes || 0,
                rawEncoding: data.rawEncoding || null
            });
        });

        console.log('🔍 Found', metas.length, 'session metas');
        return metas;

    } catch (error) {
        console.error('❌ Error fetching session metas:', error);
        return [];
    }
}

/**
 * Fetch and reconstruct raw JSON data from chunks
 * @param {string} uid - User ID
 * @param {string} sessionId - Session document ID
 * @param {number} rawChunkCount - Number of chunks to fetch
 * @returns {Promise<object|null>} Reconstructed raw JSON object or null
 */
export async function fetchSessionRaw(uid, sessionId, rawChunkCount) {
    console.log(`📦 Fetching ${rawChunkCount} chunks for session:`, sessionId);

    try {
        if (rawChunkCount === 0) {
            console.warn('⚠️ Session has no chunks:', sessionId);
            return null;
        }

        // Read subcollection rawChunks ordered by idx
        const chunksPath = `users/${uid}/sessions/${sessionId}/rawChunks`;
        const chunksRef = collection(db, chunksPath);
        const q = query(chunksRef, orderBy('idx', 'asc'));
        const chunksSnap = await getDocs(q);

        // Collect chunks in order
        const chunks = [];
        chunksSnap.forEach(docSnap => {
            const data = docSnap.data();
            chunks.push({ idx: data.idx, chunk: data.chunk });
        });

        // Sort by idx (safety check)
        chunks.sort((a, b) => a.idx - b.idx);

        // Concatenate chunks
        const rawText = chunks.map(c => c.chunk).join('');
        console.log('📄 Reconstructed rawText, size:', rawText.length);

        // Parse JSON
        const rawObj = JSON.parse(rawText);

        // Attach Firestore metadata
        rawObj.__fs = {
            sessionId,
            uid
        };

        return rawObj;

    } catch (error) {
        console.error('❌ Error fetching session raw:', sessionId, error);
        return null;
    }
}

/**
 * Fetch all sessions with full raw data (with limited concurrency)
 * Returns rawObj with metadata attached (__sessionId, __fileHash, __fileName)
 * @param {string} uid - User ID
 * @returns {Promise<Array>} Array of raw session objects with metadata
 */
export async function fetchAllSessionsRaw(uid) {
    console.log('📥 Fetching all sessions raw for UID:', uid);

    // 1. Get all session metas
    const metas = await fetchSessionMetas(uid);
    if (metas.length === 0) {
        console.log('📥 No sessions found');
        return [];
    }

    console.log(`📥 Found ${metas.length} sessions, loading raw data...`);

    // 2. Fetch raw data with limited concurrency (3 at a time)
    const CONCURRENCY = 3;
    const results = [];

    for (let i = 0; i < metas.length; i += CONCURRENCY) {
        const batch = metas.slice(i, i + CONCURRENCY);
        const batchPromises = batch.map(async (meta) => {
            try {
                if (meta.rawChunkCount > 0) {
                    const rawObj = await fetchSessionRaw(uid, meta.sessionId, meta.rawChunkCount);
                    if (rawObj) {
                        // CRITICAL: Attach metadata for dedup and identification
                        rawObj.__sessionId = meta.sessionId;
                        rawObj.__fileHash = meta.fileHash;
                        rawObj.__fileName = meta.fileName;
                        return rawObj;
                    }
                }
            } catch (err) {
                console.error(`❌ Error loading session ${meta.sessionId}:`, err);
            }
            return null;
        });

        const batchResults = await Promise.all(batchPromises);
        results.push(...batchResults.filter(r => r !== null));
    }

    console.log(`✅ Loaded ${results.length} sessions with raw data`);
    return results;
}



/**
 * Fetch a single session by ID (metadata only)
 * @param {string} uid - User ID
 * @param {string} sessionId - Session document ID
 * @returns {Promise<object|null>} Session metadata or null
 */
export async function fetchSessionById(uid, sessionId) {
    try {
        const sessionRef = doc(db, `users/${uid}/sessions/${sessionId}`);
        const sessionSnap = await getDoc(sessionRef);

        if (sessionSnap.exists()) {
            return {
                sessionId: sessionSnap.id,
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
