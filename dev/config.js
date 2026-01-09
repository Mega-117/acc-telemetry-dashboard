// ========================================
// APP CONFIGURATION
// ========================================
// Central configuration for the ACC Telemetry Dashboard
// 
// Console Override (for testing):
//   1. Open DevTools (F12)
//   2. Type: window.APP_CONFIG.AUTH_ENABLED = false
//   3. Reload page (F5)

export const APP_CONFIG = {
    // ===== AUTHENTICATION =====
    // true  = Firebase login/register required, data from Firestore
    // false = Local mode, upload JSON files, no persistence
    AUTH_ENABLED: true,

    // ===== EMAIL VERIFICATION =====
    // true  = Users MUST verify email before accessing the app
    // false = Users can access without verifying email (just warning)
    REQUIRE_EMAIL_VERIFICATION: false,

    // ===== DEBUG =====
    DEBUG_MODE: false
};

// Expose to window for console override
if (typeof window !== 'undefined') {
    window.APP_CONFIG = APP_CONFIG;
}
