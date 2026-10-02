export const FIREBASE_EMULATOR_HOST = '127.0.0.1'
// Explicit DEV-only overrides let isolated QA own its ports without touching another runtime.
export function emulatorPort(value: unknown, fallback: number): number {
  const port = Number(value)
  return Number.isInteger(port) && port >= 1024 && port <= 65535 ? port : fallback
}
export const FIREBASE_AUTH_EMULATOR_PORT = import.meta.env.DEV ? emulatorPort(import.meta.env.VITE_ACC_AUTH_EMULATOR_PORT, 9099) : 9099
export const FIREBASE_FIRESTORE_EMULATOR_PORT = import.meta.env.DEV ? emulatorPort(import.meta.env.VITE_ACC_FIRESTORE_EMULATOR_PORT, 8080) : 8080
export const FIREBASE_DATABASE_EMULATOR_PORT = import.meta.env.DEV ? emulatorPort(import.meta.env.VITE_ACC_DATABASE_EMULATOR_PORT, 9000) : 9000

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
