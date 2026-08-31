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

/**
 * Portata del permesso: "solo per questa volta" oppure "sempre".
 * `once` nasce con una scadenza (`expiresAtMs`); passata quella vale come una
 * revoca, sia per le regole Firestore sia per il client.
 */
export const PITWALL_GRANT_SCOPES = ['once', 'always'] as const
export type PitwallGrantScope = (typeof PITWALL_GRANT_SCOPES)[number]

/** Quanto dura un "solo per questa volta": copre una giornata di gara. */
export const PITWALL_GRANT_ONCE_DURATION_MS = 12 * 60 * 60 * 1000

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
  scope?: PitwallGrantScope | null
  expiresAtMs?: number | null
  /** Cio' che l'ingegnere ha chiesto: propone, non decide. */
  requestedScope?: PitwallGrantScope | null
}

/** Un membro dell'equipaggio della vettura, dalla EntryList reale. */
export interface PitwallCrewMember {
  driverIndex: number
  name: string
  /** Sta guidando adesso. */
  current: boolean
}

/**
 * Fotografia della strategia nel Pit MFD del pilota.
 * Piccola e lenta: viaggia dentro il battito di presenza, non e' telemetria.
 */
export interface PitwallStrategySnapshot {
  fuelToAdd: number | null
  tyreSet: number | null
  pressures: Record<'FL' | 'FR' | 'RL' | 'RR', number> | null
  /** Nota solo dopo che l'applicatore l'ha osservata: null = sconosciuta. */
  compound: 'dry' | 'wet' | null
  updatedAt: string
}

export interface PitwallSession {
  schemaVersion: 1
  driverUid: string
  sessionId: string
  online: boolean
  updatedAt: string
  car?: string | null
  track?: string | null
  crew?: PitwallCrewMember[] | null
  strategy?: PitwallStrategySnapshot | null
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

/**
 * Un permesso vale solo se concesso, per la coppia attesa e non scaduto:
 * un "solo per questa volta" oltre la scadenza vale come una revoca.
 */
export function isPitwallGrantUsable(
  grant: PitwallGrant | null | undefined,
  driverUid: string,
  engineerUid: string,
  nowMs: number = Date.now()
): boolean {
  return Boolean(grant)
    && grant!.status === 'granted'
    && grant!.driverUid === driverUid
    && grant!.engineerUid === engineerUid
    && (grant!.expiresAtMs == null || grant!.expiresAtMs > nowMs)
}

/** Come si racconta la portata di un permesso, senza gergo. */
export function describePitwallGrantScope(grant: Pick<PitwallGrant, 'scope' | 'expiresAtMs'> | null | undefined): string {
  if (!grant) return ''
  if (grant.scope === 'once' && grant.expiresAtMs != null) {
    return `solo per oggi (scade alle ${new Date(grant.expiresAtMs).toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })})`
  }
  if (grant.scope === 'once') return 'solo per oggi'
  return 'sempre'
}

/** Tetto dell'equipaggio pubblicato in presenza: come la EntryList di ACC. */
export const PITWALL_MAX_SESSION_CREW = 16

/** Limita l'equipaggio alle forme che le regole Firestore accettano. */
export function boundPitwallCrew(crew: unknown): PitwallCrewMember[] | null {
  if (!Array.isArray(crew) || !crew.length) return null
  return crew.slice(0, PITWALL_MAX_SESSION_CREW).map((member, index) => {
    const entry = member as { driverIndex?: unknown, name?: unknown, current?: unknown }
    return {
      driverIndex: Number.isInteger(entry?.driverIndex) ? entry.driverIndex as number : index,
      name: String(entry?.name ?? '').slice(0, 60),
      current: entry?.current === true,
    }
  })
}

/** Limita la fotografia della strategia e le da' la sua data. */
export function boundPitwallStrategy(strategy: unknown, nowIso: string): PitwallStrategySnapshot | null {
  if (!strategy || typeof strategy !== 'object') return null
  const source = strategy as {
    fuelToAdd?: unknown
    tyreSet?: unknown
    pressures?: Record<string, unknown> | null
    compound?: unknown
  }
  const wheels = ['FL', 'FR', 'RL', 'RR'] as const
  // `Number(null)` vale 0: un valore assente non deve diventare un numero.
  const finiteOrNull = (value: unknown): number | null => (
    value != null && Number.isFinite(Number(value)) ? Number(value) : null
  )
  const pressures = source.pressures && typeof source.pressures === 'object'
    ? Object.fromEntries(wheels
        .filter(wheel => finiteOrNull(source.pressures?.[wheel]) != null)
        .map(wheel => [wheel, Number(source.pressures?.[wheel])]))
    : null
  return {
    fuelToAdd: finiteOrNull(source.fuelToAdd),
    tyreSet: finiteOrNull(source.tyreSet),
    pressures: pressures && Object.keys(pressures).length === wheels.length
      ? pressures as PitwallStrategySnapshot['pressures']
      : null,
    compound: source.compound === 'dry' || source.compound === 'wet' ? source.compound : null,
    updatedAt: nowIso,
  }
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
  note: string | null = null,
  requestedScope: PitwallGrantScope | null = null
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
      ...(requestedScope == null ? {} : { requestedScope }),
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

/**
 * Traduce un errore di rete o di permessi in una frase utile.
 *
 * Un ingegnere durante una gara non deve leggere "Missing or insufficient
 * permissions": deve capire cosa fare. Il messaggio originale resta nei log,
 * qui si dice la cosa che serve.
 */
export function describePitwallLinkError(raw: string | null | undefined): string | null {
  if (!raw) return null
  const message = String(raw)
  if (/insufficient permissions|permission-denied/i.test(message)) {
    return 'Permesso negato: il pilota non ti ha autorizzato, oppure le regole di sicurezza non sono aggiornate.'
  }
  if (/unavailable|network|offline|failed to get document because the client is offline/i.test(message)) {
    return 'Non raggiungibile adesso: controlla la connessione e riprova.'
  }
  if (/not-found/i.test(message)) {
    return 'Questo collegamento non esiste piu.'
  }
  if (/quota|resource-exhausted/i.test(message)) {
    return 'Limite del servizio raggiunto: riprova fra poco.'
  }
  return message
}

/** Lunghezza minima per cercare: sotto, il risultato sarebbe mezzo elenco. */
export const PITWALL_SEARCH_MIN_CHARS = 2

/**
 * Varianti di maiuscole con cui cercare un soprannome.
 *
 * Firestore confronta le stringhe byte per byte: un prefisso `ri` non trova
 * mai `RICO117`. Non esiste un campo normalizzato sui profili pubblici, e non
 * si possono riscrivere i documenti altrui per crearlo, quindi si cerca il
 * termine in poche forme plausibili e si uniscono i risultati.
 *
 * Restituisce prefissi distinti, in ordine stabile: stesso termine, stesse
 * query, quindi stesso costo.
 */
export function pitwallSearchVariants(term: string): string[] {
  const needle = term.trim()
  if (needle.length < PITWALL_SEARCH_MIN_CHARS) return []
  const lower = needle.toLowerCase()
  const upper = needle.toUpperCase()
  const capitalised = lower.charAt(0).toUpperCase() + lower.slice(1)
  return [...new Set([needle, lower, upper, capitalised])]
}

/** Un risultato vale se il soprannome inizia col termine, ignorando le maiuscole. */
export function matchesPitwallSearch(nickname: string, term: string): boolean {
  return nickname.toLowerCase().startsWith(term.trim().toLowerCase())
}
