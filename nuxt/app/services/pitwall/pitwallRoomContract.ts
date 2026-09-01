// ============================================
// Contratto della Race Room, lato frontend.
//
// Rispecchia `desktop-app/runtime/pitwallRoomContract.js` e le regole
// Firestore. Un test statico nel repository root confronta i tre lati: se uno
// cambia e gli altri no, il cancello verde se ne accorge.
//
// La distinzione che questo file esiste per rendere impossibile da sbagliare:
// `vehicleFingerprint` dice *quale vettura*, `roomId` dice *quale gara* ed e'
// l'unica identita' autorevole. Nessuno dei due autorizza: chi entra lo
// decidono invito e regole Firestore.
//
// Logica pura: nessun accesso a Firestore. Chi fa I/O sta in
// `pitwallRoomService.ts`.
// ============================================

export const PITWALL_ROOM_SCHEMA_VERSION = 2 as const

/** Lunghezza dell'impronta di vettura: corta nei log, senza collisioni. */
export const PITWALL_VEHICLE_FINGERPRINT_LENGTH = 16
/** Lunghezza dell'identificativo di stanza, casuale. */
export const PITWALL_ROOM_ID_LENGTH = 20

export const PITWALL_MAX_ROOM_MANAGERS = 8
export const PITWALL_MAX_ROOM_MEMBERS = 16
export const PITWALL_MAX_ROOM_ALLOWED = 32
export const PITWALL_MAX_ROOM_LABEL_CHARS = 120
export const PITWALL_MAX_ROOM_NICKNAME_CHARS = 60
export const PITWALL_MAX_ROOM_CREW = 16

/** Oltre quanto un battito e' vecchio: tre battiti persi. */
export const PITWALL_MEMBER_FRESH_MS = 90_000
/** Ogni quanto batte un membro con ACC vivo. */
export const PITWALL_MEMBER_HEARTBEAT_MS = 30_000
/** Ogni quanto batte chi non ha ACC vivo: farsi trovare costa poco, di rado. */
export const PITWALL_MEMBER_IDLE_HEARTBEAT_MS = 5 * 60_000

/**
 * Quanto vive un ordine prima di scadere da solo. Due minuti, non cinque:
 * l'ordine si applica mentre il pilota guida, e il Pit MFD si naviga in
 * secondi. Nessuna coda indefinita.
 */
export const PITWALL_ORDER_TTL_MS = 120_000
/** Quanto dura la presa di chi applica, prima che la stanza torni libera. */
export const PITWALL_CLAIM_LEASE_MS = 90_000
/** Tetto imposto dalle regole: nessuno blocca la stanza a vita. */
export const PITWALL_MAX_CLAIM_LEASE_MS = 300_000
/** Quanto vale il puntatore impronta → stanza: un weekend di gara. */
export const PITWALL_VEHICLE_POINTER_TTL_MS = 48 * 60 * 60 * 1000

/** Il documento unico che fa da lucchetto: un solo ordine in volo per stanza. */
export const PITWALL_ROOM_LOCK_DOCUMENT_ID = 'activeOrder'

export const PITWALL_MEMBER_KINDS = ['driver', 'engineer'] as const
export type PitwallMemberKind = (typeof PITWALL_MEMBER_KINDS)[number]

/**
 * I due soli livelli di accesso. Applicare non e' un livello: appartiene al
 * pilota eletto in quel momento, e cambia da solo quando cambia chi guida.
 */
export const PITWALL_ROOM_ROLES = ['manager', 'member'] as const
export type PitwallRoomRole = (typeof PITWALL_ROOM_ROLES)[number]

export type PitwallExecutorReason = 'ready' | 'nobody-driving' | 'multiple-driving' | 'empty-room'

/** La stanza di una gara, come vive su Firestore. */
export interface PitwallRoom {
  schemaVersion: 2
  roomId: string
  label: string
  hostUid: string
  /** Chi puo' invitare e revocare. Il fondatore c'e' sempre. */
  managerUids: string[]
  /** Chi e' entrato davvero. */
  memberUids: string[]
  /** Chi e' stato invitato e puo' entrare da solo. */
  allowedUids: string[]
  /** Quale vettura: serve a ritrovarsi, non autorizza nessuno. */
  vehicleFingerprint: string
  createdAt: string
  updatedAt: string
  track?: string | null
  raceNumber?: number | null
  teamName?: string | null
  /** Gara chiusa: resta leggibile come memoria, non accetta piu' ordini. */
  closedAt?: string | null
}

