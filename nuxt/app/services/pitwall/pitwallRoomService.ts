// ============================================
// La Race Room su Firestore: trovarla, entrarci, restarci, uscirne.
//
// Un solo posto che sa *dove* vivono stanza, membri, ordini e lucchetto. Non
// sa niente di Electron, di ACC o della pagina: chi ha bisogno di una stanza
// chiama da qui e riceve dati gia' normalizzati (Principio 1).
//
// La regola che governa tutto il file: chi entra lo decidono l'invito e le
// regole Firestore. L'impronta della vettura fa *ritrovare* la stanza, non la
// apre - per questo il puntatore impronta → stanza e' leggibile da chiunque
// sia autenticato, e non serve a niente a chi non e' invitato.
// ============================================

import {
  collection,
  doc,
  limit,
  orderBy,
  query,
  serverTimestamp,
  where,
  type Firestore,
  type Query,
  type QueryConstraint,
} from 'firebase/firestore'
// Ogni lettura e scrittura passa dal tracker: la promessa "costo zero" regge
// solo se il consumo Firebase resta misurabile, non stimato a occhio.
import {
  trackedGetDoc,
  trackedGetDocs,
  trackedOnDocSnapshot,
  trackedOnSnapshot,
  trackedSetDoc,
  trackedUpdateDoc,
  trackedDeleteDoc,
} from '~/composables/useFirebaseTracker'
import {
  PITWALL_MAX_ROOM_ALLOWED,
  PITWALL_ROOM_SCHEMA_VERSION,
  PITWALL_VEHICLE_POINTER_TTL_MS,
  isPitwallRoomMember,
  type PitwallMemberKind,
  type PitwallRoom,
  type PitwallRoomMember,
  type PitwallVehiclePointer,
} from './pitwallRoomContract'
// Dove i tipi Firestore smettono di esistere: oltre quel confine si ragiona in
// millisecondi, e la logica pura non ha modo di dipendere da un `Timestamp`.
import { normalisePitwallMember, normalisePitwallRoom } from './pitwallRoomDocuments'
import { boundPitwallCrew, boundPitwallStrategy } from './pitwallLink'
// Gli ordini sono l'altra meta' della stanza e cambiano per motivi diversi:
// vivono in un modulo loro e si compongono qui, cosi' chi usa il servizio
// continua a vedere una presa sola (Principio 1).
import { createPitwallRoomOrders } from './pitwallRoomOrders'
import { createPitwallRoomLifecycle } from './pitwallRoomLifecycle'
import type { PitwallRoomResult } from './pitwallRoomOrders'

export interface PitwallRoomServiceOptions {
  db: Firestore
  uid: string
  now?: () => number
  /** Identificativo casuale della stanza. Iniettabile per i test. */
  newRoomId?: () => string
}

export type { PitwallRoomResult } from './pitwallRoomOrders'

function nowIso(nowMs: number): string {
  return new Date(nowMs).toISOString()
}

/**
 * Un identificativo di stanza nuovo, casuale.
 *
 * Casuale e non derivato dai dati ACC apposta: due gare identiche a mesi di
 * distanza devono restare due gare diverse, con membri e ordini separati.
 */
