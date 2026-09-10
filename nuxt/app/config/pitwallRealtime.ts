import { connectDatabaseEmulator, getDatabase } from 'firebase/database'
import { app } from './firebase'
import { createPitwallRealtimeTransport } from '~/services/pitwall/pitwallRealtimeTransport'
import { PITWALL_SOCIAL_ROOT } from '~/services/pitwall/pitwallSocialRoom'

let transport: ReturnType<typeof createPitwallRealtimeTransport> | null = null
let socialTransport: ReturnType<typeof createPitwallRealtimeTransport> | null = null
export function getPitwallSocialRealtime() {
  if (!socialTransport) socialTransport = createPitwallRealtimeTransport(getPitwallRealtime().database, PITWALL_SOCIAL_ROOT)
  return socialTransport
}
/** The development probe must never create a connection just to display its counters. */
export function readPitwallRealtimeMetrics() { return import.meta.dev ? transport?.metrics.snapshot() ?? null : null }
/** Lazy: importing a UI component must not open another network connection. */
export function getPitwallRealtime() {
  if (transport) return transport
  const emulated = import.meta.dev && import.meta.env.VITE_ACC_FIREBASE_EMULATORS === '1'
  const configured = import.meta.env.VITE_ACC_PITWALL_DATABASE_URL as string | undefined
  const url = configured || (!emulated && app.options.projectId === 'accsuite117'
    ? 'https://accsuite117-default-rtdb.europe-west1.firebasedatabase.app' : undefined)
  if (!url && !emulated) throw new Error('Pitwall in aggiornamento: collegamento non ancora disponibile.')
  const database = getDatabase(app, url || 'https://demo-pitwall-audit-default-rtdb.firebaseio.com')
  if (emulated) connectDatabaseEmulator(database, '127.0.0.1', 9000)
  transport = createPitwallRealtimeTransport(database)
  return transport
}
