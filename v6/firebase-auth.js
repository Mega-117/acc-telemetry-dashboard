// ========================================
// FIREBASE AUTH - Single onAuthStateChanged gate
// ========================================
// Imports from firebase-init.js ONLY - no other initializeApp allowed

import { auth, onAuthStateChanged, signOut } from './firebase-init.js';

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
// This is THE ONLY place that controls UI state based on auth
onAuthStateChanged(auth, async (user) => {
    console.log('🔐 AUTH STATE CHANGED:', user ? user.email : 'LOGGED OUT');

    if (user) {
        // ===== USER LOGGED IN =====
        console.log('🔐 User UID:', user.uid);

        // Wait for dashboard to be ready
        if (typeof dashboard !== 'undefined') {
            await dashboard.bootstrapApp(user);
        } else {
            console.warn('⚠️ Dashboard not yet initialized');
        }
    } else {
        // ===== USER LOGGED OUT =====
        console.log('🔐 [AUTH] User logged out, resetting state...');

        if (typeof dashboard !== 'undefined') {
            // CRITICAL: Reset ALL user-specific state
            dashboard.currentUser = null;
            dashboard.sessions = [];
            dashboard.filteredSessions = [];
            dashboard.currentSession = null;

            // Reset filters to defaults (prevent leakage between users)
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
            } catch (e) {
                console.error('❌ Error clearing dashboard:', e);
            }

            // Show auth overlay (hides dashboard)
            console.log('🔐 [AUTH] About to call setUIState("auth")...');
            console.log('🔐 [AUTH] dashboard.setUIState exists?', typeof dashboard.setUIState);

            try {
                dashboard.setUIState('auth');
                console.log('🔐 [AUTH] setUIState("auth") called successfully');
            } catch (e) {
                console.error('❌ [AUTH] Error calling setUIState:', e);
            }

            console.log('🧹 [AUTH] State cleared, auth overlay should be visible');
        } else {
            console.warn('⚠️ Dashboard not yet initialized during logout');
        }
    }

    // Update header UI (username, logout button visibility)
    updateAuthUI(user);
});

// ========================================
// LOGOUT FUNCTION
// ========================================
export function handleLogout() {
    console.log('🚪 Logout initiated...');
    signOut(auth)
        .then(() => {
            console.log('✅ User signed out successfully');
            // onAuthStateChanged will handle UI cleanup
        })
        .catch((error) => {
            console.error('❌ Logout error:', error);
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
        console.log('🔘 Logout button handler attached');
    }
});
