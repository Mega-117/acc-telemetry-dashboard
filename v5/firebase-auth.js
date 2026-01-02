// Firebase Authentication Module - Centralized Configuration
// This module initializes Firebase and manages authentication state

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";

// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyCx092q7up_BXFgK2e13A-IQ3uDjwf6J5A",
    authDomain: "accsuite117.firebaseapp.com",
    projectId: "accsuite117",
    storageBucket: "accsuite117.firebasestorage.app",
    messagingSenderId: "352958845592",
    appId: "1:352958845592:web:bb6a7fbe04f6181707f6ed"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);

// Export auth instance and functions for use in dashboard.js
export { auth, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail };

// UI State Management
function updateAuthUI(user) {
    const loginBtn = document.getElementById('loginBtn');
    const userInfo = document.getElementById('userInfo');
    const userName = document.getElementById('userName');

    if (user) {
        // User is logged in
        console.log('User authenticated:', user.email);
        loginBtn.style.display = 'none';
        userInfo.style.display = 'flex';
        // Extract username from email (before @)
        const displayName = user.email.split('@')[0];
        userName.textContent = displayName;
    } else {
        // User is logged out
        console.log('User not authenticated');
        loginBtn.style.display = '';
        userInfo.style.display = 'none';
    }
}

// ========== AUTH STATE GATE (SINGLE SOURCE OF TRUTH) ==========
onAuthStateChanged(auth, async (user) => {
    console.log('🔐 Auth state changed:', user ? user.email : 'logged out');

    if (user) {
        // User logged in → bootstrap app
        if (typeof dashboard !== 'undefined') {
            await dashboard.bootstrapApp(user);
        } else {
            console.warn('Dashboard not yet initialized');
        }
    } else {
        // User logged out → show auth panel and CLEAR previous user's data
        if (typeof dashboard !== 'undefined') {
            dashboard.sessions = []; // CRITICAL: Clear previous user's sessions
            dashboard.currentUser = null;
            dashboard.setUIState('auth');
            console.log('🧹 Cleared user data and sessions');
        }
    }

    // Update UI elements (user name, logout button)
    updateAuthUI(user);
});

// Logout function
export function handleLogout() {
    signOut(auth)
        .then(() => {
            console.log('User signed out successfully');
            // UI will be updated automatically by onAuthStateChanged
        })
        .catch((error) => {
            console.error('Logout error:', error);
            alert('Errore durante il logout: ' + error.message);
        });
}

// Attach logout handler to button when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    const logoutBtn = document.getElementById('logoutBtn');
    if (logoutBtn) {
        logoutBtn.addEventListener('click', handleLogout);
    }
});
