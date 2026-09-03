// ============================================
// Il confine fra Firestore e il resto della Race Room.
//
// Un posto solo dove i tipi Firestore smettono di esistere: oltre questa
// frontiera si ragiona in millisecondi e in oggetti semplici, e la logica pura
// del contratto non ha modo di dipendere da un `Timestamp`.
//
// Vive accanto a `pitwallRoomService.ts` e non dentro perche' e' l'unica parte
// che cambia quando cambia la *forma dei documenti*, mentre il servizio cambia
// quando cambia cosa si fa con una stanza: due motivi diversi per toccare due
// file diversi.
// ============================================

import type { Timestamp } from 'firebase/firestore'
import type {
  PitwallMemberKind,
  PitwallRoom,
  PitwallRoomMember,
  PitwallRoomMemberDocument,
} from './pitwallRoomContract'

/** Millisecondi da un Timestamp del server, o `null` se non c'e' ancora. */
function serverMillis(stamp: Timestamp | null | undefined): number | null {
  return typeof stamp?.toMillis === 'function' ? stamp.toMillis() : null
}

/**
 * Da documento Firestore a membro normalizzato.
 *
 * `updatedAt` arriva come Timestamp *del server*: qui diventa millisecondi. Un
 * battito ancora in volo (`serverTimestamp()` appena scritto localmente) non ha
 * ancora un'ora: vale zero, cioe' "non fresco", che e' la risposta prudente -
 * da questo campo dipende chi applica la strategia.
 */
export function normalisePitwallMember(raw: unknown): PitwallRoomMember | null {
  const source = raw as PitwallRoomMemberDocument | null
  if (!source || typeof source.uid !== 'string' || !source.uid) return null
  return {
    uid: source.uid,
    nickname: String(source.nickname ?? source.uid),
    kind: (source.kind === 'engineer' ? 'engineer' : 'driver') as PitwallMemberKind,
    driving: source.driving === true,
    runtimeSessionId: String(source.runtimeSessionId ?? ''),
    updatedAtMs: serverMillis(source.updatedAt as Timestamp | null | undefined) ?? 0,
    crew: source.crew ?? null,
    strategy: source.strategy ?? null,
  }
}

/**
 * Da documento Firestore a stanza normalizzata.
 *
 * Un campo solo, `lastLiveAt`, e per la stessa ragione del battito. Un segno di
 * vita appena scritto e non ancora confermato dal server non ha un'ora: vale
 * `null`, cioe' "non lo so" - e chi decide se chiudere una gara tratta il non
 * saperlo come un motivo per non toccare niente.
 */
export function normalisePitwallRoom(raw: unknown): PitwallRoom {
  const source = raw as (PitwallRoom & { lastLiveAt?: Timestamp | null }) | null
  const stamp = source?.lastLiveAt
  const room = { ...(source ?? {}) } as PitwallRoom & { lastLiveAt?: unknown }
  // Il campo grezzo non prosegue: sarebbe la stessa data in due forme, e due
  // forme della stessa data prima o poi divergono.
  delete room.lastLiveAt
  room.lastLiveAtMs = serverMillis(stamp)
  return room
}
