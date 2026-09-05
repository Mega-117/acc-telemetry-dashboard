// ============================================
// Il ciclo di vita di una gara: quando e' viva, e quando finisce.
//
// Una gara finita sparisce (PIP-379). Prima le stanze non si cancellavano mai -
// "la memoria della corsa" - e ogni sessione ACC ne lasciava una su Firebase
// per sempre; l'utente le vedeva ricomparire nell'elenco e non le voleva ne'
// a schermo ne' come traccia. La memoria della corsa e' l'audit sul PC del
// pilota, non un documento remoto.
//
// Due scritture, per due domande diverse: "qualcuno c'e' ancora?" (il segno di
// vita, di rado) e "questa gara e' finita" (la cancellazione, una volta). La
// decisione su *quali* gare finiscono e' logica pura e vive nel contratto: qui
// c'e' solo chi la mette in atto.
// ============================================

import { collection, doc, serverTimestamp, type Firestore } from 'firebase/firestore'
import {
  trackedDeleteDoc,
  trackedGetDoc,
  trackedGetDocs,
  trackedUpdateDoc,
  trackedWriteBatch,
} from '~/composables/useFirebaseTracker'
import { collectPitwallRoomsToClose, type PitwallRoom } from './pitwallRoomContract'
import type { PitwallRoomResult } from './pitwallRoomOrders'

export interface PitwallRoomLifecycleOptions {
  db: Firestore
  now?: () => number
}

/** Le raccolte figlie di una stanza: se ne vanno con lei, prima di lei. */
export const PITWALL_ROOM_CHILD_COLLECTIONS = ['members', 'orders', 'control'] as const

/** Sotto il tetto di Firestore per un batch (500), con margine. */
const DELETE_BATCH_SIZE = 400

function isPermissionDenied(error: unknown): boolean {
  const code = String((error as { code?: string })?.code ?? '')
  const message = String((error as Error)?.message ?? '')
  return /permission-denied|insufficient permissions/i.test(`${code} ${message}`)
}

