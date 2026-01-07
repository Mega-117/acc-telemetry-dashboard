// ========================================
// UPLOAD SESSIONS - Firestore upload with CHUNKED rawData
// ========================================
// Supports UPSERT for live session updates

import { db } from './firebase-init.js';
import { doc, setDoc, getDoc, getDocs, collection, serverTimestamp, deleteDoc } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

// Constants
const CHUNK_SIZE = 400000;

/**
 * Calculate SHA-256 hash
 */
async function calculateHash(input) {
    let data;
    if (typeof input === 'string') {
        data = new TextEncoder().encode(input);
    } else {
        data = await input.arrayBuffer();
    }
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Generate stable session ID from date_start and track
 */
function generateSessionId(dateStart, track) {
    const base = `${dateStart}_${track}`.replace(/[^a-zA-Z0-9]/g, '_');
    return base.substring(0, 100);
}

/**
 * Check if session exists
 */
async function getExistingSession(uid, sessionId) {
    const sessionRef = doc(db, `users/${uid}/sessions/${sessionId}`);
    const snap = await getDoc(sessionRef);
    return snap.exists() ? { id: sessionId, ...snap.data() } : null;
}

/**
 * Delete old chunks before re-upload
 */
async function deleteOldChunks(uid, sessionId) {
    try {
        const chunksRef = collection(db, `users/${uid}/sessions/${sessionId}/rawChunks`);
        const snapshot = await getDocs(chunksRef);
        const deletePromises = snapshot.docs.map(d => deleteDoc(d.ref));
        await Promise.all(deletePromises);
    } catch (e) {
        console.warn('[UPLOAD] Error deleting old chunks:', e.message);
    }
}

/**
 * Extract metadata from raw JSON object
 */
function extractMetadata(rawObj) {
    const sessionInfo = rawObj.session_info || {};

    const meta = {
        track: sessionInfo.track || rawObj.track || 'Unknown',
        date_start: sessionInfo.date_start || rawObj.date || new Date().toISOString(),
        date_end: sessionInfo.date_end || null,
        car: sessionInfo.car_model || sessionInfo.car || rawObj.car || null,
        session_type: sessionInfo.session_type ?? null,
        driver: sessionInfo.driver || null
    };

    const summary = {
        laps: sessionInfo.laps_total || rawObj.laps?.length || 0,
        lapsValid: sessionInfo.laps_valid || 0,
        bestLap: sessionInfo.session_best_lap || rawObj.bestLap || null,
        avgCleanLap: sessionInfo.avg_clean_lap || null,
        totalTime: sessionInfo.total_drive_time_ms || 0,
        stintCount: rawObj.stints?.length || 0
    };

    return { meta, summary };
}

/**
 * Split string into chunks
 */
function splitIntoChunks(str, size) {
    const chunks = [];
    for (let i = 0; i < str.length; i += size) {
        chunks.push(str.slice(i, i + size));
    }
    return chunks;
}

/**
 * Upload or update session (UPSERT)
 */
export async function uploadOrUpdateSession(rawObj, rawText, fileName, uid) {
    try {
        const { meta, summary } = extractMetadata(rawObj);
        const sessionId = generateSessionId(meta.date_start, meta.track);
        const fileHash = await calculateHash(rawText);
        const existing = await getExistingSession(uid, sessionId);

        let isUpdate = false;
        if (existing) {
            if (existing.fileHash === fileHash) {
                return { status: 'unchanged', fileName, sessionId };
            }
            isUpdate = true;
            await deleteOldChunks(uid, sessionId);
        }

        const chunks = splitIntoChunks(rawText, CHUNK_SIZE);

        const sessionRef = doc(db, `users/${uid}/sessions/${sessionId}`);
        await setDoc(sessionRef, {
            fileHash,
            fileName,
            uploadedAt: serverTimestamp(),
            meta,
            summary,
            rawChunkCount: chunks.length,
            rawSizeBytes: rawText.length,
            rawEncoding: 'json-string',
            version: (existing?.version || 0) + 1
        });

        const uploadRef = doc(db, `users/${uid}/uploads/${fileHash}`);
        await setDoc(uploadRef, { fileName, uploadedAt: serverTimestamp(), sessionId });

        for (let idx = 0; idx < chunks.length; idx++) {
            const chunkRef = doc(db, `users/${uid}/sessions/${sessionId}/rawChunks/${idx}`);
            await setDoc(chunkRef, { idx, chunk: chunks[idx] });
        }

        return {
            status: isUpdate ? 'updated' : 'created',
            fileName, fileHash, sessionId, meta, summary, rawObj
        };

    } catch (error) {
        console.error('[UPLOAD] Error:', error);
        return { status: 'error', fileName, error: error.message };
    }
}

/**
 * Handle single file upload (main export)
 */
export async function handleFileUpload(file, uid) {
    const fileName = file.name;

    try {
        if (!file.name.endsWith('.json')) {
            return { status: 'error', fileName, error: 'File must be .json' };
        }

        const rawText = await file.text();
        const rawObj = JSON.parse(rawText);
        return await uploadOrUpdateSession(rawObj, rawText, fileName, uid);

    } catch (error) {
        return { status: 'error', fileName, error: error.message };
    }
}

/**
 * Handle multiple file uploads
 */
export async function handleMultipleFileUploads(files, uid) {
    const results = [];
    for (const file of files) {
        const result = await handleFileUpload(file, uid);
        results.push(result);
    }
    return results;
}

/**
 * Upload from Electron - receives parsed JSON object
 */
export async function uploadFromElectron(rawObj, fileName, uid) {
    try {
        const rawText = JSON.stringify(rawObj);
        return await uploadOrUpdateSession(rawObj, rawText, fileName, uid);
    } catch (error) {
        return { status: 'error', fileName, error: error.message };
    }
}
