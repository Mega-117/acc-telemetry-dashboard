import { connectDatabaseEmulator, getDatabase, goOffline, goOnline } from 'firebase/database'
import { app } from './firebase'
import { FIREBASE_DATABASE_EMULATOR_PORT, pitwallDatabaseUrl } from './firebaseRuntimeTarget'
import {
  createPitwallRealtimeTransport, pitwallRealtimeDatabaseIdle, setPitwallRealtimeWake, waitPitwallRealtimeConnected,
} from '~/services/pitwall/pitwallRealtimeTransport'
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
  setPitwallRealtimeWake(database, () => wakePitwallRealtime(database))
  transport = createPitwallRealtimeTransport(database)
  return transport
}

// PIP-660: the free plan admits 100 simultaneous Realtime Database connections, and an open page used to hold
// one forever (only for the request bell). Now the connection closes when nothing uses it for a while and
// reopens at the next use. Presence, rooms and listeners keep it open (pitwallRealtimeDatabaseIdle).
const IDLE_CLOSE_MS = 20_000
const WAKE_TIMEOUT_MS = 10_000
let closedWhileIdle = false
let idleTimer: ReturnType<typeof setTimeout> | null = null

/** Reopens a connection closed while idle and waits for it; a no-op when it was never closed. */
export async function wakePitwallRealtime(database = transport?.database): Promise<void> {
  if (idleTimer) { clearTimeout(idleTimer); idleTimer = null }
  if (!database) return
  if (closedWhileIdle) { closedWhileIdle = false; goOnline(database) }
  // Also right after start-up the first operation waits for the connection instead of failing at once.
  await waitPitwallRealtimeConnected(database, WAKE_TIMEOUT_MS)
}

/** Closes the connection after a quiet moment, only if still nothing uses it then. */
export function closePitwallRealtimeWhenIdle(delayMs = IDLE_CLOSE_MS) {
  const database = transport?.database
  if (!database || closedWhileIdle) return
  if (idleTimer) clearTimeout(idleTimer)
  idleTimer = setTimeout(() => {
    idleTimer = null
    if (closedWhileIdle || !pitwallRealtimeDatabaseIdle(database)) return
    closedWhileIdle = true
    goOffline(database)
  }, delayMs)
}
