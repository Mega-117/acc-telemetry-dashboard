export interface PitwallDiagnosticContext {
  attemptId?: string
  roomId?: string
  uid?: string
  peerUid?: string
  targetUid?: string
  connectionId?: string
  targetConnectionId?: string
  reason?: string | null
}

/** Correlation only: no strategy payload, nickname, credentials or telemetry. */
export function emitPitwallDiagnostic(event: string, context: PitwallDiagnosticContext = {}) {
  const { reason, ...ids } = context
  console.info('[PITWALL_DIAGNOSTIC] ' + JSON.stringify({
    ...ids, event, attemptId: context.attemptId ?? crypto.randomUUID(),
    at: new Date().toISOString(), ...(reason ? { reason: reason.slice(0, 500) } : {}),
  }))
}
