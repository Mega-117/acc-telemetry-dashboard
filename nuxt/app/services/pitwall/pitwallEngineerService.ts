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
  PITWALL_GRANT_ONCE_DURATION_MS,
  buildPitwallGrantRequest,
  buildPitwallOrderDocument,
  buildPitwallPreAuthorisation,
  isPitwallGrantUsable,
  isPitwallSessionFresh,
  matchesPitwallSearch,
  pitwallGrantId,
  pitwallSearchVariants,
  type PitwallGrant,
  type PitwallGrantScope,
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
  /** Portata concessa: "solo per oggi" o "sempre". Null finche' pending. */
  scope: PitwallGrantScope | null
  expiresAtMs: number | null
  /** Cosa ha chiesto l'ingegnere: si mostra, ma decide il pilota. */
  requestedScope: PitwallGrantScope | null
}

/**
 * Un collegamento in uscita: un pilota che assisto, che ho chiesto di
 * assistere, o che ho assistito in passato. E' la vista dell'ingegnere.
 */
export interface PitwallOutgoingLink {
  driverUid: string
  nickname: string
  status: PitwallGrant['status']
  scope: PitwallGrantScope | null
  expiresAtMs: number | null
  requestedScope: PitwallGrantScope | null
  /** Concesso e non scaduto: ci si puo' collegare adesso. */
  usable: boolean
  /** Solo per i collegamenti usabili: presenza e raggiungibilita'. */
  session: PitwallSession | null
  reachable: boolean
}

