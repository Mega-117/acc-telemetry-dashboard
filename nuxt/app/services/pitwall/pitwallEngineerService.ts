// ============================================
// Lato ingegnere del collegamento Pit Wall.
//
// Gira nel browser o sul tablet: cerca il pilota, chiede il collegamento,
// invia la strategia e segue l'esito. Non applica nulla e non decide nulla:
// l'autorita' e' il PC del pilota, che e' l'unico che tocca ACC.
// ============================================

import { collection, doc, limit, orderBy, query, startAt, endAt, where } from 'firebase/firestore'
import type { Firestore } from 'firebase/firestore'
// Ogni lettura e scrittura passa dal tracker: la promessa "costo zero" regge
// solo se il consumo Firebase resta misurabile, non stimato a occhio.
import {
  trackedGetDoc,
  trackedGetDocs,
  trackedOnSnapshot,
  trackedSetDoc,
  trackedUpdateDoc,
} from '~/composables/useFirebaseTracker'
import {
  buildPitwallGrantRequest,
  buildPitwallOrderDocument,
  buildPitwallPreAuthorisation,
  isPitwallSessionFresh,
  matchesPitwallSearch,
  pitwallGrantId,
  pitwallSearchVariants,
  type PitwallGrant,
  type PitwallOrderDocument,
  type PitwallSession,
} from './pitwallLink'

export interface PitwallDirectoryEntry {
  uid: string
  nickname: string
}

/** Una richiesta ricevuta dal pilota, in attesa della sua decisione. */
export interface PitwallIncomingRequest {
  engineerUid: string
  nickname: string | null
  status: PitwallGrant['status']
  createdAt: string
}

export interface PitwallLinkedPilot {
  driverUid: string
  grant: PitwallGrant
  session: PitwallSession | null
  reachable: boolean
}

export interface PitwallEngineerServiceOptions {
  db: Firestore
  engineerUid: string
  now?: () => number
}

function nowIso(now: () => number): string {
  return new Date(now()).toISOString()
}

