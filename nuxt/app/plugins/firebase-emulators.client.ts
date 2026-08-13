import { connectFirestoreEmulator } from 'firebase/firestore'
import { db } from '~/config/firebase'
import { shouldObserveFirebaseAuth } from '~/services/auth/localIdentityBridge'
import {
  FIREBASE_AUTH_EMULATOR_PORT,
  FIREBASE_EMULATOR_HOST,
  FIREBASE_FIRESTORE_EMULATOR_PORT,
  shouldConnectFirebaseEmulators
} from '~/config/firebaseRuntimeTarget'

export default defineNuxtPlugin(async () => {
  const enabled = shouldConnectFirebaseEmulators({
    isDevelopment: import.meta.dev,
    isClient: import.meta.client,
    emulatorFlag: import.meta.env.VITE_ACC_FIREBASE_EMULATORS
  })
  if (!enabled) return

  const emulatorState = globalThis as typeof globalThis & {
    __accFirebaseAuthEmulatorConnected?: boolean
    __accFirebaseFirestoreEmulatorConnected?: boolean
  }

  if (!emulatorState.__accFirebaseFirestoreEmulatorConnected) {
    connectFirestoreEmulator(
      db,
      FIREBASE_EMULATOR_HOST,
      FIREBASE_FIRESTORE_EMULATOR_PORT
    )
    emulatorState.__accFirebaseFirestoreEmulatorConnected = true
  }

  if (shouldObserveFirebaseAuth() && !emulatorState.__accFirebaseAuthEmulatorConnected) {
    const [{ connectAuthEmulator }, { auth }] = await Promise.all([
      import('firebase/auth'),
      import('~/config/firebaseAuth')
    ])
    connectAuthEmulator(
      auth,
      `http://${FIREBASE_EMULATOR_HOST}:${FIREBASE_AUTH_EMULATOR_PORT}`,
      { disableWarnings: true }
    )
    emulatorState.__accFirebaseAuthEmulatorConnected = true
  }
  console.info(
    `[FIREBASE] Local emulator adapters enabled auth=${emulatorState.__accFirebaseAuthEmulatorConnected === true}`
  )
})
