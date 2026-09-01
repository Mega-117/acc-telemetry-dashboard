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
  query,
  serverTimestamp,
  where,
  type Firestore,
  type Timestamp,
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
  type PitwallRoomMemberDocument,
  type PitwallVehiclePointer,
} from './pitwallRoomContract'
import { boundPitwallCrew, boundPitwallStrategy } from './pitwallLink'
// Gli ordini sono l'altra meta' della stanza e cambiano per motivi diversi:
// vivono in un modulo loro e si compongono qui, cosi' chi usa il servizio
// continua a vedere una presa sola (Principio 1).
import { createPitwallRoomOrders } from './pitwallRoomOrders'
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

/**
 * Da documento Firestore a membro normalizzato.
 *
 * `updatedAt` arriva come Timestamp *del server*: qui diventa millisecondi, e
 * da qui in poi nessuno deve piu' sapere che esiste un tipo Firestore. Un
 * battito ancora in volo (`serverTimestamp()` appena scritto localmente) non
 * ha ancora un'ora: vale zero, cioe' "non fresco", che e' la risposta prudente.
 */
export function normalisePitwallMember(raw: unknown): PitwallRoomMember | null {
  const source = raw as PitwallRoomMemberDocument | null
  if (!source || typeof source.uid !== 'string' || !source.uid) return null
  const stamp = source.updatedAt as Timestamp | null | undefined
  const updatedAtMs = typeof stamp?.toMillis === 'function' ? stamp.toMillis() : 0
  return {
    uid: source.uid,
    nickname: String(source.nickname ?? source.uid),
    kind: (source.kind === 'engineer' ? 'engineer' : 'driver') as PitwallMemberKind,
    driving: source.driving === true,
    runtimeSessionId: String(source.runtimeSessionId ?? ''),
    updatedAtMs,
    crew: source.crew ?? null,
    strategy: source.strategy ?? null,
  }
}

export function createPitwallRoomService(options: PitwallRoomServiceOptions) {
  const { db, uid } = options
  const now = options.now ?? (() => Date.now())
  const mintRoomId = options.newRoomId ?? randomRoomId
  const orders = createPitwallRoomOrders({ db, uid, now })

  const roomRef = (roomId: string) => doc(db, 'pitwallRooms', roomId)
  const membersRef = (roomId: string) => collection(db, 'pitwallRooms', roomId, 'members')
  const vehicleRef = (fingerprint: string) => doc(db, 'pitwallVehicles', fingerprint)

  function failure(error: unknown, fallback: string): { ok: false, reason: string } {
    return { ok: false, reason: (error as Error)?.message || fallback }
  }

  async function readRoom(roomId: string): Promise<PitwallRoom | null> {
    const snapshot = await trackedGetDoc(roomRef(roomId), 'pitwallRoom.readRoom')
    return snapshot.exists() ? (snapshot.data() as PitwallRoom) : null
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
        if (room) {
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
        const snapshot = await trackedGetDocs(query(
          collection(db, 'pitwallRooms'),
          where(field, 'array-contains', uid),
          limit(30)
        ), caller)
        for (const entry of snapshot.docs) found.set(entry.id, entry.data() as PitwallRoom)
      } catch {
        // Un elenco vuoto e' un esito legittimo; un permesso negato non deve
        // diventare un'eccezione che ferma la pagina.
      }
    }
    return [...found.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt))
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
        onChange(snapshot.exists() ? (snapshot.data() as PitwallRoom) : null)
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

  /** Chiude la gara: la stanza resta leggibile come memoria, ma non accetta piu' ordini. */
  async function closeRoom(roomId: string): Promise<PitwallRoomResult<true>> {
    try {
      await trackedUpdateDoc(roomRef(roomId), {
        closedAt: nowIso(now()),
        updatedAt: nowIso(now()),
      }, 'pitwallRoom.close')
      return { ok: true, value: true }
    } catch (error) {
      return failure(error, 'Chiusura rifiutata.')
    }
  }
  return {
    uid,
    ...orders,
    readRoom,
    ensureRoomForVehicle,
    listRooms,
    joinRoom,
    leaveRoom,
    watchRoom,
    watchMembers,
    publishPresence,
    clearPresence,
    invite,
    revoke,
    promote,
    closeRoom,
  }
}

export type PitwallRoomService = ReturnType<typeof createPitwallRoomService>