function randomRoomId(): string {
  const bytes = new Uint8Array(10)
  globalThis.crypto.getRandomValues(bytes)
  return [...bytes].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

export function createPitwallRoomService(options: PitwallRoomServiceOptions) {
  const { db, uid } = options
  const now = options.now ?? (() => Date.now())
  const mintRoomId = options.newRoomId ?? randomRoomId
  const orders = createPitwallRoomOrders({ db, uid, now })
  const lifecycle = createPitwallRoomLifecycle({ db, now })

  const roomRef = (roomId: string) => doc(db, 'pitwallRooms', roomId)
  const membersRef = (roomId: string) => collection(db, 'pitwallRooms', roomId, 'members')
  const vehicleRef = (fingerprint: string) => doc(db, 'pitwallVehicles', fingerprint)

  function failure(error: unknown, fallback: string): { ok: false, reason: string } {
    return { ok: false, reason: (error as Error)?.message || fallback }
  }

  async function readRoom(roomId: string): Promise<PitwallRoom | null> {
    const snapshot = await trackedGetDoc(roomRef(roomId), 'pitwallRoom.readRoom')
    return snapshot.exists() ? normalisePitwallRoom(snapshot.data()) : null
  }

  /**
   * Le due query delle mie gare, dalla piu' recente.
   *
   * L'ordine sta nella query e non dopo, perche' il tetto taglia *prima*: con
   * trenta gare e nessun ordine, Firestore ne restituiva trenta a caso (per id,
   * che qui e' casuale) e le piu' recenti potevano non essere fra quelle. E'
   * l'unico posto dove serve un indice composito; se non e' ancora pubblicato,
   * `listRooms` e `watchRooms` ripiegano sulla query senza ordine, che e'
   * esattamente il comportamento di prima: si degrada, non si rompe.
   */
  function roomsQuery(field: 'memberUids' | 'allowedUids', ordered: boolean): Query {
    const clauses: QueryConstraint[] = [where(field, 'array-contains', uid)]
    if (ordered) clauses.push(orderBy('createdAt', 'desc'))
    return query(collection(db, 'pitwallRooms'), ...clauses, limit(30))
  }

  /**
   * Entra in una stanza in cui si e' invitati.
   *
   * Si aggiunge se stessi e nessun altro: e' l'unica forma che le regole
   * accettano, e non e' una formalita' - senza, un invitato potrebbe
   * trascinare dentro chiunque senza passare da un manager.
   */
  async function joinRoom(roomId: string): Promise<PitwallRoomResult<PitwallRoom>> {
    try {
      const room = await readRoom(roomId)
      if (!room) return { ok: false, reason: 'Questa gara non esiste piu.' }
      if (isPitwallRoomMember(room, uid)) return { ok: true, value: room }
      await trackedUpdateDoc(roomRef(roomId), {
        memberUids: [...room.memberUids, uid],
        updatedAt: nowIso(now()),
      }, 'pitwallRoom.join')
      return { ok: true, value: { ...room, memberUids: [...room.memberUids, uid] } }
    } catch (error) {
      return failure(error, 'Ingresso rifiutato.')
    }
  }

  /**
   * Esce dalla stanza. Non e' "spegnere il PC" - quello lo dice il battito, e
   * chi si spegne resta membro e rientra quando vuole - e' proprio dire "non
   * fate piu' conto su di me". Il proprio battito si porta via con se'.
   */
  async function leaveRoom(roomId: string): Promise<PitwallRoomResult<true>> {
    try {
      const room = await readRoom(roomId)
      if (!room) return { ok: true, value: true }
      if (room.hostUid === uid) {
        return { ok: false, reason: 'Chi ha aperto la gara non puo uscire: puo chiuderla.' }
      }
      await trackedUpdateDoc(roomRef(roomId), {
        memberUids: room.memberUids.filter(member => member !== uid),
        updatedAt: nowIso(now()),
      }, 'pitwallRoom.leave')
      await trackedDeleteDoc(doc(membersRef(roomId), uid), 'pitwallRoom.leavePresence').catch(() => {})
      return { ok: true, value: true }
    } catch (error) {
      return failure(error, 'Uscita rifiutata.')
    }
  }

  /**
   * Trova o apre la stanza della vettura che questo PC vede in ACC.
   *
   * Il percorso, nell'ordine in cui evita i guai:
   *  1. si legge il puntatore impronta → stanza. Se c'e' e la stanza e'
   *     raggiungibile, ci si entra: e' cosi' che quattro PC nella stessa
   *     macchina convergono senza girarsi un codice;
   *  2. se il puntatore c'e' ma quella stanza non e' nostra - una gara di
   *     qualcun altro, o un puntatore vecchio - non si insiste e non si prova
   *     a forzare: se e' scaduto si ripunta, altrimenti si dichiara il motivo.
   *     Meglio dirlo che finire in una stanza sbagliata;
   *  3. se non c'e' niente, si apre la stanza e si semina l'elenco degli
   *     invitati con chi ci ha gia' dato fiducia in passato.
   */
  async function ensureRoomForVehicle(input: {
    fingerprint: string
    label: string
    track?: string | null
    raceNumber?: number | null
    teamName?: string | null
    /** Chi si ritrova invitato senza doverlo chiedere: la squadra di sempre. */
    seedAllowedUids?: string[]
  }): Promise<PitwallRoomResult<PitwallRoom>> {
    if (!input.fingerprint) return { ok: false, reason: 'Vettura non ancora identificabile.' }
    const nowMs = now()

    let pointer: PitwallVehiclePointer | null = null
    try {
      const snapshot = await trackedGetDoc(vehicleRef(input.fingerprint), 'pitwallRoom.readVehiclePointer')
      pointer = snapshot.exists() ? (snapshot.data() as PitwallVehiclePointer) : null
    } catch {
      // Puntatore non leggibile: si prova comunque ad aprire la stanza. Una
      // stanza in piu' e' un fastidio; nessuna stanza e' una feature morta.
      pointer = null
    }

    const pointerUsable = pointer != null && Number(pointer.expiresAtMs) > nowMs
    if (pointerUsable) {
      try {
        const room = await readRoom(pointer!.roomId)
        // Una gara chiusa e' memoria, non una porta: chi riapre il Pitwall
        // dopo averlo chiuso vuole una gara nuova, non rientrare in quella
        // archiviata. Si cade nella creazione e il puntatore si riscrive.
        if (room && room.closedAt == null) {
          if (isPitwallRoomMember(room, uid)) return { ok: true, value: room }
          return joinRoom(pointer!.roomId)
        }
      } catch {
        // Le regole negano la lettura: quella stanza esiste ma non e' nostra.
        return {
          ok: false,
          reason: 'La gara di questa vettura e gia aperta da un altro equipaggio: chiedi a un membro di invitarti.',
        }
      }
      // Il puntatore c'e' ma la stanza no: e' un puntatore orfano, si riscrive.
    }

    const roomId = mintRoomId()
    const allowed = [...new Set(input.seedAllowedUids ?? [])]
      .filter(candidate => candidate && candidate !== uid)
      .slice(0, PITWALL_MAX_ROOM_ALLOWED)
    const room: PitwallRoom = {
      schemaVersion: PITWALL_ROOM_SCHEMA_VERSION,
      roomId,
      label: input.label,
      hostUid: uid,
      managerUids: [uid],
      memberUids: [uid],
      allowedUids: allowed,
      vehicleFingerprint: input.fingerprint,
      createdAt: nowIso(nowMs),
      updatedAt: nowIso(nowMs),
      ...(input.track == null ? {} : { track: input.track }),
      ...(input.raceNumber == null ? {} : { raceNumber: input.raceNumber }),
      ...(input.teamName == null ? {} : { teamName: input.teamName }),
    }

    try {
      await trackedSetDoc(roomRef(roomId), room, 'pitwallRoom.create')
    } catch (error) {
      return failure(error, 'Apertura della gara rifiutata.')
    }

    // Il puntatore si scrive *dopo* la stanza: se fallisce, la stanza resta
    // usabile da chi l'ha aperta e gli altri la ritroveranno all'invito. Il
    // contrario - un puntatore verso una stanza che non esiste - manderebbe
    // tutti a bussare a una porta murata.
    try {
      const document: PitwallVehiclePointer = {
        schemaVersion: PITWALL_ROOM_SCHEMA_VERSION,
        fingerprint: input.fingerprint,
        roomId,
        createdBy: uid,
        createdAt: nowIso(nowMs),
        expiresAtMs: nowMs + PITWALL_VEHICLE_POINTER_TTL_MS,
      }
      await trackedSetDoc(vehicleRef(input.fingerprint), document, 'pitwallRoom.writeVehiclePointer')
    } catch {
      // Non e' un fallimento della stanza: solo, gli altri PC non la
      // troveranno da soli e serviranno gli inviti.
    }

    return { ok: true, value: room }
  }

  /** Le gare a cui ho accesso: quelle in cui sono dentro, e quelle a cui sono invitato. */
  async function listRooms(): Promise<PitwallRoom[]> {
    const found = new Map<string, PitwallRoom>()
    // Due query invece di una OR: `array-contains` non si combina con se
    // stesso, e due letture piccole costano meno di un indice composito da
    // mantenere per sempre.
    for (const [field, caller] of [
      ['memberUids', 'pitwallRoom.listJoined'],
      ['allowedUids', 'pitwallRoom.listInvited'],
    ] as const) {
      try {
        let snapshot
        try {
          snapshot = await trackedGetDocs(roomsQuery(field, true), caller)
        } catch {
          // Indice composito non ancora pubblicato: si torna alla query di
          // prima, che risponde comunque, solo senza garanzia sulle piu'
          // recenti quando le gare superano il tetto.
          snapshot = await trackedGetDocs(roomsQuery(field, false), caller)
        }
        for (const entry of snapshot.docs) found.set(entry.id, normalisePitwallRoom(entry.data()))
      } catch {
        // Un elenco vuoto e' un esito legittimo; un permesso negato non deve
        // diventare un'eccezione che ferma la pagina.
      }
    }
    return [...found.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt))
  }

  /**
   * Le gare a cui ho accesso, in diretta.
   *
   * `listRooms` era una lettura sola: un invito arrivato mentre la pagina era
   * aperta - o mentre si era da un'altra parte dell'app - si scopriva solo
   * ricaricando. Sono le stesse due query, ascoltate; le regole le permettono
   * gia' (`memberUids` e `allowedUids` filtrano sul proprio uid).
   */
  function watchRooms(
    onChange: (rooms: PitwallRoom[]) => void,
    onError?: (error: Error) => void
  ): () => void {
    const seen = new Map<string, Map<string, PitwallRoom>>()
    const emit = () => {
      const merged = new Map<string, PitwallRoom>()
      for (const partial of seen.values()) for (const [id, room] of partial) merged.set(id, room)
      onChange([...merged.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt)))
    }
    const stops = (['memberUids', 'allowedUids'] as const).map((field) => {
      const caller = field === 'memberUids' ? 'pitwallRoom.watchJoined' : 'pitwallRoom.watchInvited'
      let stop: (() => void) | null = null
      const attach = (ordered: boolean) => {
        stop = trackedOnSnapshot(
          roomsQuery(field, ordered),
          caller,
          (snapshot: { docs: { id: string, data: () => unknown }[] }) => {
            seen.set(field, new Map(snapshot.docs.map(entry => [entry.id, normalisePitwallRoom(entry.data())])))
            emit()
          },
          (error: Error) => {
            // Un ascolto ordinato che cade perche' manca l'indice non deve
            // lasciare la pagina senza gare: si riattacca senza ordine e si
            // dice l'errore una volta sola, quando non c'e' piu' un piano B.
            if (ordered) {
              stop?.()
              attach(false)
              return
            }
            onError?.(error)
          }
        )
      }
      attach(true)
      return () => stop?.()
    })
    return () => { for (const stop of stops) stop() }
  }

  /** La stanza in diretta: entrate, uscite e inviti si vedono senza ricaricare. */
  function watchRoom(
    roomId: string,
    onChange: (room: PitwallRoom | null) => void,
    onError?: (error: Error) => void
  ): () => void {
    return trackedOnDocSnapshot(
      roomRef(roomId),
      'pitwallRoom.watchRoom',
      (snapshot) => {
        onChange(snapshot.exists() ? normalisePitwallRoom(snapshot.data()) : null)
      },
      (error: Error) => onError?.(error)
    )
  }

  /**
   * I membri in diretta, gia' normalizzati.
   *
   * Qui l'ascolto si paga volentieri: chi e' al volante decide se un ordine
   * puo' partire, e scoprirlo con trenta secondi di ritardo vorrebbe dire
   * mandare una strategia al pilota sbagliato.
   */
  function watchMembers(
    roomId: string,
    onChange: (members: PitwallRoomMember[]) => void,
    onError?: (error: Error) => void
  ): () => void {
    return trackedOnSnapshot(
      membersRef(roomId),
      'pitwallRoom.watchMembers',
      (snapshot: { docs: { data: () => unknown }[] }) => {
        onChange(snapshot.docs
          .map(entry => normalisePitwallMember(entry.data()))
          .filter((member): member is PitwallRoomMember => member != null))
      },
      (error: Error) => onError?.(error)
    )
  }

  /**
   * Pubblica il proprio battito nella stanza.
   *
   * `driving` non e' un bottone: lo deriva chi chiama dallo stato reale di ACC.
   * L'ora la mette il server, e le regole lo impongono: un orologio locale
   * sbagliato non deve poter decidere chi applica la strategia.
   */
  async function publishPresence(roomId: string, input: {
    nickname: string
    kind: PitwallMemberKind
    driving: boolean
    runtimeSessionId: string
    crew?: unknown
    strategy?: unknown
  }): Promise<PitwallRoomResult<true>> {
    const crew = boundPitwallCrew(input.crew)
    const strategy = boundPitwallStrategy(input.strategy, nowIso(now()))
    try {
      await trackedSetDoc(doc(membersRef(roomId), uid), {
        schemaVersion: PITWALL_ROOM_SCHEMA_VERSION,
        uid,
        nickname: input.nickname.slice(0, 60),
        kind: input.kind,
        driving: input.driving === true,
        runtimeSessionId: input.runtimeSessionId.slice(0, 80),
        updatedAt: serverTimestamp(),
        ...(crew == null ? {} : { crew }),
        ...(strategy == null ? {} : { strategy }),
      }, 'pitwallRoom.publishPresence')
      return { ok: true, value: true }
    } catch (error) {
      return failure(error, 'Presenza non pubblicata.')
    }
  }

  /**
   * Sparisce dalla presenza senza uscire dalla stanza.
   *
   * E' il caso normale, non l'eccezione: il pilota che ha finito lo stint
   * spegne il PC e resta membro. Cancellare il battito invece di scrivere
   * `driving:false` evita che un documento fermo continui a sembrare un
   * candidato al volante finche' non scade.
   */
  async function clearPresence(roomId: string): Promise<void> {
    try {
      await trackedDeleteDoc(doc(membersRef(roomId), uid), 'pitwallRoom.clearPresence')
    } catch {
      // Gia' sparito, o rete assente: in entrambi i casi non c'e' niente da fare.
    }
  }

  // --- Chi puo' entrare: solo un manager lo cambia -------------------------

  async function invite(roomId: string, inviteeUid: string): Promise<PitwallRoomResult<true>> {
    try {
      const room = await readRoom(roomId)
      if (!room) return { ok: false, reason: 'Questa gara non esiste piu.' }
      if (room.allowedUids.includes(inviteeUid) || room.memberUids.includes(inviteeUid)) {
        return { ok: true, value: true }
      }
      if (room.allowedUids.length >= PITWALL_MAX_ROOM_ALLOWED) {
        return { ok: false, reason: 'Troppe persone invitate a questa gara.' }
      }
      await trackedUpdateDoc(roomRef(roomId), {
        allowedUids: [...room.allowedUids, inviteeUid],
        updatedAt: nowIso(now()),
      }, 'pitwallRoom.invite')
      return { ok: true, value: true }
    } catch (error) {
      return failure(error, 'Invito rifiutato.')
    }
  }

  /**
   * Toglie l'accesso a qualcuno, adesso.
   *
   * Si toglie da invitati *e* da membri: una revoca che lascia dentro chi era
   * gia' entrato non e' una revoca. Il manager e il fondatore non si toccano
   * da qui - le regole rifiuterebbero comunque di degradare il fondatore.
   */
  async function revoke(roomId: string, memberUid: string): Promise<PitwallRoomResult<true>> {
    try {
      const room = await readRoom(roomId)
      if (!room) return { ok: false, reason: 'Questa gara non esiste piu.' }
      if (room.hostUid === memberUid) {
        return { ok: false, reason: 'Chi ha aperto la gara non si puo escludere.' }
      }
      await trackedUpdateDoc(roomRef(roomId), {
        allowedUids: room.allowedUids.filter(entry => entry !== memberUid),
        memberUids: room.memberUids.filter(entry => entry !== memberUid),
        managerUids: room.managerUids.filter(entry => entry !== memberUid),
        updatedAt: nowIso(now()),
      }, 'pitwallRoom.revoke')
      await trackedDeleteDoc(doc(membersRef(roomId), memberUid), 'pitwallRoom.revokePresence').catch(() => {})
      return { ok: true, value: true }
    } catch (error) {
      return failure(error, 'Revoca rifiutata.')
    }
  }

  /**
   * Rimette in pari l'elenco degli invitati con chi ci ha dato fiducia.
   *
   * Serve perche' seminare gli inviti *solo* all'apertura della gara non basta
   * nella vita vera: la fiducia si stabilisce anche dopo che la gara e' gia'
   * aperta - un compagno ti autorizza a meta' weekend, oppure un permesso
   * "solo per oggi" scade e viene rinnovato. Senza questo, l'unico modo di
   * farlo entrare sarebbe invitarlo a mano dal PC di chi sta guidando, che e'
   * esattamente la cosa che il pilota non deve fare mentre guida.
   *
   * Non allarga niente: e' un manager che scrive il proprio elenco di
   * invitati, cioe' quello che potrebbe fare a mano. Chi non ha un permesso
   * valido resta fuori. Se non c'e' nulla da aggiungere non scrive: una
   * scrittura a vuoto ogni pochi minuti, per ogni pilota, e' proprio il tipo
   * di costo che si accumula senza dire niente di nuovo.
   */
  async function syncInvites(roomId: string, trustedUids: string[]): Promise<PitwallRoomResult<number>> {
    try {
      const room = await readRoom(roomId)
      if (!room) return { ok: false, reason: 'Questa gara non esiste piu.' }
      if (!room.managerUids.includes(uid)) return { ok: true, value: 0 }

      const known = new Set([...room.allowedUids, ...room.memberUids])
      const missing = [...new Set(trustedUids)].filter(candidate => candidate && !known.has(candidate))
      if (!missing.length) return { ok: true, value: 0 }

      const allowedUids = [...room.allowedUids, ...missing].slice(0, PITWALL_MAX_ROOM_ALLOWED)
      await trackedUpdateDoc(roomRef(roomId), {
        allowedUids,
        updatedAt: nowIso(now()),
      }, 'pitwallRoom.syncInvites')
      return { ok: true, value: missing.length }
    } catch (error) {
      return failure(error, 'Aggiornamento degli invitati rifiutato.')
    }
  }

  /** Promuove un membro a manager: da qui in poi potra' invitare anche lui. */
  async function promote(roomId: string, memberUid: string): Promise<PitwallRoomResult<true>> {
    try {
      const room = await readRoom(roomId)
      if (!room) return { ok: false, reason: 'Questa gara non esiste piu.' }
      if (room.managerUids.includes(memberUid)) return { ok: true, value: true }
      await trackedUpdateDoc(roomRef(roomId), {
        managerUids: [...room.managerUids, memberUid],
        updatedAt: nowIso(now()),
      }, 'pitwallRoom.promote')
      return { ok: true, value: true }
    } catch (error) {
      return failure(error, 'Promozione rifiutata.')
    }
  }

  return {
    uid,
    ...orders,
    // Il ciclo di vita cambia per un motivo suo - quando una gara e' viva e
    // quando finisce - quindi vive in un modulo suo e si compone qui: chi usa
    // il servizio continua a vedere una presa sola (Principio 1).
    ...lifecycle,
    readRoom,
    ensureRoomForVehicle,
    listRooms,
    watchRooms,
    joinRoom,
    leaveRoom,
    watchRoom,
    watchMembers,
    publishPresence,
    clearPresence,
    invite,
    syncInvites,
    revoke,
    promote,
  }
}

export type PitwallRoomService = ReturnType<typeof createPitwallRoomService>
