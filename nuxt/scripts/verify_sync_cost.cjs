
const crypto = require('crypto');

// === MOCK DATA ===
const MOCK_UID = 'user_123';

// 1. Simulate Local Files (what Electron finds)
const LOCAL_FILES = [
    { name: 'session_2024_monza.json', content: '{"session":"monza","laps":[1,2,3]}', mtime: 1700000000 },
    { name: 'session_2025_spa.json', content: '{"session":"spa","laps":[4,5,6]}', mtime: 1710000000 }, // NEW FILE
];

// 2. Simulate Local Registry (what we remember syncing)
const LOCAL_REGISTRY = {
    'session_2024_monza.json': {
        uploadedBy: MOCK_UID,
        fileHash: 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855', // Placeholder hash
        sessionId: 'sess_monza_1',
        uploadedAt: '2024-01-01T12:00:00Z'
    }
    // 'session_2025_spa.json' is MISSING in registry -> needs sync
};

// === LOGIC (Copied from useElectronSync.ts) ===

// Calculate SHA-256 hash
async function calculateHash(input) {
    const hash = crypto.createHash('sha256').update(input).digest('hex');
    return hash;
}

// Check if file can be skipped
function canSkipViaRegistry(registry, fileName, fileHash, uid) {
    const entry = registry[fileName];
    if (!entry) return false;
    // Skip if same hash AND same user uploaded it
    // console.log(`Checking ${fileName}: Registry Hash ${entry.fileHash} vs Current ${fileHash}`);
    return entry.fileHash === fileHash && entry.uploadedBy === uid;
}

// === MAIN SIMULATION ===
async function runSimulation() {
    console.log("=== SYNC SIMULATION STARTED ===");
    console.log(`User ID: ${MOCK_UID}\n`);

    // Pre-calculate hash for the existing file to match registry
    const monzaHash = await calculateHash(LOCAL_FILES[0].content);
    LOCAL_REGISTRY['session_2024_monza.json'].fileHash = monzaHash;

    let opsRead = 0;
    let opsWrite = 0;

    for (const file of LOCAL_FILES) {
        console.log(`Processing file: ${file.name}`);

        const fileHash = await calculateHash(file.content);

        // Step 1: Check Registry
        const shouldSkip = canSkipViaRegistry(LOCAL_REGISTRY, file.name, fileHash, MOCK_UID);

        if (shouldSkip) {
            console.log(`  -> [SKIP] Found in local registry with matching hash.`);
            console.log(`  -> Firestore Reads: 0 | Writes: 0`);
        } else {
            console.log(`  -> [SYNC] New or modified file detected!`);
            console.log(`  -> Simulating Upload...`);
            opsRead += 1;  // Check existence
            opsWrite += 2; // Write session + Write trackBests
            console.log(`  -> Firestore Reads: +1 | Writes: +2`);

            // Update registry (simulation)
            LOCAL_REGISTRY[file.name] = {
                uploadedBy: MOCK_UID,
                fileHash: fileHash,
                sessionId: 'new_session_id',
                uploadedAt: new Date().toISOString()
            };
        }
        console.log("------------------------------------------------");
    }

    console.log("\n=== SUMMARY REALE ===");
    console.log(`Files Processed: ${LOCAL_FILES.length}`);
    console.log(`Total Firestore Reads:  ${opsRead}`);
    console.log(`Total Firestore Writes: ${opsWrite}`);
    console.log("=====================");
}

runSimulation();
