// PIP-435: coda solo-sviluppo verso il journal locale Electron `firebase_ops.jsonl`.
// Il tracker Firestore, il meter RTDB, le cache e il router chiamano soltanto
// `recordFirebaseJournalEvent`: qui si aggiungono pagina e ora, si impacchetta e si
// invia al main. Nella build di produzione `import.meta.dev` e' falso e la coda non
// parte mai; il main, pacchettizzato, non ascolta nemmeno il canale.

export type FirebaseJournalKind = 'op' | 'nav' | 'cache' | 'auth' | 'session'

export interface FirebaseJournalEvent {
  kind: FirebaseJournalKind
  type?: string
  db?: 'firestore' | 'rtdb'
  caller?: string
  path?: string
  from?: string
  scenario?: string
  cache?: string
  transport?: string
  error?: string
  reason?: string
  reads?: number
  writes?: number
  deletes?: number
  docs?: number
  bytes?: number
  durationMs?: number
  attempts?: number
  ageMs?: number
  fromCache?: boolean
  pending?: boolean
  signedIn?: boolean
}

type Sender = (batch: Array<FirebaseJournalEvent & { at: number, route?: string }>) => void

const FLUSH_DELAY_MS = 2_000
const FLUSH_SIZE = 100
const MAX_QUEUE = 2_000

let configured: { enabled: boolean, send: Sender | null } | null = null
let queue: Array<FirebaseJournalEvent & { at: number, route?: string }> = []
let timer: ReturnType<typeof setTimeout> | null = null
let currentRoute = ''
let pagehideBound = false

function resolveSender(): Sender | null {
  if (!import.meta.dev || typeof window === 'undefined') return null
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- bridge Electron opzionale
  const record = (window as any).electronAPI?.recordFirebaseOps
  return typeof record === 'function' ? (batch) => record(batch) : null
}

function state() {
  if (!configured) {
    const send = resolveSender()
    configured = { enabled: send !== null, send }
  }
  return configured
}

/** Test e bootstrap: forza abilitazione e destinazione. */
export function configureFirebaseOpsJournal(options: { enabled: boolean, send: Sender | null } | null) {
  configured = options
  queue = []
  if (timer) clearTimeout(timer)
  timer = null
  currentRoute = ''
}

export function isFirebaseOpsJournalEnabled() {
  return state().enabled
}

export function setFirebaseJournalRoute(route: string) {
  currentRoute = route
}

export function flushFirebaseOpsJournal() {
  if (timer) clearTimeout(timer)
  timer = null
  const { send } = state()
  if (!send || !queue.length) return
  const batch = queue
  queue = []
  try { send(batch) } catch { /* la diagnostica non deve mai toccare l'app */ }
}

export function recordFirebaseJournalEvent(event: FirebaseJournalEvent) {
  if (!state().enabled) return
  if (queue.length >= MAX_QUEUE) queue.shift()
  queue.push({ ...event, at: Date.now(), route: currentRoute || undefined })
  if (!pagehideBound && typeof window !== 'undefined') {
    pagehideBound = true
    window.addEventListener('pagehide', flushFirebaseOpsJournal)
  }
  if (queue.length >= FLUSH_SIZE) flushFirebaseOpsJournal()
  else if (!timer) timer = setTimeout(flushFirebaseOpsJournal, FLUSH_DELAY_MS)
}

/** Registra un dato servito da una cache davanti a Firebase: nessuna chiamata di rete. */
export function recordFirebaseCacheHit(cache: string, ageMs?: number) {
  recordFirebaseJournalEvent({ kind: 'cache', cache, reason: 'hit', ageMs })
}

/** Voce presente ma scaduta: la lettura che segue nel journal e' dovuta al TTL. */
export function recordFirebaseCacheExpired(cache: string, ageMs?: number) {
  recordFirebaseJournalEvent({ kind: 'cache', cache, reason: 'expired', ageMs })
}

/** Esito di una cache a TTL: registra hit o scadenza e dice se il valore e' valido. */
export function checkFirebaseCacheFreshness(cache: string, cachedAt: number | undefined, ttlMs: number) {
  if (cachedAt === undefined) return false
  const ageMs = Date.now() - cachedAt
  if (ageMs <= ttlMs) { recordFirebaseCacheHit(cache, ageMs); return true }
  recordFirebaseCacheExpired(cache, ageMs)
  return false
}

/** Pagina come schema di rotta (`/piloti/:id`), mai l'identificativo reale. */
export function routePatternForJournal(route: { path: string, matched?: Array<{ path: string }> }) {
  const pattern = route.matched?.length ? route.matched[route.matched.length - 1]?.path : undefined
  return (pattern || route.path || '/').slice(0, 120)
}

/**
 * Percorso RTDB senza identificativi: restano solo nomi di nodo brevi e alfabetici,
 * con al massimo un suffisso di versione (rooms, members, pitwallV3); UID, push ID,
 * UUID e chiavi con cifre interne diventano `*`.
 */
export function bucketRealtimePath(path: string) {
  return path.split('/').filter(Boolean)
    .map(segment => (/^[A-Za-z_.]{1,19}\d{0,2}$/.test(segment) ? segment : '*'))
    .join('/') || 'root'
}
