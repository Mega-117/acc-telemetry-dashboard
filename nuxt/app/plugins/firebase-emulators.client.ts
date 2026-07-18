import { connectAuthEmulator } from 'firebase/auth'
import { connectFirestoreEmulator } from 'firebase/firestore'
import { auth, db } from '~/config/firebase'
import {
  FIREBASE_AUTH_EMULATOR_PORT,
  FIREBASE_EMULATOR_HOST,
  FIREBASE_FIRESTORE_EMULATOR_PORT,
  shouldConnectFirebaseEmulators
} from '~/config/firebaseRuntimeTarget'

export default defineNuxtPlugin(() => {
  const enabled = shouldConnectFirebaseEmulators({
    isDevelopment: import.meta.dev,
    isClient: import.meta.client,
    emulatorFlag: import.meta.env.VITE_ACC_FIREBASE_EMULATORS
  })
  if (!enabled) return

  const emulatorState = globalThis as typeof globalThis & {
    __accFirebaseEmulatorsConnected?: boolean
  }
  if (emulatorState.__accFirebaseEmulatorsConnected) return

  connectAuthEmulator(
    auth,
    `http://${FIREBASE_EMULATOR_HOST}:${FIREBASE_AUTH_EMULATOR_PORT}`,
    { disableWarnings: true }
  )
  connectFirestoreEmulator(
    db,
    FIREBASE_EMULATOR_HOST,
    FIREBASE_FIRESTORE_EMULATOR_PORT
  )
  emulatorState.__accFirebaseEmulatorsConnected = true
  console.info('[FIREBASE] Local Auth and Firestore emulators enabled.')
})
