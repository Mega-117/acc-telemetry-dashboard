// ========================================
// FIREBASE INIT - SINGLE INITIALIZATION POINT
// ========================================
// All other files MUST import from here. No other initializeApp allowed.

import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import { getAuth, onAuthStateChanged, signOut, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail, sendEmailVerification, updateProfile } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

// Firebase configuration - SINGLE SOURCE
const firebaseConfig = {
    apiKey: "AIzaSyCx092q7up_BXFgK2e13A-IQ3uDjwf6J5A",
    authDomain: "accsuite117.firebaseapp.com",
    projectId: "accsuite117",
    storageBucket: "accsuite117.firebasestorage.app",
    messagingSenderId: "352958845592",
    appId: "1:352958845592:web:bb6a7fbe04f6181707f6ed"
};

// Initialize Firebase ONCE
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);


// Export everything other files need
export {
    app,
    auth,
    db,
    onAuthStateChanged,
    signOut,
    signInWithEmailAndPassword,
    createUserWithEmailAndPassword,
    sendPasswordResetEmail,
    sendEmailVerification,
    updateProfile
};
