import { sanitizeDiagnosticText } from '~/services/monitoring/clientDiagnosticsService'

export const ITALIAN_TIME_ZONE = 'Europe/Rome'

export function windowOpeningDiagnosticExplanation(code: string): string | null {
  const descriptions: Record<string, string> = {
    show_failed: 'Electron ha ricevuto la richiesta, ma l’operazione di apertura ha generato un errore.',
    window_missing: 'La richiesta è arrivata a Electron, ma la finestra non esiste.',
    window_hidden: 'La finestra risulta nascosta o minimizzata dopo la richiesta.',
    window_offscreen: 'La finestra non interseca nessuno dei monitor rilevati.',
    page_load_failed: 'Il caricamento della pagina principale è fallito. Consultare il codice di errore.',
    loading_timeout: 'La pagina è ancora in caricamento dopo 30 secondi. Non è una diagnosi di guasto GPU.',
    app_no_response: 'Il frontend supporta la verifica ma non ha risposto entro il controllo previsto.',
    renderer_gone: 'Il processo della pagina è terminato. Consultare motivo e codice di uscita.',
    renderer_unresponsive: 'Electron ha segnalato che la finestra non risponde.',
    gpu_process_gone: 'Il processo GPU è terminato; questo evento da solo non dimostra la causa della finestra invisibile.',
    inspection_failed: 'Il controllo dello stato della finestra non è riuscito.',
  }
  return code.startsWith('window_open_') ? descriptions[code.slice('window_open_'.length)] || null : null
}

export function diagnosticOccurrenceCount(event: { context?: Record<string, unknown> }): number {
  const context = event.context || {}
  return context._aggVersion === 1 && Number.isSafeInteger(context._aggCount) && Number(context._aggCount) > 0
    ? Number(context._aggCount) : 1
}

export function diagnosticOccurrences(event: { context?: Record<string, unknown>, occurredAt: string }): string {
  const context = event.context || {}
  if (context._aggVersion !== 1 || diagnosticOccurrenceCount(event) !== context._aggCount) return '1 occorrenza'
  const first = String(context._aggFirst || event.occurredAt)
  const last = String(context._aggLast || event.occurredAt)
  return `${context._aggCount} ${context._aggCount === 1 ? 'occorrenza' : 'occorrenze'} · ${formatItalianDiagnosticDate(first)} – ${formatItalianDiagnosticDate(last)}`
}

export type DiagnosticPeriodPreset = 'today' | '7d' | '30d' | 'custom'
export type DiagnosticsViewState = 'loading' | 'refreshing' | 'error' | 'empty' | 'ready'
export type PaginationToken = number | 'ellipsis'

export interface DiagnosticDateRange {
  startIso: string
  endExclusiveIso: string
}

function datePartsInTimeZone(date: Date, timeZone = ITALIAN_TIME_ZONE) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(date)
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]))
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
    second: Number(values.second)
  }
}

function zonedMidnightToUtc(dateValue: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateValue)
  if (!match) throw new Error('Data non valida.')
  const desired = {
    year: Number(match[1]),
    month: Number(match[2]),
    day: Number(match[3])
  }
  let instant = Date.UTC(desired.year, desired.month - 1, desired.day)

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const observed = datePartsInTimeZone(new Date(instant))
    const observedAsUtc = Date.UTC(
      observed.year,
      observed.month - 1,
      observed.day,
      observed.hour,
      observed.minute,
      observed.second
    )
    const desiredAsUtc = Date.UTC(desired.year, desired.month - 1, desired.day)
    instant += desiredAsUtc - observedAsUtc
  }

  return new Date(instant)
}

function isoCalendarDate(date: Date): string {
  const parts = datePartsInTimeZone(date)
  return `${parts.year}-${String(parts.month).padStart(2, '0')}-${String(parts.day).padStart(2, '0')}`
}

function addCalendarDays(dateValue: string, days: number): string {
  const [year = 1970, month = 1, day = 1] = dateValue.split('-').map(Number)
  const shifted = new Date(Date.UTC(year, month - 1, day + days))
  return shifted.toISOString().slice(0, 10)
}

