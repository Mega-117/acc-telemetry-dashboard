export const FIREBASE_EMULATOR_HOST = '127.0.0.1'
export const FIREBASE_AUTH_EMULATOR_PORT = 9099
export const FIREBASE_FIRESTORE_EMULATOR_PORT = 8080

export interface FirebaseRuntimeTargetInput {
  isDevelopment: boolean
  isClient: boolean
  emulatorFlag: string | null | undefined
}

export function shouldConnectFirebaseEmulators(input: FirebaseRuntimeTargetInput): boolean {
  return input.isDevelopment
    && input.isClient
    && input.emulatorFlag === '1'
}
