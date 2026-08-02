export const ITALIAN_TIME_ZONE = 'Europe/Rome'

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




export function filterAndPaginateDiagnostics<T extends {
  component: string
  severity: string
  occurredAt: string
}>(
  events: T[],
  filters: {
    component?: string
    severity?: string
    startIso: string
    endExclusiveIso: string
  },
  pageNumber: number,
  pageSize: number
): { items: T[]; total: number } {
  const filtered = events
    .filter(event => event.occurredAt >= filters.startIso && event.occurredAt < filters.endExclusiveIso)
    .filter(event => !filters.component || event.component === filters.component)
    .filter(event => !filters.severity || event.severity === filters.severity)
    .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
  const offset = Math.max(0, pageNumber - 1) * pageSize
  return {
    items: filtered.slice(offset, offset + pageSize),
    total: filtered.length
  }
}