/**
 * Il battito di un membro dentro la stanza.
 *
 * `updatedAt` lo scrive il *server*: un orologio locale sbagliato non deve
 * poter far sembrare fresco un battito di mezz'ora fa, ne' far sparire un
 * pilota che e' ancora in pista.
 */
export interface PitwallRoomMemberDocument {
  schemaVersion: 2
  uid: string
  nickname: string
  kind: PitwallMemberKind
  /** Sta guidando adesso. Derivato dallo stato ACC, non da un bottone. */
  driving: boolean
  /** Cambia a ogni avvio dell'app: distingue due sessioni dello stesso account. */
  runtimeSessionId: string
  updatedAt: unknown
  crew?: unknown
  strategy?: unknown
}

/** Lo stesso membro, normalizzato per la logica pura: niente tipi Firestore. */
export interface PitwallRoomMember {
  uid: string
  nickname: string
  kind: PitwallMemberKind
  driving: boolean
  runtimeSessionId: string
  /** Millisecondi del battito, dall'orologio del server. */
  updatedAtMs: number
  crew?: unknown
  strategy?: unknown
}

export interface PitwallRoomOrder {
  schemaVersion: 2
  orderId: string
  revision: number
  senderId: string
  issuedAt: string
  /** Obbligatoria: nessun ordine resta in coda per sempre. */
  expiresAtMs: number
  status: string
  plan: Record<string, unknown>
  /** Chi ha preso in carico: solo lui potra' scriverne l'esito. */
  claimedBy?: string | null
  claimedAtMs?: number | null
  result?: unknown
  appliedAt?: string | null
}

/** Il lucchetto della stanza: un solo ordine in applicazione alla volta. */
export interface PitwallRoomLock {
  schemaVersion: 2
  orderId: string | null
  claimedBy: string | null
  claimedAtMs: number | null
  leaseUntilMs: number | null
  updatedAt: unknown
}

/** Il puntatore che fa ritrovare la stanza a chi vede la stessa vettura. */
export interface PitwallVehiclePointer {
  schemaVersion: 2
  fingerprint: string
  roomId: string
  createdBy: string
  createdAt: string
  expiresAtMs: number
}

export interface PitwallExecutorResolution {
  /** Chi applichera' l'ordine. Null quando non si puo' dire con certezza. */
  executor: PitwallRoomMember | null
  reason: PitwallExecutorReason
  /** Popolato solo su `multiple-driving`: chi si contende il volante. */
  conflicting: PitwallRoomMember[]
}

/** Chi comanda nella stanza, per un account. Null = estraneo. */
export function pitwallRoomRoleOf(
  room: Pick<PitwallRoom, 'managerUids' | 'memberUids'> | null | undefined,
  uid: string | null | undefined
): PitwallRoomRole | null {
  if (!room || !uid) return null
  if ((room.managerUids ?? []).includes(uid)) return 'manager'
  if ((room.memberUids ?? []).includes(uid)) return 'member'
  return null
}

export function isPitwallRoomMember(
  room: Pick<PitwallRoom, 'managerUids' | 'memberUids'> | null | undefined,
  uid: string | null | undefined
): boolean {
  return pitwallRoomRoleOf(room, uid) != null
}

/** Invitato ma non ancora entrato: vede la porta, non la stanza. */
export function isPitwallRoomInvited(
  room: Pick<PitwallRoom, 'managerUids' | 'memberUids' | 'allowedUids'> | null | undefined,
  uid: string | null | undefined
): boolean {
  return Boolean(uid)
    && (room?.allowedUids ?? []).includes(uid!)
    && !isPitwallRoomMember(room, uid)
}

/**
 * Chi e' al volante adesso, fra i membri della stanza.
 *
 * Un membro vale solo se ha un battito recente: chi ha spento il PC resta
 * nella stanza - ci rientrera' quando vuole, ed e' tutto il punto della
 * feature - ma non puo' eseguire niente.
 *
 * Con due che si dichiarano al volante non si indovina: si dichiara il
 * conflitto e chi chiama rifiuta l'ordine. Mandare una strategia alla macchina
 * sbagliata e' peggio che non mandarla.
 */
