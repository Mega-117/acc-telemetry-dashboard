import { connectDatabaseEmulator, getDatabase } from 'firebase/database'
import { app } from './firebase'
import { FIREBASE_DATABASE_EMULATOR_PORT, pitwallDatabaseUrl } from './firebaseRuntimeTarget'
import { createPitwallRealtimeTransport } from '~/services/pitwall/pitwallRealtimeTransport'
import { PITWALL_SOCIAL_ROOT } from '~/services/pitwall/pitwallSocialRoom'
import { combinePitwallIoMetrics } from '~/services/pitwall/pitwallIoMetrics'

let transport: ReturnType<typeof createPitwallRealtimeTransport> | null = null
let socialTransport: ReturnType<typeof createPitwallRealtimeTransport> | null = null
export function getPitwallSocialRealtime() {
  if (!socialTransport) socialTransport = createPitwallRealtimeTransport(getPitwallRealtime().database, PITWALL_SOCIAL_ROOT)
  return socialTransport
}
/** The development probe must never create a connection just to display its counters. */
export function readPitwallRealtimeMetrics() {
  return import.meta.dev ? combinePitwallIoMetrics([
    transport?.metrics.snapshot(), socialTransport?.metrics.snapshot(),
  ]) : null
}
/** Lazy: importing a UI component must not open another network connection. */
export function getPitwallRealtime() {
  if (transport) return transport
  const emulated = import.meta.dev && import.meta.env.VITE_ACC_FIREBASE_EMULATORS === '1'
  const configured = import.meta.env.VITE_ACC_PITWALL_DATABASE_URL as string | undefined
  const database = getDatabase(app, pitwallDatabaseUrl(app.options.projectId, configured, emulated))
  if (emulated) connectDatabaseEmulator(database, '127.0.0.1', FIREBASE_DATABASE_EMULATOR_PORT)
  transport = createPitwallRealtimeTransport(database)
  return transport
}
