// Upload Sessions Module - Firestore only, no Storage
// Handles JSON file uploads with SHA-256 hashing and duplicate detection

import { getFirestore, doc, setDoc, getDoc, serverTimestamp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

const db = getFirestore();

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
 * Check if file hash already exists in uploads collection
 * @param {string} uid - User ID
 * @param {string} fileHash - File hash to check
 * @returns {Promise<boolean>} True if duplicate exists
 */
async function isDuplicate(uid, fileHash) {
    const uploadRef = doc(db, `users/${uid}/uploads/${fileHash}`);
    const uploadSnap = await getDoc(uploadRef);
    return uploadSnap.exists();
}

/**
 * Parse JSON file and extract session data
 * @param {File} file - JSON file to parse
 * @returns {Promise<object>} Parsed session data
 */
async function parseSessionFile(file) {
    const text = await file.text();
    const data = JSON.parse(text);

    // Extract fields with safe fallbacks
    return {
        track: data.track || data.trackName || 'Unknown',
        date: data.date || data.sessionDate || new Date().toISOString(),
        summary: {
            laps: data.laps?.length || data.totalLaps || 0,
            bestLap: data.bestLap || data.laps?.[0]?.time || null
        }
    };
}

/**
 * Save session to Firestore
 * @param {string} uid - User ID
 * @param {string} fileHash - File hash
 * @param {object} sessionData - Parsed session data
 * @returns {Promise<string>} Session ID
 */
async function saveSession(uid, fileHash, sessionData) {
    // Generate unique session ID (timestamp + random)
    const sessionId = `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Save to sessions collection
    const sessionRef = doc(db, `users/${uid}/sessions/${sessionId}`);
    await setDoc(sessionRef, {
        fileHash,
        track: sessionData.track,
        date: sessionData.date,
        uploadedAt: serverTimestamp(),
        summary: sessionData.summary
    });

    // Save to uploads collection (for duplicate detection)
    const uploadRef = doc(db, `users/${uid}/uploads/${fileHash}`);
    await setDoc(uploadRef, {
        uploadedAt: serverTimestamp(),
        sessionId
    });

    return sessionId;
}

/**
 * Handle single file upload
 * @param {File} file - JSON file to upload
 * @param {string} uid - User ID
 * @returns {Promise<object>} Upload result { status, fileName, sessionId?, error? }
 */
export async function handleFileUpload(file, uid) {
    const fileName = file.name;

    try {
        // Validate file type
        if (!file.name.endsWith('.json')) {
            return {
                status: 'error',
                fileName,
                error: 'File must be .json'
            };
        }

        // Calculate hash
        const fileHash = await calculateFileHash(file);

        // Check for duplicate
        const duplicate = await isDuplicate(uid, fileHash);
        if (duplicate) {
            return {
                status: 'duplicate',
                fileName
            };
        }

        // Parse JSON
        const sessionData = await parseSessionFile(file);

        // Save to Firestore
        const sessionId = await saveSession(uid, fileHash, sessionData);

        return {
            status: 'ok',
            fileName,
            sessionId
        };

    } catch (error) {
        console.error('Upload error:', fileName, error);
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
    const results = [];

    for (const file of files) {
        const result = await handleFileUpload(file, uid);
        results.push(result);
    }

    return results;
}