export interface PitwallLinkedPilot {
  driverUid: string
  /** Come si chiama, non il suo identificativo: un uid non dice niente. */
  nickname: string
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
   * Chiede il collegamento a un pilota, dichiarando cosa si chiede: "solo per
   * oggi" o "sempre". La richiesta nasce in attesa e decide comunque il
   * pilota, che pero' vede la proposta. Se aveva gia' pre-autorizzato e il
   * permesso e' ancora valido, non si sovrascrive niente; un permesso
   * revocato o scaduto torna in attesa.
   */
  async function requestLink(
    driverUid: string,
    requestedScope: PitwallGrantScope = 'once',
    note: string | null = null
  ): Promise<{ ok: true, alreadyGranted: boolean } | { ok: false, reason: string }> {
    const request = buildPitwallGrantRequest(driverUid, engineerUid, nowIso(now), note, requestedScope)
    if (!request) return { ok: false, reason: 'Pilota non valido.' }

    // Tutto dentro un solo try: un rifiuto dei permessi deve diventare un
    // messaggio, non un'eccezione che porta giu' la pagina.
    const ref = doc(db, 'pitwallGrants', request.id)
    try {
      const existing = await trackedGetDoc(ref, 'pitwall.requestLink')
      if (existing.exists()) {
        const grant = existing.data() as PitwallGrant
        if (isPitwallGrantUsable(grant, driverUid, engineerUid, now())) {
          return { ok: true, alreadyGranted: true }
        }
        if (grant.status === 'pending') return { ok: true, alreadyGranted: false }
        // Revocato o "solo per oggi" scaduto: torna in attesa, con la nuova
        // proposta e senza trascinarsi dietro la portata concessa in passato.
        await trackedUpdateDoc(ref, {
          status: 'pending',
          requestedScope,
          scope: null,
          expiresAtMs: null,
          updatedAt: nowIso(now),
        }, 'pitwall.reRequestLink')
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

  /** Il soprannome pubblico di un utente; il suo uid se non leggibile. */
  async function nicknameOf(uid: string): Promise<string> {
    try {
      const profile = await trackedGetDoc(doc(db, 'publicProfiles', uid), 'pitwall.pilotProfile')
      if (profile.exists()) {
        return String((profile.data() as { nickname?: string }).nickname ?? '') || uid
      }
    } catch {
      // Profilo non leggibile: si mostra l'identificativo, brutto ma vero.
    }
    return uid
  }

  /**
   * Tutti i collegamenti in uscita, in una sola query: quelli pronti (con
   * presenza e pallino online), le richieste ancora in attesa, e la storia
   * (revocati o scaduti) da cui si puo' richiedere. La presenza si legge solo
   * per i collegamenti usabili: sugli altri le regole la negherebbero comunque.
   */
  async function listOutgoingLinks(): Promise<PitwallOutgoingLink[]> {
    const grants = await trackedGetDocs(query(
      collection(db, 'pitwallGrants'),
      where('engineerUid', '==', engineerUid),
      limit(50)
    ), 'pitwall.listOutgoingLinks')

    const links: PitwallOutgoingLink[] = []
    for (const grantDoc of grants.docs) {
      const grant = grantDoc.data() as PitwallGrant
      const usable = isPitwallGrantUsable(grant, grant.driverUid, engineerUid, now())
      let session: PitwallSession | null = null
      if (usable) {
        try {
          const snapshot = await trackedGetDoc(doc(db, 'pitwallSessions', grant.driverUid), 'pitwall.pilotPresence')
          session = snapshot.exists() ? (snapshot.data() as PitwallSession) : null
        } catch {
          session = null
        }
      }
      links.push({
        driverUid: grant.driverUid,
        nickname: await nicknameOf(grant.driverUid),
        status: grant.status,
        scope: grant.scope ?? null,
        expiresAtMs: grant.expiresAtMs ?? null,
        requestedScope: grant.requestedScope ?? null,
        usable,
        session,
        reachable: usable && isPitwallSessionFresh(session, now()),
      })
    }
    // I pre-autorizzati "sempre" in cima, poi gli "oggi", poi il resto.
    const rank = (link: PitwallOutgoingLink) => (
      link.usable ? (link.scope === 'once' ? 1 : 0) : (link.status === 'pending' ? 2 : 3)
    )
    return links.sort((left, right) => rank(left) - rank(right) || left.nickname.localeCompare(right.nickname))
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
      // Un "solo per oggi" scaduto vale come revocato: non si mostra un
      // pilota che le regole rifiuterebbero al primo ordine.
      if (!isPitwallGrantUsable(grant, grant.driverUid, engineerUid, now())) continue
      let session: PitwallSession | null = null
      try {
        const sessionSnapshot = await trackedGetDoc(doc(db, 'pitwallSessions', grant.driverUid), 'pitwall.pilotPresence')
        session = sessionSnapshot.exists() ? (sessionSnapshot.data() as PitwallSession) : null
      } catch {
        // Permesso appena revocato o pilota mai collegato: non e' un errore,
        // semplicemente non e' raggiungibile.
        session = null
      }
      let nickname = grant.driverUid
      try {
        const profile = await trackedGetDoc(doc(db, 'publicProfiles', grant.driverUid), 'pitwall.pilotProfile')
        if (profile.exists()) {
          nickname = String((profile.data() as { nickname?: string }).nickname ?? '') || grant.driverUid
        }
      } catch {
        // Profilo non leggibile: si mostra l'identificativo, che e' brutto ma
        // vero, invece di inventare un nome.
      }
      pilots.push({
        driverUid: grant.driverUid,
        nickname,
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
        scope: grant.scope ?? null,
        expiresAtMs: grant.expiresAtMs ?? null,
        requestedScope: grant.requestedScope ?? null,
      })
    }
    return requests
  }

  /**
   * Le stesse richieste, ma in diretta.
   *
   * Aspettare che l'utente ricarichi la pagina per accorgersi che qualcuno gli
   * ha chiesto di assisterlo e' il modo piu' semplice di far sembrare rotto un
   * collegamento che funziona: la richiesta c'e', ma non si vede. Qui il
   * documento arriva da solo.
   *
   * I nomi si tengono in una piccola cache: senza, ogni aggiornamento
   * rileggerebbe gli stessi profili, e la promessa di costo zero si regge sul
   * non ripetere letture inutili.
   */
  function watchIncomingRequests(
    onChange: (requests: PitwallIncomingRequest[]) => void,
    onError?: (error: Error) => void
  ): () => void {
    const nicknames = new Map<string, string | null>()

    return trackedOnSnapshot(
      query(collection(db, 'pitwallGrants'), where('driverUid', '==', engineerUid), limit(50)),
      'pitwall.watchIncomingRequests',
      (snapshot) => {
        const grants = snapshot.docs.map((entry) => entry.data() as PitwallGrant)
        // Prima si mostra cio' che si sa gia': la richiesta appare subito,
        // il nome si completa un istante dopo se manca.
        onChange(grants.map((grant) => ({
          engineerUid: grant.engineerUid,
          nickname: nicknames.get(grant.engineerUid) ?? null,
          status: grant.status,
          createdAt: grant.createdAt,
          scope: grant.scope ?? null,
          expiresAtMs: grant.expiresAtMs ?? null,
          requestedScope: grant.requestedScope ?? null,
        })))

        const unknown = grants.filter((grant) => !nicknames.has(grant.engineerUid))
        if (!unknown.length) return
        void Promise.all(unknown.map(async (grant) => {
          try {
            const profile = await trackedGetDoc(doc(db, 'publicProfiles', grant.engineerUid), 'pitwall.requesterProfile')
            nicknames.set(grant.engineerUid, profile.exists()
              ? String((profile.data() as { nickname?: string }).nickname ?? '') || null
              : null)
          } catch {
            nicknames.set(grant.engineerUid, null)
          }
        })).then(() => {
          onChange(grants.map((grant) => ({
            engineerUid: grant.engineerUid,
            nickname: nicknames.get(grant.engineerUid) ?? null,
            status: grant.status,
            createdAt: grant.createdAt,
            scope: grant.scope ?? null,
            expiresAtMs: grant.expiresAtMs ?? null,
            requestedScope: grant.requestedScope ?? null,
          })))
        })
      },
      (error) => onError?.(error)
    )
  }

  /**
   * Quando un pilota autorizza, l'ingegnere deve vederlo comparire senza fare
   * niente: e' il momento in cui la funzione diventa utile, e chiedergli di
   * ricaricare proprio li' sarebbe il peggior punto in cui farlo.
   *
   * Passa gli uid, non i piloti completi: presenza e nome li ricompone chi
   * mostra la pagina, che sa gia' come farlo.
   */
  function watchGrantedPilots(
    onChange: (driverUids: string[]) => void,
    onError?: (error: Error) => void
  ): () => void {
    return trackedOnSnapshot(
      query(
        collection(db, 'pitwallGrants'),
        where('engineerUid', '==', engineerUid),
        where('status', '==', 'granted'),
        limit(50)
      ),
      'pitwall.watchGrantedPilots',
      (snapshot) => onChange(snapshot.docs.map((entry) => (entry.data() as PitwallGrant).driverUid)),
      (error) => onError?.(error)
    )
  }

  /**
   * Il pilota decide: concede o toglie. E' l'unico che puo' farlo, e le regole
   * lo impongono sul server, non solo qui.
   *
   * Concedendo sceglie anche la portata: "solo per oggi" nasce con una
   * scadenza oltre la quale il permesso vale come revocato (anche per le
   * regole); "sempre" resta finche' qualcuno non lo toglie.
   */
  async function decideRequest(
    requesterUid: string,
    decision: 'granted' | 'revoked',
    scope: PitwallGrantScope = 'always'
  ): Promise<{ ok: true } | { ok: false, reason: string }> {
    const grantFields = decision === 'granted'
      ? {
          scope,
          expiresAtMs: scope === 'once' ? now() + PITWALL_GRANT_ONCE_DURATION_MS : null,
        }
      : {}
    try {
      await trackedUpdateDoc(
        doc(db, 'pitwallGrants', pitwallGrantId(engineerUid, requesterUid)),
        { status: decision, updatedAt: nowIso(now), ...grantFields },
        'pitwall.decideRequest'
      )
      return { ok: true }
    } catch (error) {
      return { ok: false, reason: (error as Error)?.message || 'Decisione rifiutata.' }
    }
  }

  /**
   * Pre-autorizza qualcuno senza attendere che chieda.
   *
   * Se il permesso esiste gia' (una vecchia richiesta, anche revocata) si
   * aggiorna solo lo stato: riscrivere l'intero documento cambierebbe
   * `createdBy` e le regole - giustamente - lo negherebbero.
   */
  async function preAuthorise(engineerToTrust: string): Promise<{ ok: true } | { ok: false, reason: string }> {
    const grant = buildPitwallPreAuthorisation(engineerUid, engineerToTrust, nowIso(now))
    if (!grant) return { ok: false, reason: 'Utente non valido.' }
    const ref = doc(db, 'pitwallGrants', grant.id)
    try {
      const existing = await trackedGetDoc(ref, 'pitwall.preAuthorise')
      if (existing.exists()) {
        await trackedUpdateDoc(ref, {
          status: 'granted',
          scope: 'always',
          expiresAtMs: null,
          updatedAt: nowIso(now),
        }, 'pitwall.preAuthorise')
        return { ok: true }
      }
      await trackedSetDoc(ref, { ...grant.data, scope: 'always', expiresAtMs: null }, 'pitwall.preAuthorise')
      return { ok: true }
    } catch (error) {
      return { ok: false, reason: (error as Error)?.message || 'Pre-autorizzazione rifiutata.' }
    }
  }

  return {
    requestLink,
    listOutgoingLinks,
    withdraw,
    listLinkedPilots,
    readPilotPresence,
    sendOrder,
    watchOrder,
    searchUsers,
    listIncomingRequests,
    watchIncomingRequests,
    watchGrantedPilots,
    decideRequest,
    preAuthorise,
  }
}