export function resolvePitwallRoomExecutor(
  members: PitwallRoomMember[] | null | undefined,
  nowMs: number,
  maxAgeMs: number = PITWALL_MEMBER_FRESH_MS
): PitwallExecutorResolution {
  const list = Array.isArray(members) ? members : []
  if (!list.length) return { executor: null, reason: 'empty-room', conflicting: [] }

  const atTheWheel = list.filter(member => (
    member?.driving === true
    && Number.isFinite(member?.updatedAtMs)
    && nowMs - member.updatedAtMs <= maxAgeMs
  ))

  if (!atTheWheel.length) return { executor: null, reason: 'nobody-driving', conflicting: [] }
  if (atTheWheel.length > 1) return { executor: null, reason: 'multiple-driving', conflicting: atTheWheel }
  return { executor: atTheWheel[0]!, reason: 'ready', conflicting: [] }
}

/** Come si racconta all'ingegnere chi applichera' l'ordine, senza gergo. */
export function describePitwallRoomExecutor(resolution: PitwallExecutorResolution): string {
  switch (resolution.reason) {
    case 'ready':
      return `Al volante: ${resolution.executor?.nickname}`
    case 'nobody-driving':
      return 'Nessuno e al volante adesso: la strategia non parte finche qualcuno non guida.'
    case 'multiple-driving':
      return `Due piloti risultano al volante (${resolution.conflicting.map(m => m.nickname).join(', ')}): l ordine non parte finche non e chiaro chi guida.`
    default:
      return 'Nessuno nella stanza.'
  }
}

/** Un membro e' raggiungibile adesso (indipendentemente da chi guida). */
export function isPitwallMemberFresh(
  member: Pick<PitwallRoomMember, 'updatedAtMs'> | null | undefined,
  nowMs: number,
  maxAgeMs: number = PITWALL_MEMBER_FRESH_MS
): boolean {
  return Number.isFinite(member?.updatedAtMs) && nowMs - member!.updatedAtMs <= maxAgeMs
}

/** Un ordine della stanza e' scaduto: non parte piu', e non resta in coda. */
export function isPitwallRoomOrderExpired(
  order: Pick<PitwallRoomOrder, 'expiresAtMs'> | null | undefined,
  nowMs: number
): boolean {
  const expiresAtMs = Number(order?.expiresAtMs)
  return !Number.isFinite(expiresAtMs) || expiresAtMs <= nowMs
}

/**
 * La presa e' libera adesso.
 *
 * Un lucchetto senza ordine e' libero; un lucchetto la cui presa e' scaduta lo
 * e' di nuovo, altrimenti un PC morto a meta' bloccherebbe la stanza per
 * sempre. Scaduto non vuol dire "riprova quell'ordine": vuol dire "la stanza
 * accetta il prossimo".
 */
export function isPitwallClaimAvailable(
  lock: Pick<PitwallRoomLock, 'orderId' | 'leaseUntilMs'> | null | undefined,
  orderId: string,
  nowMs: number
): boolean {
  if (!lock || lock.orderId == null) return true
  if (lock.orderId === orderId) return true
  const leaseUntilMs = Number(lock.leaseUntilMs)
  return !Number.isFinite(leaseUntilMs) || leaseUntilMs <= nowMs
}

/**
 * Costruisce l'ordine che un membro manda alla vettura.
 *
 * Nasce sempre `pending` e sempre con una scadenza: l'esito lo dichiara il PC
 * che lo applica, e nessun ordine resta appeso in eterno.
 */
export function buildPitwallRoomOrder(input: {
  orderId: string
  revision: number
  senderId: string
  plan: Record<string, unknown>
  nowMs: number
  ttlMs?: number
}): PitwallRoomOrder | null {
  if (!input.orderId || !input.senderId) return null
  if (!Number.isInteger(input.revision) || input.revision < 0) return null
  if (!input.plan || typeof input.plan !== 'object') return null
  // Le regole limitano il piano a 12 campi: meglio fermarsi qui con un motivo
  // chiaro che ricevere un rifiuto opaco dal server.
  if (Object.keys(input.plan).length > 12) return null
  const ttlMs = Number.isFinite(input.ttlMs) ? Number(input.ttlMs) : PITWALL_ORDER_TTL_MS
  return {
    schemaVersion: PITWALL_ROOM_SCHEMA_VERSION,
    orderId: input.orderId,
    revision: input.revision,
    senderId: input.senderId,
    issuedAt: new Date(input.nowMs).toISOString(),
    expiresAtMs: input.nowMs + ttlMs,
    status: 'pending',
    plan: input.plan,
  }
}

/** Come si racconta una stanza in elenco, senza identificativi tecnici. */
export function describePitwallRoom(room: Pick<PitwallRoom, 'label' | 'closedAt'> | null | undefined): string {
  if (!room) return ''
  return room.closedAt ? `${room.label} (gara chiusa)` : room.label
}