export function createPitwallRoomLifecycle(options: PitwallRoomLifecycleOptions) {
  const now = options.now ?? (() => Date.now())
  const roomRef = (roomId: string) => doc(options.db, 'pitwallRooms', roomId)
  const vehicleRef = (fingerprint: string) => doc(options.db, 'pitwallVehicles', fingerprint)

  function failure(error: unknown, fallback: string): { ok: false, reason: string } {
    return { ok: false, reason: (error as Error)?.message || fallback }
  }

  /**
   * Lascia un segno di vita sulla stanza.
   *
   * Risponde a "questa gara e' ancora di qualcuno?" e a nient'altro, quindi va
   * molto piu' piano del battito. L'ora la mette il server: con una stringa del
   * client, un orologio avanti avrebbe tenuto viva per sempre una gara finita.
   *
   * Se le regole non sono ancora pubblicate la scrittura viene negata, e chi
   * chiama lo tratta come "per adesso non si puo'": la gara funziona lo stesso,
   * e' il suo elenco che resta com'era prima.
   */
  async function stampRoomLive(roomId: string): Promise<PitwallRoomResult<true>> {
    try {
      await trackedUpdateDoc(roomRef(roomId), { lastLiveAt: serverTimestamp() }, 'pitwallRoom.stampLive')
      return { ok: true, value: true }
    } catch (error) {
      return failure(error, 'Segno di vita non scritto.')
    }
  }

  /** Il ripiego di prima: la gara resta, chiusa. Solo finche' le regole non lasciano cancellare. */
  async function markClosed(roomId: string): Promise<PitwallRoomResult<true>> {
    const stamp = new Date(now()).toISOString()
    try {
      await trackedUpdateDoc(roomRef(roomId), { closedAt: stamp, updatedAt: stamp }, 'pitwallRoom.close')
      return { ok: true, value: true }
    } catch (error) {
      return failure(error, 'Chiusura rifiutata.')
    }
  }

  /**
   * I figli si cancellano prima del padre, e a pacchetti: le regole dei figli
   * guardano la stanza (`exists`, manager), e senza padre nessuno potrebbe
   * piu' toccarli - resterebbero orfani per sempre, che e' proprio la traccia
   * da non lasciare.
   */
  async function deleteChildren(roomId: string): Promise<void> {
    for (const name of PITWALL_ROOM_CHILD_COLLECTIONS) {
      const snapshot = await trackedGetDocs(collection(options.db, 'pitwallRooms', roomId, name), 'pitwallRoom.listChildren')
      const refs = snapshot.docs.map(entry => entry.ref)
      for (let start = 0; start < refs.length; start += DELETE_BATCH_SIZE) {
        const batch = trackedWriteBatch(options.db, 'pitwallRoom.deleteChildren')
        for (const ref of refs.slice(start, start + DELETE_BATCH_SIZE)) batch.delete(ref)
        await batch.commit()
      }
    }
  }

  /**
   * Il puntatore della vettura va via con la gara, se e' ancora il suo.
   * Un puntatore gia' ripuntato a un'altra stanza non si tocca: sarebbe la
   * gara di qualcun altro.
   */
  async function deletePointer(fingerprint: string | null | undefined, roomId: string): Promise<void> {
    if (!fingerprint) return
    try {
      const snapshot = await trackedGetDoc(vehicleRef(fingerprint), 'pitwallRoom.readVehiclePointer')
      const pointer = snapshot.exists() ? (snapshot.data() as { roomId?: string }) : null
      if (pointer?.roomId === roomId) await trackedDeleteDoc(vehicleRef(fingerprint), 'pitwallRoom.deleteVehiclePointer')
    } catch {
      // Il puntatore scade da solo entro due giorni: un residuo breve, non una
      // gara che resta. Non si trasforma una chiusura riuscita in un errore.
    }
  }

  /**
   * Chiude la gara: la cancella, con membri, ordini, lucchetto e puntatore.
   *
   * Il nome resta `closeRoom` perche' e' la presa che tutti usano - il pilota
   * che preme Chiudi, l'ingegnere manager, la chiusura delle dormienti - e per
   * loro il gesto e' lo stesso di prima: la gara finisce. Cambia cosa resta:
   * niente.
   *
   * Se le regole pubblicate non lasciano ancora cancellare, si scrive
   * `closedAt` come prima: la gara sparisce dagli elenchi lo stesso, e la
   * cancellazione arrivera' con le regole nuove. Una stanza gia' sparita e'
   * una chiusura riuscita, non un errore.
   */
  async function closeRoom(roomId: string): Promise<PitwallRoomResult<true>> {
    let fingerprint: string | null = null
    try {
      const snapshot = await trackedGetDoc(roomRef(roomId), 'pitwallRoom.readRoom')
      if (!snapshot.exists()) return { ok: true, value: true }
      fingerprint = String((snapshot.data() as Partial<PitwallRoom>).vehicleFingerprint ?? '') || null
    } catch (error) {
      return failure(error, 'Gara non leggibile.')
    }

    try {
      await deleteChildren(roomId)
      await trackedDeleteDoc(roomRef(roomId), 'pitwallRoom.delete')
    } catch (error) {
      if (isPermissionDenied(error)) return markClosed(roomId)
      return failure(error, 'Chiusura rifiutata.')
    }

    await deletePointer(fingerprint, roomId)
    return { ok: true, value: true }
  }

  return { stampRoomLive, closeRoom }
}

export type PitwallRoomLifecycle = ReturnType<typeof createPitwallRoomLifecycle>

/**
 * Chiude le gare dormienti fra quelle che vedo, e dice quali ha chiuso.
 *
 * Lo fa il client che passa di li', non un lavoro schedulato: nessun server da
 * tenere acceso, nessun costo fisso, e chi non ha gare vecchie non paga niente.
 * `attempted` cresce anche sui tentativi falliti, perche' l'elenco arriva in
 * diretta e riprovare a ogni consegna vorrebbe dire una scrittura negata al
 * secondo finche' le regole non sono pubblicate.
 */
export async function closeDormantPitwallRooms(
  service: { uid: string, closeRoom: (roomId: string) => Promise<PitwallRoomResult<true>> } | null,
  rooms: PitwallRoom[],
  currentRoomId: string | null,
  attempted: Set<string>,
  nowMs: number = Date.now()
): Promise<string[]> {
  if (!service) return []
  const toClose = collectPitwallRoomsToClose(rooms, service.uid, currentRoomId, nowMs, attempted)
  const closed: string[] = []
  for (const roomId of toClose) {
    attempted.add(roomId)
    // Un rifiuto non e' un errore da mostrare a chi sta per guidare: la gara
    // resta aperta e la si riguardera' alla prossima apertura dell'app.
    const done = await service.closeRoom(roomId)
    if (done.ok) closed.push(roomId)
  }
  return closed
}
