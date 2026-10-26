// PIP-623: il nickname pubblico di un pilota (`publicProfiles/{uid}`, leggibile da ogni utente
// loggato), per etichettare un giro condiviso. `users/{uid}` lo leggerebbero solo il proprietario,
// il suo coach o un admin: per chi riceve un link resterebbe vuoto.
import { doc } from 'firebase/firestore'
import { db } from '~/config/firebase'
import { trackedGetDoc } from '~/composables/useFirebaseTracker'

const CALLER = 'PublicProfileRepository'
const cache = new Map<string, string | null>()

export async function loadPublicNickname(uid: string | null | undefined): Promise<string | null> {
  if (!uid || !/^[A-Za-z0-9_-]{1,128}$/.test(uid)) return null
  if (cache.has(uid)) return cache.get(uid) ?? null
  try {
    const snap = await trackedGetDoc(doc(db, 'publicProfiles', uid), CALLER)
    const nickname = snap.exists() && typeof snap.data()?.nickname === 'string' ? String(snap.data()!.nickname).slice(0, 40) : null
    cache.set(uid, nickname)
    return nickname
  } catch {
    return null
  }
}
