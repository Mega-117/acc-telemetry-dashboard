// ========================================
// UPLOAD SESSIONS - Firestore upload with CHUNKED rawData
// ========================================
// Solves 1 MiB document limit by splitting raw JSON into chunks

import { db } from './firebase-init.js';
import { doc, setDoc, getDoc, collection, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

// Constants
const CHUNK_SIZE = 400000; // ~400KB per chunk (safe under 1MB limit)

/**
 * Calculate SHA-256 hash of file content
 * @param {File} file - File to hash
 * @returns {Promise<string>} Hex string hash
 */
async function calculateFileHash(file) {
    const arrayBuffer = await file.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', arrayBuffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Check if file hash already exists (duplicate detection)
 * @param {string} uid - User ID
 * @param {string} fileHash - File hash to check
 * @returns {Promise<object|null>} Existing upload info or null
 */
async function checkDuplicate(uid, fileHash) {
    const uploadRef = doc(db, `users/${uid}/uploads/${fileHash}`);
    const uploadSnap = await getDoc(uploadRef);
    if (uploadSnap.exists()) {
        return uploadSnap.data();
    }
    return null;
}

/**
 * Extract metadata from raw JSON object
 * @param {object} rawObj - Parsed JSON object
 * @returns {object} { meta, summary }
 */
function extractMetadata(rawObj) {
    const sessionInfo = rawObj.session_info || {};

    const meta = {
        track: sessionInfo.track || rawObj.track || 'Unknown',
        date_start: sessionInfo.date_start || rawObj.date || new Date().toISOString(),
        car: sessionInfo.car_model || sessionInfo.car || rawObj.car || null,
        session_type: sessionInfo.session_type || null
    };

    const summary = {
        laps: sessionInfo.laps_total || rawObj.laps?.length || 0,
        bestLap: sessionInfo.session_best_lap || rawObj.bestLap || null,
        totalTime: sessionInfo.total_drive_time_ms || 0
    };

    return { meta, summary };
}

/**
 * Split string into chunks
 * @param {string} str - String to split
 * @param {number} size - Max chunk size in characters
 * @returns {string[]} Array of chunks
 */
function splitIntoChunks(str, size) {
    const chunks = [];
    for (let i = 0; i < str.length; i += size) {
        chunks.push(str.slice(i, i + size));
    }
    return chunks;
}

/**
 * Handle single file upload with chunking
 * @param {File} file - JSON file to upload
 * @param {string} uid - User ID (MUST be auth.currentUser.uid)
 * @returns {Promise<object>} Upload result
 */
export async function handleFileUpload(file, uid) {
    const fileName = file.name;
    console.log('📤 Upload started:', fileName, 'UID:', uid);

    try {
        // 1. Validate file type
        if (!file.name.endsWith('.json')) {
            return {
                status: 'error',
                fileName,
                error: 'File must be .json'
            };
        }

        // 2. Calculate SHA-256 hash
        const fileHash = await calculateFileHash(file);
        console.log('🔑 File hash:', fileHash.substring(0, 16) + '...');

        // 3. Check for duplicate
        const existing = await checkDuplicate(uid, fileHash);
        if (existing) {
            console.log('⚠️ Duplicate detected:', fileName);
            return {
                status: 'duplicate',
                fileName,
                fileHash,
                sessionId: existing.sessionId
            };
        }

        // 4. Read and parse JSON
        const rawText = await file.text();
        const rawObj = JSON.parse(rawText);
        console.log('📄 Parsed JSON, size:', rawText.length, 'bytes');

        // 5. Extract metadata
        const { meta, summary } = extractMetadata(rawObj);
        console.log('📊 Meta:', meta.track, meta.date_start);

        // 6. Generate session ID
        const sessionId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

        // 7. Split raw into chunks
        const chunks = splitIntoChunks(rawText, CHUNK_SIZE);
        const rawChunkCount = chunks.length;
        const rawSizeBytes = rawText.length;
        console.log(`📦 Split into ${rawChunkCount} chunks`);

        // 8. Save main session document (NO rawData - just metadata)
        const sessionPath = `users/${uid}/sessions/${sessionId}`;
        console.log('💾 SAVE PATH:', sessionPath);

        const sessionRef = doc(db, sessionPath);
        await setDoc(sessionRef, {
            fileHash,
            fileName,
            uploadedAt: serverTimestamp(),
            meta,
            summary,
            rawChunkCount,
            rawSizeBytes,
            rawEncoding: 'json-string'
        });

        // 9. Save to uploads collection (for duplicate detection)
        const uploadRef = doc(db, `users/${uid}/uploads/${fileHash}`);
        await setDoc(uploadRef, {
            fileName,
            uploadedAt: serverTimestamp(),
            sessionId
        });

        // 10. Save chunks in subcollection
        console.log('📦 Saving chunks...');
        for (let idx = 0; idx < chunks.length; idx++) {
            const chunkRef = doc(db, `users/${uid}/sessions/${sessionId}/rawChunks/${idx}`);
            await setDoc(chunkRef, {
                idx,
                chunk: chunks[idx]
            });
        }
        console.log('✅ All chunks saved');

        // 11. Return success with rawObj for immediate UI update
        return {
            status: 'ok',
            fileName,
            fileHash,
            sessionId,
            meta,
            summary,
            rawObj  // For immediate dashboard update (no re-fetch needed)
        };

    } catch (error) {
        console.error('❌ Upload error:', fileName, error);
        return {
            status: 'error',
            fileName,
            error: error.message
        };
    }
}

/**
 * Handle multiple file uploads
 * @param {FileList} files - Files to upload
 * @param {string} uid - User ID
 * @returns {Promise<Array>} Array of upload results
 */
export async function handleMultipleFileUploads(files, uid) {
    console.log('📤 Multiple upload started, files:', files.length, 'UID:', uid);
    const results = [];

    for (const file of files) {
        const result = await handleFileUpload(file, uid);
        results.push(result);
    }

    // Summary log
    const ok = results.filter(r => r.status === 'ok').length;
    const dup = results.filter(r => r.status === 'duplicate').length;
    const err = results.filter(r => r.status === 'error').length;
    console.log(`📊 Upload summary: ${ok} ok, ${dup} duplicates, ${err} errors`);

    return results;
}