export function createPitwallEngineerService(options: PitwallEngineerServiceOptions) {
  const { db, engineerUid } = options
  const now = options.now ?? (() => Date.now())

  /**
   * Chiede il collegamento a un pilota. La richiesta nasce in attesa: sara' il
   * pilota a concedere. Se aveva gia' pre-autorizzato, il documento esiste
   * gia' come concesso e non va sovrascritto.
   */
  async function requestLink(driverUid: string, note: string | null = null): Promise<
    { ok: true, alreadyGranted: boolean } | { ok: false, reason: string }
  > {
    const request = buildPitwallGrantRequest(driverUid, engineerUid, nowIso(now), note)
    if (!request) return { ok: false, reason: 'Pilota non valido.' }

    // Tutto dentro un solo try: un rifiuto dei permessi deve diventare un
    // messaggio, non un'eccezione che porta giu' la pagina.
    const ref = doc(db, 'pitwallGrants', request.id)
    try {
      const existing = await trackedGetDoc(ref, 'pitwall.requestLink')
      if (existing.exists()) {
        const grant = existing.data() as PitwallGrant
        if (grant.status === 'granted') return { ok: true, alreadyGranted: true }
        if (grant.status === 'pending') return { ok: true, alreadyGranted: false }
        // Un permesso revocato si puo' richiedere di nuovo: torna in attesa.
        await trackedUpdateDoc(ref, { status: 'pending', updatedAt: nowIso(now) }, 'pitwall.reRequestLink')
        return { ok: true, alreadyGranted: false }
      }

      await trackedSetDoc(ref, request.data, 'pitwall.requestLink')
      return { ok: true, alreadyGranted: false }
    } catch (error) {
      return { ok: false, reason: (error as Error)?.message || 'Richiesta rifiutata.' }
    }
  }

  /** Ritira la propria richiesta o rinuncia a un collegamento. */
  async function withdraw(driverUid: string): Promise<{ ok: true } | { ok: false, reason: string }> {
    try {
      await trackedUpdateDoc(doc(db, 'pitwallGrants', pitwallGrantId(driverUid, engineerUid)), {
        status: 'revoked',
        updatedAt: nowIso(now),
      }, 'pitwall.withdraw')
      return { ok: true }
    } catch (error) {
      return { ok: false, reason: (error as Error)?.message || 'Revoca rifiutata.' }
    }
  }

  /** I piloti che hanno concesso il collegamento, con la loro raggiungibilita'. */
  async function listLinkedPilots(): Promise<PitwallLinkedPilot[]> {
    // Un elenco vuoto e' un esito legittimo; un permesso negato non deve
    // diventare un'eccezione che ferma la pagina.
    const grants = await trackedGetDocs(query(
      collection(db, 'pitwallGrants'),
      where('engineerUid', '==', engineerUid),
      where('status', '==', 'granted'),
      limit(50)
    ), 'pitwall.listLinkedPilots')

    const pilots: PitwallLinkedPilot[] = []
    for (const grantDoc of grants.docs) {
      const grant = grantDoc.data() as PitwallGrant
      let session: PitwallSession | null = null
      try {
        const sessionSnapshot = await trackedGetDoc(doc(db, 'pitwallSessions', grant.driverUid), 'pitwall.pilotPresence')
        session = sessionSnapshot.exists() ? (sessionSnapshot.data() as PitwallSession) : null
      } catch {
        // Permesso appena revocato o pilota mai collegato: non e' un errore,
        // semplicemente non e' raggiungibile.
        session = null
      }
      pilots.push({
        driverUid: grant.driverUid,
        grant,
        session,
        reachable: isPitwallSessionFresh(session, now()),
      })
    }
    return pilots
  }

  /**
   * Rilegge la presenza di un pilota.
   *
   * Una lettura, non un ascolto: le regole permettono solo `get` su quel
   * documento, e la presenza cambia lentamente (battito ogni 30 s). Un
   * listener costerebbe di piu' senza dire nulla di piu'.
   */
  async function readPilotPresence(driverUid: string): Promise<{
    session: PitwallSession | null
    reachable: boolean
  }> {
    try {
      const snapshot = await trackedGetDoc(doc(db, 'pitwallSessions', driverUid), 'pitwall.pilotPresence')
      const session = snapshot.exists() ? (snapshot.data() as PitwallSession) : null
      return { session, reachable: isPitwallSessionFresh(session, now()) }
    } catch {
      return { session: null, reachable: false }
    }
  }

  /**
   * Invia la strategia. Restituisce l'id dell'ordine, con cui si segue
   * l'esito: da qui in poi decide il PC del pilota.
   */
  async function sendOrder(input: {
    driverUid: string
    plan: Record<string, unknown>
    revision: number
    orderId?: string
    expiresAt?: string | null
  }): Promise<{ ok: true, orderId: string } | { ok: false, reason: string }> {
    const orderId = input.orderId || `${engineerUid}-${now()}`
    const document = buildPitwallOrderDocument({
      orderId,
      revision: input.revision,
      senderId: engineerUid,
      plan: input.plan,
      nowIso: nowIso(now),
      expiresAt: input.expiresAt ?? null,
    })
    if (!document) return { ok: false, reason: 'Strategia non valida da inviare.' }

    try {
      await trackedSetDoc(doc(db, 'pitwallSessions', input.driverUid, 'orders', orderId), document, 'pitwall.sendOrder')
      return { ok: true, orderId }
    } catch (error) {
      return { ok: false, reason: (error as Error)?.message || 'Invio rifiutato.' }
    }
  }

  /** Segue un ordine finche' il PC del pilota non ne dichiara l'esito. */
  function watchOrder(
    driverUid: string,
    orderId: string,
    onChange: (order: (PitwallOrderDocument & { result?: unknown, appliedAt?: string }) | null) => void
  ): () => void {
    return trackedOnSnapshot(
      query(
        collection(db, 'pitwallSessions', driverUid, 'orders'),
        where('orderId', '==', orderId),
        limit(1)
      ),
      'pitwall.watchOrder',
      (snapshot) => {
        const first = snapshot.docs[0]
        onChange(first
          ? (first.data() as PitwallOrderDocument & { result?: unknown, appliedAt?: string })
          : null)
      },
      () => onChange(null)
    )
  }

  /**
   * Cerca un utente per soprannome, per poterlo invitare.
   *
   * Usa i profili pubblici, che contengono solo soprannome e avatar: cercare
   * qualcuno non deve dare accesso ai suoi dati.
   */
  async function searchUsers(term: string): Promise<PitwallDirectoryEntry[]> {
    const variants = pitwallSearchVariants(term)
    if (!variants.length) return []

    // Firestore confronta byte per byte: `ri` non troverebbe mai `RICO117`.
    // Si cerca il termine in poche forme e si uniscono i risultati.
    const found = new Map<string, PitwallDirectoryEntry>()
    for (const variant of variants) {
      let snapshot
      try {
        snapshot = await trackedGetDocs(query(
          collection(db, 'publicProfiles'),
          orderBy('nickname'),
          startAt(variant),
          endAt(`${variant}`),
          limit(20)
        ), 'pitwall.searchUsers')
      } catch {
        continue
      }
      for (const entry of snapshot.docs) {
        if (entry.id === engineerUid) continue
        const nickname = String((entry.data() as { nickname?: string }).nickname ?? entry.id)
        if (!matchesPitwallSearch(nickname, term)) continue
        found.set(entry.id, { uid: entry.id, nickname })
      }
    }
    return [...found.values()].sort((left, right) => left.nickname.localeCompare(right.nickname))
  }

  /**
   * Le richieste ricevute da chi guida: chi vuole assisterlo e non e' ancora
   * stato autorizzato, piu' chi lo e' gia'.
   */
  async function listIncomingRequests(): Promise<PitwallIncomingRequest[]> {
    const snapshot = await trackedGetDocs(query(
      collection(db, 'pitwallGrants'),
      where('driverUid', '==', engineerUid),
      limit(50)
    ), 'pitwall.listIncomingRequests')

    const requests: PitwallIncomingRequest[] = []
    for (const entry of snapshot.docs) {
      const grant = entry.data() as PitwallGrant
      let nickname: string | null = null
      try {
        const profile = await trackedGetDoc(doc(db, 'publicProfiles', grant.engineerUid), 'pitwall.requesterProfile')
        nickname = profile.exists() ? String((profile.data() as { nickname?: string }).nickname ?? '') || null : null
      } catch {
        nickname = null
      }
      requests.push({
        engineerUid: grant.engineerUid,
        nickname,
        status: grant.status,
        createdAt: grant.createdAt,
      })
    }
    return requests
  }

  /**
   * Il pilota decide: concede o toglie. E' l'unico che puo' farlo, e le regole
   * lo impongono sul server, non solo qui.
   */
  async function decideRequest(requesterUid: string, decision: 'granted' | 'revoked'): Promise<
    { ok: true } | { ok: false, reason: string }
  > {
    try {
      await trackedUpdateDoc(
        doc(db, 'pitwallGrants', pitwallGrantId(engineerUid, requesterUid)),
        { status: decision, updatedAt: nowIso(now) },
        'pitwall.decideRequest'
      )
      return { ok: true }
    } catch (error) {
      return { ok: false, reason: (error as Error)?.message || 'Decisione rifiutata.' }
    }
  }

  /** Pre-autorizza qualcuno senza attendere che chieda. */
  async function preAuthorise(engineerToTrust: string): Promise<{ ok: true } | { ok: false, reason: string }> {
    const grant = buildPitwallPreAuthorisation(engineerUid, engineerToTrust, nowIso(now))
    if (!grant) return { ok: false, reason: 'Utente non valido.' }
    try {
      await trackedSetDoc(doc(db, 'pitwallGrants', grant.id), grant.data, 'pitwall.preAuthorise')
      return { ok: true }
    } catch (error) {
      return { ok: false, reason: (error as Error)?.message || 'Pre-autorizzazione rifiutata.' }
    }
  }

  return {
    requestLink,
    withdraw,
    listLinkedPilots,
    readPilotPresence,
    sendOrder,
    watchOrder,
    searchUsers,
    listIncomingRequests,
    decideRequest,
    preAuthorise,
  }
}
