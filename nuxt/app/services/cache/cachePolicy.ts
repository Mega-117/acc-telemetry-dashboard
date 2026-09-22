// PIP-438/PIP-442: durata delle cache davanti a Firebase, in un solo posto.
//
// I dati dell'owner (proiezioni, lista sessioni, snapshot Panoramica) cambiano solo quando
// questo client carica una sessione o modifica qualcosa, e in quei casi la cache viene
// svuotata subito da `invalidateTelemetryCaches` (sync, profilo, refresh manuale).
// Dal PIP-442 non scadono piu' a tempo entro un avvio: la rete di sicurezza per chi scrive
// dallo stesso account su un altro PC e' il controllo di revisione (`ownerRevisionWatcher`),
// una sola lettura di `users/{uid}` ogni OWNER_REVISION_CHECK_MS a finestra visibile.
export const OWNER_DATA_CACHE_TTL_MS = Number.POSITIVE_INFINITY

// Ogni quanto rileggere `users/{uid}` per accorgersi di una revisione scritta altrove.
export const OWNER_REVISION_CHECK_MS = 15 * 60_000

// Il calendario gare dell'owner puo' essere scritto anche dal coach assegnato (altro
// account): ne' un evento locale ne' la revisione lo invalidano, quindi conserva il TTL.
export const RACE_CALENDAR_CACHE_TTL_MS = 15 * 60_000

// Dati di un altro owner visti da un coach: nessun evento locale ne' il controllo di
// revisione (che segue solo l'account corrente) li invalida, quindi restano a 15 minuti
// come dal PIP-438.
export const FOREIGN_OWNER_DATA_CACHE_TTL_MS = 15 * 60_000

// Dati scritti da altri utenti (coach, directory): nessun evento locale li invalida.
export const SHARED_DATA_CACHE_TTL_MS = 60_000

// L'account di cui le cache owner non scadono: lo imposta il ciclo di vita della shell
// (`useOwnerCacheLifecycle`) all'ingresso in dashboard e lo azzera a logout/cambio account.
let cacheOwnerUid: string | null = null

export function setCacheOwnerUid(uid: string | null) {
  cacheOwnerUid = uid
}

export function getCacheOwnerUid(): string | null {
  return cacheOwnerUid
}

/** Durata delle cache di proiezione per un dato uid: infinita per l'owner corrente, 15 min per altri. */
export function ownerDataCacheTtlFor(uid: string | null | undefined): number {
  return uid && uid === cacheOwnerUid ? OWNER_DATA_CACHE_TTL_MS : FOREIGN_OWNER_DATA_CACHE_TTL_MS
}
