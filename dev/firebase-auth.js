// ========================================
// FIREBASE AUTH - Conditional auth gate
// ========================================
// Imports from firebase-init.js ONLY - no other initializeApp allowed

import { auth, onAuthStateChanged, signOut } from './firebase-init.js';
import { APP_CONFIG } from './config.js';

// Re-export for convenience
export { auth };

// ========================================
// UI STATE MANAGEMENT
// ========================================
function updateAuthUI(user) {
    const loginBtn = document.getElementById('loginBtn');
    const userInfo = document.getElementById('userInfo');
    const userName = document.getElementById('userName');

    if (user) {
        // User is logged in
        if (loginBtn) loginBtn.style.display = 'none';
        if (userInfo) userInfo.style.display = 'inline-block';
        if (userName) {
            const displayName = user.email.split('@')[0];
            userName.textContent = displayName;
        }
    } else {
        // User is logged out
        if (loginBtn) loginBtn.style.display = '';
        if (userInfo) userInfo.style.display = 'none';
    }
}

// ========================================
// AUTH STATE GATE - SINGLE SOURCE OF TRUTH
// ========================================
if (APP_CONFIG.AUTH_ENABLED) {
    // ===== LOGIN MODE: Use Firebase Auth =====
    onAuthStateChanged(auth, async (user) => {

        if (user) {
            // ===== USER LOGGED IN =====
            if (typeof dashboard !== 'undefined') {
                await dashboard.bootstrapApp(user);
            }

            // Trigger Electron sync notification if files pending
            if (typeof window.electronSync !== 'undefined') {
                setTimeout(() => {
                    try {
                        const pending = window.electronSync.getPending?.() || [];
                        if (pending.length > 0) {
                            console.log('[AUTH] Triggering sync notification for', pending.length, 'files');
                            window.electronSync.showNotification?.();
                        }
                    } catch (e) { console.warn('[AUTH] Sync notification error:', e); }
                }, 1500);
            }
        } else {
            // ===== USER LOGGED OUT =====
            if (typeof dashboard !== 'undefined') {
                // CRITICAL: Reset ALL user-specific state
                dashboard.currentUser = null;
                dashboard.sessions = [];
                dashboard.filteredSessions = [];
                dashboard.currentSession = null;

                // Reset filters to defaults
                dashboard.filters = { track: '', car: '', type: '', period: '', search: '' };
                dashboard.stintFilter = 'all';
                dashboard.sectorFilter = 'all';
                dashboard.currentPage = 1;

                // Clear dashboard visuals
                try {
                    if (typeof dashboard.clearDashboardUI === 'function') {
                        dashboard.clearDashboardUI();
                    }
                    if (typeof dashboard.clearSessionsList === 'function') {
                        dashboard.clearSessionsList();
                    }
                } catch (e) { }

                // Show auth overlay
                try {
                    dashboard.setUIState('auth');
                } catch (e) { }
            }
        }

        // Update header UI
        updateAuthUI(user);
    });
} else {
    // ===== LOCAL MODE: No Firebase Auth =====
    document.addEventListener('DOMContentLoaded', () => {
        // Wait for dashboard to be ready
        const checkDashboard = setInterval(() => {
            if (typeof dashboard !== 'undefined') {
                clearInterval(checkDashboard);

                // Show upload overlay
                dashboard.setUIState('auth');

                // Initialize local file handlers
                initLocalFileHandlers();
            }
        }, 50);
    });
}

// ========================================
// LOCAL FILE HANDLERS (for local mode)
// ========================================
function initLocalFileHandlers() {
    const fileInput = document.getElementById('localFileInput');
    const folderInput = document.getElementById('localFolderInput');
    const uploadStatus = document.getElementById('uploadStatus');

    const handleFiles = async (files) => {
        if (!files || files.length === 0) return;

        const jsonFiles = Array.from(files).filter(f => f.name.endsWith('.json'));
        if (jsonFiles.length === 0) {
            if (uploadStatus) {
                uploadStatus.textContent = 'Nessun file JSON trovato';
                uploadStatus.className = 'upload-status error';
            }
            return;
        }

        if (uploadStatus) {
            uploadStatus.textContent = `Caricamento ${jsonFiles.length} file...`;
            uploadStatus.className = 'upload-status';
        }

        // Load files locally (no Firebase)
        const sessions = [];
        for (const file of jsonFiles) {
            try {
                const text = await file.text();
                const data = JSON.parse(text);
                if (data && data.session_info) {
                    sessions.push(data);
                }
            } catch (e) {
                // Skip invalid files
            }
        }

        if (sessions.length === 0) {
            if (uploadStatus) {
                uploadStatus.textContent = 'Nessuna sessione valida trovata';
                uploadStatus.className = 'upload-status error';
            }
            return;
        }

        // Load into dashboard
        dashboard.sessions = sessions;
        dashboard.currentSession = sessions[0] ?? null;
        dashboard.updateDashboard();
        dashboard.setUIState('app');

        if (uploadStatus) {
            uploadStatus.textContent = `${sessions.length} sessioni caricate!`;
            uploadStatus.className = 'upload-status success';
        }
    };

    if (fileInput) {
        fileInput.addEventListener('change', (e) => handleFiles(e.target.files));
    }
    if (folderInput) {
        folderInput.addEventListener('change', (e) => handleFiles(e.target.files));
    }
}

// ========================================
// LOGOUT FUNCTION
// ========================================
export function handleLogout() {
    if (!APP_CONFIG.AUTH_ENABLED) {
        // In local mode, just reset and show upload
        if (typeof dashboard !== 'undefined') {
            dashboard.sessions = [];
            dashboard.currentSession = null;
            dashboard.clearDashboardUI();
            dashboard.setUIState('auth');
        }
        return;
    }

    signOut(auth)
        .then(() => {
            // onAuthStateChanged will handle UI cleanup
        })
        .catch((error) => {
            alert('Errore durante il logout: ' + error.message);
        });
}

// ========================================
// ATTACH LOGOUT HANDLER
// ========================================
document.addEventListener('DOMContentLoaded', () => {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
});
