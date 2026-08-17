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

export interface ClientDiagnosticUpload {
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
  suiteVersion: string | null
  channel: string | null
}

export interface ClientDiagnosticDocument extends ClientDiagnosticUpload {
  receivedAt: string
}

export interface DiagnosticOutboxFlushInput {
  events: LocalClientDiagnostic[]
  uid: string
  suite: DiagnosticSuiteContext | null
  isUploaded: (eventId: string) => Promise<boolean>
  upload: (payload: ClientDiagnosticUpload) => Promise<void>
  acknowledge: (eventId: string) => Promise<unknown>
  isCurrent?: () => boolean
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
  let text = String(value || '')
  for (let attempt = 0; attempt < 2; attempt += 1) {
    let decoded = text
    try {
      decoded = decodeURIComponent(text)
    } catch {
      decoded = text
        .replace(/%5c/gi, '\\')
        .replace(/%2f/gi, '/')
        .replace(/%20/gi, ' ')
    }
    if (decoded === text) break
    text = decoded
  }
  return text
    .replace(/((?:https?|file):\/\/[^\s?#]+)\?[^\s#]*/gi, '$1?<redacted>')
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, '<email>')
    .replace(/\b(api[_-]?key|authorization|bearer|token|password|secret)\b(\s*[:=]\s*|\s+)[^\s,;]+/gi, '$1=<redacted>')
    .replace(/(?:file:\/+)?\b[a-z]:[\\/][^\r\n"'<>|?&)\]]*/gi, '<path>')
    .replace(/\\\\[^\\/\s]+[\\/][^\r\n"'<>|?&)\]]*/gi, '<path>')
    .replace(/\/(?:users|home)\/[^/\s]+(?:\/[^\r\n"'<>?&)\]]*)?/gi, '<path>')
    .replace(/(<path>)\?[^\s#]*/g, '$1?<redacted>')
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
  const suppliedFingerprint = String(input.fingerprint || '')
    .replace(/[^a-zA-Z0-9_-]/g, '')
    .slice(0, 64)
  const fingerprint = suppliedFingerprint || buildDiagnosticFingerprint(component, code, message)
  const suppliedEventId = String(input.eventId || '')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 80)
  const eventId = suppliedEventId
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
    occurredAt: sanitizeDiagnosticText(input.occurredAt || new Date().toISOString(), 40)
  }
}

export function buildDiagnosticDocument(
  input: LocalClientDiagnostic,
  userId: string,
  suite: DiagnosticSuiteContext | null
): ClientDiagnosticUpload {
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
  const assertCurrent = () => {
    if (input.isCurrent && !input.isCurrent()) {
      throw new Error('cloud_owner_lease_stale')
    }
  }

  for (const event of input.events) {
    assertCurrent()
    const payload = buildDiagnosticDocument(event, input.uid, input.suite)
    const exists = await input.isUploaded(payload.eventId)
    assertCurrent()

    if (exists) {
      alreadyUploaded += 1
    } else {
      await input.upload(payload)
      assertCurrent()
      uploaded += 1
    }

    // Acknowledge each durable event immediately. If a later upload fails,
    // earlier events never remain stuck in the local outbox.
    assertCurrent()
    await input.acknowledge(payload.eventId)
    assertCurrent()
    acknowledged += 1
  }

  return { uploaded, acknowledged, alreadyUploaded }
}
