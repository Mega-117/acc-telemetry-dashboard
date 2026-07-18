export const CLIENT_DIAGNOSTIC_SCHEMA_VERSION = 1
export const CLIENT_DIAGNOSTIC_FLUSH_INTERVAL_MS = 60 * 1000
export const CLIENT_DIAGNOSTIC_DEDUP_WINDOW_MS = 5 * 60 * 1000

const MAX_MESSAGE_CHARS = 2000
const MAX_STACK_CHARS = 8000

export type ClientDiagnosticSeverity = 'warning' | 'error' | 'fatal'

export interface LocalClientDiagnostic {
  schemaVersion?: number
  eventId?: string
  fingerprint?: string
  component?: string
  severity?: ClientDiagnosticSeverity
  code?: string
  message?: string
  stack?: string
  context?: Record<string, unknown>
  occurredAt?: string
}

export interface DiagnosticSuiteContext {
  suite?: string | null
  channel?: string | null
}

export interface ClientDiagnosticDocument {
  schemaVersion: number
  eventId: string
  fingerprint: string
  userId: string
  component: string
  severity: ClientDiagnosticSeverity
  code: string
  message: string
  stack: string
  context: Record<string, string | number | boolean | null>
  occurredAt: string
  receivedAt: string
  suiteVersion: string | null
  channel: string | null
}

export interface DiagnosticOutboxFlushInput {
  events: LocalClientDiagnostic[]
  uid: string
  suite: DiagnosticSuiteContext | null
  isUploaded: (eventId: string) => Promise<boolean>
  upload: (payload: ClientDiagnosticDocument) => Promise<void>
  acknowledge: (eventId: string) => Promise<unknown>
}

export interface DiagnosticOutboxFlushResult {
  uploaded: number
  acknowledged: number
  alreadyUploaded: number
}

function stableHash(value: string): string {
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function sanitizeDiagnosticText(value: unknown, limit = MAX_MESSAGE_CHARS): string {
  return String(value || '')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '<email>')
    .replace(/\b(api[_-]?key|authorization|bearer|token|password|secret)\b(\s*[:=]\s*|\s+)[^\s,;]+/gi, '$1=<redacted>')
    .replace(/([a-z]:\\users\\)[^\\\s]+/gi, '$1<user>')
    .replace(/\b[a-z]:\\(?:[^\\\r\n:*?"<>|]+\\)*[^\\\r\n:*?"<>|]*/gi, '<path>')
    .slice(0, limit)
}

export function sanitizeDiagnosticContext(
  context: Record<string, unknown> | null | undefined
): Record<string, string | number | boolean | null> {
  if (!context) return {}
  return Object.fromEntries(
    Object.entries(context)
      .slice(0, 12)
      .map(([key, value]) => {
        const safeKey = key.replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 64)
        if (/(password|secret|token|authorization|api[_-]?key)/i.test(safeKey)) {
          return [safeKey, '<redacted>']
        }
        if (value === null || typeof value === 'boolean' || typeof value === 'number') {
          return [safeKey, value]
        }
        return [safeKey, sanitizeDiagnosticText(value, 500)]
      })
  )
}

export function buildDiagnosticFingerprint(component: string, code: string, message: string): string {
  const stableMessage = sanitizeDiagnosticText(message).toLowerCase().replace(/\b\d+\b/g, '#')
  return stableHash(`${component}|${code}|${stableMessage}`)
}

export function createLocalDiagnostic(input: LocalClientDiagnostic): Required<LocalClientDiagnostic> {
  const component = String(input.component || 'frontend')
    .toLowerCase()
    .replace(/[^a-z0-9_.-]/g, '_')
    .slice(0, 48)
  const code = String(input.code || 'unknown')
    .replace(/[^a-zA-Z0-9_.-]/g, '_')
    .slice(0, 80)
  const message = sanitizeDiagnosticText(input.message)
  const fingerprint = input.fingerprint || buildDiagnosticFingerprint(component, code, message)
  const eventId = input.eventId
    || `${Date.now().toString(36)}-${fingerprint}-${Math.random().toString(36).slice(2, 8)}`

  return {
    schemaVersion: CLIENT_DIAGNOSTIC_SCHEMA_VERSION,
    eventId,
    fingerprint,
    component,
    severity: ['warning', 'error', 'fatal'].includes(String(input.severity))
      ? input.severity as ClientDiagnosticSeverity
      : 'error',
    code,
    message,
    stack: sanitizeDiagnosticText(input.stack, MAX_STACK_CHARS),
    context: sanitizeDiagnosticContext(input.context),
    occurredAt: input.occurredAt || new Date().toISOString()
  }
}

export function buildDiagnosticDocument(
  input: LocalClientDiagnostic,
  userId: string,
  suite: DiagnosticSuiteContext | null,
  receivedAt = new Date().toISOString()
): ClientDiagnosticDocument {
  const event = createLocalDiagnostic(input)
  return {
    schemaVersion: CLIENT_DIAGNOSTIC_SCHEMA_VERSION,
    eventId: event.eventId,
    fingerprint: event.fingerprint,
    userId,
    component: event.component,
    severity: event.severity,
    code: event.code,
    message: event.message,
    stack: event.stack,
    context: event.context as Record<string, string | number | boolean | null>,
    occurredAt: event.occurredAt,
    receivedAt,
    suiteVersion: suite?.suite || null,
    channel: suite?.channel || null
  }
}

export function shouldCaptureDiagnostic(
  lastCapturedAt: number | null | undefined,
  nowMs = Date.now(),
  windowMs = CLIENT_DIAGNOSTIC_DEDUP_WINDOW_MS
): boolean {
  return lastCapturedAt === null
    || lastCapturedAt === undefined
    || nowMs - lastCapturedAt >= windowMs
}

export async function flushDiagnosticOutbox(
  input: DiagnosticOutboxFlushInput
): Promise<DiagnosticOutboxFlushResult> {
  let uploaded = 0
  let acknowledged = 0
  let alreadyUploaded = 0

  for (const event of input.events) {
    const payload = buildDiagnosticDocument(event, input.uid, input.suite)
    const exists = await input.isUploaded(payload.eventId)

    if (exists) {
      alreadyUploaded += 1
    } else {
      await input.upload(payload)
      uploaded += 1
    }

    // Acknowledge each durable event immediately. If a later upload fails,
    // earlier events never remain stuck in the local outbox.
    await input.acknowledge(payload.eventId)
    acknowledged += 1
  }

  return { uploaded, acknowledged, alreadyUploaded }
}
