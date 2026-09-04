// ============================================
// Amicizia Pit Wall: due permessi, uno per verso, letti come una relazione.
//
// Non esiste una collezione "amici": l'amicizia fra me e X e' la coppia di
// permessi `pitwallGrants` gia' esistenti - `me__X` (io autorizzo X) e `X__me`
// (X autorizza me) - entrambi concessi e non scaduti. Cosi' le Rules, il
// contratto desktop e il test statico a tre lati restano quelli di sempre, e
// un permesso a un verso solo (dati legacy) appare da solo come una richiesta
// inviata o ricevuta, senza migrazione.
//
// Logica pura: nessun accesso a Firestore. Chi scrive sta nei servizi.
// ============================================

import { isPitwallGrantUsable, type PitwallGrant, type PitwallGrantStatus } from './pitwallLink'
import type { PitwallIncomingRequest, PitwallOutgoingLink } from './pitwallEngineerService'

/** L'unico stato che l'utente legge, piu' i due passaggi per arrivarci. */
export type PitwallFriendState = 'friends' | 'sent' | 'received'

export interface PitwallFriendView {
  personId: string
  nickname: string | null
  state: PitwallFriendState
  /** `me__X` concesso e non scaduto: io autorizzo X. */
  iAllow: boolean
  /** `X__me` concesso e non scaduto: X autorizza me. */
  theyAllow: boolean
  /** Stato grezzo di `me__X`, o `null` se il documento non esiste. */
  mineStatus: PitwallGrantStatus | null
  /** Stato grezzo di `X__me`, o `null` se il documento non esiste. */
  theirsStatus: PitwallGrantStatus | null
}

/** Cosa va scritto per sciogliere la relazione: solo i documenti che esistono. */
export interface PitwallFriendActions {
  /** `me__X` esiste e non e' gia' revocato: lo revoco come pilota. */
  revokeMine: boolean
  /** `X__me` esiste e non e' gia' revocato: lo ritiro come ingegnere. */
  withdrawTheirs: boolean
}

function isGrantedNow(status: PitwallGrantStatus, expiresAtMs: number | null, nowMs: number): boolean {
  return status === 'granted' && (expiresAtMs == null || expiresAtMs > nowMs)
}

/**
 * Da `me__X` e `X__me` allo stato che l'utente legge.
 *
 * - amici: entrambi i versi concessi;
 * - ricevuta: non ho ancora concesso, ma X mi ha concesso oppure me l'ha
 *   chiesto - tocca a me decidere;
 * - inviata: ho concesso io (o ho chiesto) e X non ha ancora risposto.
 * Chi non rientra in nessuno dei tre - revocati, scaduti - non compare.
 */
export function derivePitwallFriends(
  incoming: readonly PitwallIncomingRequest[],
  outgoing: readonly PitwallOutgoingLink[],
  nowMs: number = Date.now()
): PitwallFriendView[] {
  const mine = new Map(incoming.map(request => [request.engineerUid, request]))
  const theirs = new Map(outgoing.map(link => [link.driverUid, link]))
  const ids = [...new Set([...mine.keys(), ...theirs.keys()])]

  const views: PitwallFriendView[] = []
  for (const personId of ids) {
    const inbound = mine.get(personId) ?? null
    const outbound = theirs.get(personId) ?? null
    const iAllow = inbound != null && isGrantedNow(inbound.status, inbound.expiresAtMs, nowMs)
    const iAllowPending = inbound?.status === 'pending'
    const theyAllow = outbound?.usable === true
    const theyAllowPending = outbound?.status === 'pending'

    let state: PitwallFriendState | null = null
    if (iAllow && theyAllow) state = 'friends'
    else if (!iAllow && (theyAllow || iAllowPending)) state = 'received'
    else if (iAllow || theyAllowPending) state = 'sent'
    if (!state) continue

    views.push({
      personId,
      nickname: outbound?.nickname ?? inbound?.nickname ?? null,
      state,
      iAllow,
      theyAllow,
      mineStatus: inbound?.status ?? null,
      theirsStatus: outbound?.status ?? null,
    })
  }
  return views
}

/**
 * Gli amici, dai documenti grezzi: l'intersezione dei permessi usabili nei due
 * versi. E' la sorgente degli invitati di una stanza: un permesso a un verso
 * solo e' una richiesta, non un posto al muretto.
 */
export function friendUidsFromGrants(
  asDriver: readonly PitwallGrant[],
  asEngineer: readonly PitwallGrant[],
  me: string,
  nowMs: number = Date.now()
): string[] {
  const iAllow = new Set(
    asDriver
      .filter(grant => isPitwallGrantUsable(grant, me, grant.engineerUid, nowMs))
      .map(grant => grant.engineerUid)
  )
  return [...new Set(
    asEngineer
      .filter(grant => isPitwallGrantUsable(grant, grant.driverUid, me, nowMs))
      .map(grant => grant.driverUid)
      .filter(uid => uid !== me && iAllow.has(uid))
  )]
}

/** Mai un aggiornamento su un documento che non c'e': le Rules lo rifiutano. */
export function pitwallFriendActions(view: PitwallFriendView | null | undefined): PitwallFriendActions {
  return {
    revokeMine: view?.mineStatus != null && view.mineStatus !== 'revoked',
    withdrawTheirs: view?.theirsStatus != null && view.theirsStatus !== 'revoked',
  }
}

/** Ordine di lettura: prima cio' che aspetta una mia decisione, poi le mie richieste, poi gli amici. */
const STATE_RANK: Record<PitwallFriendState, number> = { received: 0, sent: 1, friends: 2 }

export function sortPitwallFriends<T extends { state: PitwallFriendState, personId: string, nickname?: string | null }>(
  views: readonly T[],
  isRacing: (personId: string) => boolean = () => false
): T[] {
  return [...views].sort((a, b) => {
    const rank = STATE_RANK[a.state] - STATE_RANK[b.state]
    if (rank !== 0) return rank
    const racing = Number(isRacing(b.personId)) - Number(isRacing(a.personId))
    if (racing !== 0) return racing
    return (a.nickname ?? a.personId).localeCompare(b.nickname ?? b.personId, 'it', { sensitivity: 'base' })
  })
}
