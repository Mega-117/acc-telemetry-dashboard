// ============================================
// Il ciclo di vita di una gara: quando e' viva, e quando finisce.
//
// Le stanze non si cancellano mai - sono la memoria della corsa - ma finora non
// finivano nemmeno: ogni sessione ACC ne lasciava una aperta per sempre, e chi
// apriva la Pit Wall trovava otto gare identiche di giorni diversi. Peggio, da
// fuori non si poteva dire quale fosse viva, perche' il battito sta in
// `members/{uid}` e quel documento lo legge solo chi e' gia' dentro.
//
// Due sole scritture, per due domande diverse: "qualcuno c'e' ancora?" (il
// segno di vita, di rado) e "questa gara e' finita" (la chiusura, una volta).
// La decisione su *quali* gare chiudere e' logica pura e vive nel contratto:
// qui c'e' solo chi la mette per iscritto.
// ============================================

import { doc, serverTimestamp, type Firestore } from 'firebase/firestore'
import { trackedUpdateDoc } from '~/composables/useFirebaseTracker'
import { collectPitwallRoomsToClose, type PitwallRoom } from './pitwallRoomContract'
import type { PitwallRoomResult } from './pitwallRoomOrders'

export interface PitwallRoomLifecycleOptions {
  db: Firestore
  now?: () => number
}

export function createPitwallRoomLifecycle(options: PitwallRoomLifecycleOptions) {
  const now = options.now ?? (() => Date.now())
  const roomRef = (roomId: string) => doc(options.db, 'pitwallRooms', roomId)

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

  /** Chiude la gara: resta leggibile come memoria, ma non accetta piu' ordini. */
  async function closeRoom(roomId: string): Promise<PitwallRoomResult<true>> {
    const stamp = new Date(now()).toISOString()
    try {
      await trackedUpdateDoc(roomRef(roomId), { closedAt: stamp, updatedAt: stamp }, 'pitwallRoom.close')
      return { ok: true, value: true }
    } catch (error) {
      return failure(error, 'Chiusura rifiutata.')
    }
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
