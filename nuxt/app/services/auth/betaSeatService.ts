// Beta seats (decision 28/10): the first verified accounts take a seat on their own, up to a limit
// the admin changes from one field. No seat = the local program keeps working, the cloud waits.
// The counter and the limit live in `config/betaSeats`; a seat is `betaSeats/{uid}`. Firestore Rules
// let a client take a seat only together with `taken + 1 <= limit`, so the cap holds on the server.
import { doc, serverTimestamp } from 'firebase/firestore'
import { db } from '~/config/firebase'
import { trackedGetDoc, trackedRunTransaction, trackedUpdateDoc } from '~/composables/useFirebaseTracker'

export type BetaSeatStatus = 'granted' | 'full' | 'unknown'

export const BETA_SEATS_CONFIG_PATH = 'config/betaSeats'

const seatRef = (uid: string) => doc(db, `betaSeats/${uid}`)
const configRef = () => doc(db, BETA_SEATS_CONFIG_PATH)

/**
 * Seat of a verified account: an existing seat, a newly taken one, or `full`.
 * `unknown` when Firestore cannot answer (offline, rules not deployed yet): the caller keeps the
 * cloud as it was, because the server still enforces the cap on writes.
 */
export async function ensureBetaSeat(uid: string): Promise<BetaSeatStatus> {
  try {
    const own = await trackedGetDoc(seatRef(uid), 'betaSeat.own')
    if (own.exists()) return 'granted'
    return await trackedRunTransaction(db, 'betaSeat.claim', configRef(), async (transaction) => {
      const config = await transaction.get(configRef())
      const taken = Number(config.data()?.taken ?? 0)
      const limit = Number(config.data()?.limit ?? 0)
      if (!config.exists() || taken >= limit) return 'full' as const
      transaction.update(configRef(), { taken: taken + 1 })
      transaction.set(seatRef(uid), { at: serverTimestamp() })
      return 'granted' as const
    })
  } catch (error) {
    console.warn('[BETA_SEAT] seat check deferred:', (error as { code?: string })?.code || error)
    return 'unknown'
  }
}

export async function readBetaSeats(): Promise<{ taken: number; limit: number } | null> {
  const config = await trackedGetDoc(configRef(), 'betaSeat.adminRead')
  if (!config.exists()) return null
  return { taken: Number(config.data()?.taken ?? 0), limit: Number(config.data()?.limit ?? 0) }
}

/** Admin only (Rules): changes the cap, never the counter. */
export async function setBetaSeatLimit(limit: number): Promise<void> {
  if (!Number.isInteger(limit) || limit < 0 || limit > 10000) throw new Error('invalid-beta-seat-limit')
  await trackedUpdateDoc(configRef(), { limit }, 'betaSeat.adminLimit')
}
