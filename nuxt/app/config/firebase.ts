// ============================================
// Firebase Configuration
// ============================================

import { initializeApp, getApps, type FirebaseApp } from 'firebase/app'
import { getAuth, type Auth } from 'firebase/auth'
import { getFirestore, type Firestore } from 'firebase/firestore'

// Firebase config - from dev/firebase-init.js
// Note: These are client-side credentials (not secrets)
const firebaseConfig = {
    apiKey: 'AIzaSyCx092q7up_BXFgK2e13A-IQ3uDjwf6J5A',
    authDomain: 'accsuite117.firebaseapp.com',
    projectId: 'accsuite117',
    storageBucket: 'accsuite117.firebasestorage.app',
    messagingSenderId: '352958845592',
    appId: '1:352958845592:web:bb6a7fbe04f6181707f6ed'
}

// Initialize Firebase (singleton pattern)
let app: FirebaseApp
let auth: Auth
let db: Firestore

if (!getApps().length) {
    app = initializeApp(firebaseConfig)
} else {
    app = getApps()[0]
}

auth = getAuth(app)
db = getFirestore(app)

export { app, auth, db }
