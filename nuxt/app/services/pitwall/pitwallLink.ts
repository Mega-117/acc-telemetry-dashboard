// ============================================
// Contratto del collegamento Pit Wall, lato frontend.
//
// Rispecchia `desktop-app/runtime/pitwallLinkContract.js` e le regole
// Firestore. Un test statico nel repository root confronta i tre lati: se uno
// cambia e gli altri no, il cancello verde se ne accorge.
//
// Logica pura: nessun accesso a Firestore, nessun accesso a Electron. Chi fa
// I/O sta nei servizi che importano da qui.
// ============================================

export const PITWALL_LINK_SCHEMA_VERSION = 1 as const

/** Separatore dell'id del permesso: due account, un solo documento possibile. */
export const PITWALL_GRANT_ID_SEPARATOR = '__'

export const PITWALL_GRANT_STATUSES = ['pending', 'granted', 'revoked'] as const
export type PitwallGrantStatus = (typeof PITWALL_GRANT_STATUSES)[number]

export const PITWALL_ORDER_STATUSES = [
  'pending', 'applying', 'applied', 'partial', 'failed', 'rejected',
] as const
export type PitwallOrderStatus = (typeof PITWALL_ORDER_STATUSES)[number]

/** Stati oltre i quali un ordine non cambia piu'. */
export const PITWALL_TERMINAL_ORDER_STATUSES: readonly PitwallOrderStatus[] = [
  'applied', 'partial', 'failed', 'rejected',
]

export interface PitwallGrant {
  schemaVersion: 1
  driverUid: string
  engineerUid: string
  status: PitwallGrantStatus
  createdBy: string
  createdAt: string
  updatedAt: string
  note?: string | null
}

export interface PitwallSession {
  schemaVersion: 1
  driverUid: string
  sessionId: string
  online: boolean
  updatedAt: string
  car?: string | null
  track?: string | null
}

export interface PitwallOrderDocument {
  schemaVersion: 1
  orderId: string
  revision: number
  senderId: string
  issuedAt: string
  expiresAt?: string | null
  status: PitwallOrderStatus
  plan: Record<string, unknown>
}

/**
 * Id del permesso fra due account: derivato, non casuale.
 * Due richieste per la stessa coppia finiscono sullo stesso documento invece di
 * creare permessi che possono divergere. Le regole Firestore lo impongono.
 */
export function pitwallGrantId(driverUid: string, engineerUid: string): string {
  return `${driverUid}${PITWALL_GRANT_ID_SEPARATOR}${engineerUid}`
}

/** Un permesso vale solo se concesso e per la coppia attesa. */
export function isPitwallGrantUsable(
  grant: PitwallGrant | null | undefined,
  driverUid: string,
  engineerUid: string
): boolean {
  return Boolean(grant)
    && grant!.status === 'granted'
    && grant!.driverUid === driverUid
    && grant!.engineerUid === engineerUid
}

/** Un pilota e' raggiungibile se e' online e il suo stato non e' vecchio. */
export function isPitwallSessionFresh(
  session: PitwallSession | null | undefined,
  nowMs: number,
  maxAgeMs = 90_000
): boolean {
  if (!session?.online) return false
  const updatedAt = Date.parse(session.updatedAt)
  return Number.isFinite(updatedAt) && nowMs - updatedAt <= maxAgeMs
}

/**
 * Costruisce la richiesta di collegamento. Nasce sempre in attesa: l'ingegnere
 * non puo' autorizzarsi da solo, e le regole lo impedirebbero comunque.
 */
export function buildPitwallGrantRequest(
  driverUid: string,
  engineerUid: string,
  nowIso: string,
  note: string | null = null
): { id: string, data: PitwallGrant } | null {
  if (!driverUid || !engineerUid || driverUid === engineerUid) return null
  return {
    id: pitwallGrantId(driverUid, engineerUid),
    data: {
      schemaVersion: PITWALL_LINK_SCHEMA_VERSION,
      driverUid,
      engineerUid,
      status: 'pending',
      createdBy: engineerUid,
      createdAt: nowIso,
      updatedAt: nowIso,
      ...(note == null ? {} : { note: note.slice(0, 200) }),
    },
  }
}

/** Pre-autorizzazione concessa dal pilota, senza attendere una richiesta. */
export function buildPitwallPreAuthorisation(
  driverUid: string,
  engineerUid: string,
  nowIso: string,
  note: string | null = null
): { id: string, data: PitwallGrant } | null {
  const request = buildPitwallGrantRequest(driverUid, engineerUid, nowIso, note)
  if (!request) return null
  request.data.status = 'granted'
  request.data.createdBy = driverUid
  return request
}

/**
 * Costruisce il documento dell'ordine che l'ingegnere invia.
 * Nasce sempre `pending`: l'esito lo dichiara il PC del pilota.
 */
export function buildPitwallOrderDocument(input: {
  orderId: string
  revision: number
  senderId: string
  plan: Record<string, unknown>
  nowIso: string
  expiresAt?: string | null
}): PitwallOrderDocument | null {
  if (!input.orderId || !input.senderId) return null
  if (!Number.isInteger(input.revision) || input.revision < 0) return null
  if (!input.plan || typeof input.plan !== 'object') return null
  // Le regole limitano il piano a 12 campi: meglio fermarsi qui con un motivo
  // chiaro che ricevere un rifiuto opaco dal server.
  if (Object.keys(input.plan).length > 12) return null
  return {
    schemaVersion: PITWALL_LINK_SCHEMA_VERSION,
    orderId: input.orderId,
    revision: input.revision,
    senderId: input.senderId,
    issuedAt: input.nowIso,
    ...(input.expiresAt == null ? {} : { expiresAt: input.expiresAt }),
    status: 'pending',
    plan: input.plan,
  }
}

/** Un ordine e' concluso e non cambiera' piu'. */
export function isPitwallOrderSettled(status: PitwallOrderStatus | null | undefined): boolean {
  return status != null && PITWALL_TERMINAL_ORDER_STATUSES.includes(status)
}

export interface PitwallOrderProgress {
  /** Testo breve per l'ingegnere, senza gergo. */
  label: string
  /** L'ordine e' ancora in corso. */
  busy: boolean
  /** Qualcosa non e' andato: va mostrato, non nascosto. */
  problem: boolean
}

/** Come si racconta all'ingegnere lo stato del suo ordine. */
export function describePitwallOrderStatus(status: PitwallOrderStatus | null | undefined): PitwallOrderProgress {
  switch (status) {
    case 'pending': return { label: 'Inviato, in attesa del pilota', busy: true, problem: false }
    case 'applying': return { label: 'Il pilota la sta impostando', busy: true, problem: false }
    case 'applied': return { label: 'Impostata e confermata', busy: false, problem: false }
    case 'partial': return { label: 'Impostata in parte: alcuni campi non sono confermabili', busy: false, problem: true }
    case 'failed': return { label: 'Non riuscita', busy: false, problem: true }
    case 'rejected': return { label: 'Rifiutata', busy: false, problem: true }
    default: return { label: 'Nessun ordine inviato', busy: false, problem: false }
  }
}