export function buildDiagnosticDateRange(
  preset: DiagnosticPeriodPreset,
  customStart = '',
  customEnd = '',
  now = new Date()
): DiagnosticDateRange | null {
  const today = isoCalendarDate(now)
  let startDate = today
  let endDate = today

  if (preset === '7d') startDate = addCalendarDays(today, -6)
  if (preset === '30d') startDate = addCalendarDays(today, -29)
  if (preset === 'custom') {
    if (!customStart || !customEnd || customStart > customEnd) return null
    startDate = customStart
    endDate = customEnd
  }

  return {
    startIso: zonedMidnightToUtc(startDate).toISOString(),
    endExclusiveIso: zonedMidnightToUtc(addCalendarDays(endDate, 1)).toISOString()
  }
}

export function formatItalianDiagnosticDate(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return value
  return date.toLocaleString('it-IT', {
    timeZone: ITALIAN_TIME_ZONE,
    dateStyle: 'short',
    timeStyle: 'medium'
  })
}

export function resolveDiagnosticNickname(userId: unknown, nickname: unknown): string {
  if (typeof userId !== 'string' || !userId.trim()) return 'Sistema'
  if (typeof nickname === 'string' && nickname.trim()) return nickname.trim()
  return 'Utente non disponibile'
}

export interface DiagnosticRecapEvent {
  userId?: unknown
  pilotNickname?: unknown
  context?: Record<string, unknown>
  component?: string
  code?: string
  message?: string
  stack?: string
  suiteVersion?: string | null
}

export function diagnosticUsers(events: readonly DiagnosticRecapEvent[]) {
  const users = new Map<string, { id: string, nickname: string, count: number }>()
  for (const event of events) {
    const id = typeof event.userId === 'string' ? event.userId.trim() : ''
    if (!id) continue
    const user = users.get(id) || { id, nickname: resolveDiagnosticNickname(id, event.pilotNickname), count: 0 }
    user.count += diagnosticOccurrenceCount(event)
    users.set(id, user)
  }
  return [...users.values()]
}

export function diagnosticErrorGroups<T extends DiagnosticRecapEvent>(events: readonly T[]) {
  const groups = new Map<string, { key: string, sample: T, message: string, events: T[], count: number, unknownCount: number }>()
  for (const event of events) {
    const message = sanitizeDiagnosticText(event.message)
    // Keep call sites, not machine paths/line numbers: legacy sanitizers left
    // different path suffixes for the same failure. Distinct functions stay distinct.
    const stack = sanitizeDiagnosticText(event.stack, 8000).split('\n')
      .map(line => line.trim().replace(/\s+\(.*\)$/, '')).join('\n')
    // Conservative presentation grouping: do not merge different functions or versions.
    // Cloud fingerprints can differ across producers and are not a global error identity.
    const key = JSON.stringify([event.component || '', event.code || '', message,
      stack, event.suiteVersion || ''])
    const group = groups.get(key) || { key, sample: event, message, events: [], count: 0, unknownCount: 0 }
    const count = diagnosticOccurrenceCount(event)
    group.events.push(event)
    group.count += count
    if (typeof event.userId !== 'string' || !event.userId.trim()) group.unknownCount += count
    groups.set(key, group)
  }
  return [...groups.values()].map(({ events: rows, ...group }) => ({ ...group, users: diagnosticUsers(rows) }))
    .sort((a, b) => b.count - a.count)
}

export function diagnosticsViewState(params: {
  pending: boolean
  hasEvents: boolean
  hasError: boolean
}): DiagnosticsViewState {
  if (params.pending && !params.hasEvents) return 'loading'
  if (params.hasError && !params.hasEvents) return 'error'
  if (params.pending) return 'refreshing'
  if (!params.hasEvents) return 'empty'
  return 'ready'
}

export function paginationTokens(currentPage: number, totalPages: number): PaginationToken[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, index) => index + 1)
  const pages = new Set([1, totalPages, currentPage - 1, currentPage, currentPage + 1])
  const validPages = [...pages].filter(page => page >= 1 && page <= totalPages).sort((a, b) => a - b)
  const tokens: PaginationToken[] = []

  validPages.forEach((page, index) => {
    const previousPage = validPages[index - 1]
    if (previousPage !== undefined && page - previousPage > 1) tokens.push('ellipsis')
    tokens.push(page)
  })
  return tokens
}
