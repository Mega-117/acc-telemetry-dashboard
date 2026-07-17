import { describe, expect, it } from 'vitest'
import {
  buildDiagnosticDocument,
  buildDiagnosticFingerprint,
  createLocalDiagnostic,
  sanitizeDiagnosticText,
  shouldCaptureDiagnostic
} from '~/services/monitoring/clientDiagnosticsService'

describe('clientDiagnosticsService', () => {
  it('sanitizza email, token e path Windows', () => {
    const safe = sanitizeDiagnosticText(
      'test@example.com token=abc C:\\Users\\Enrico\\secret.txt'
    )
    expect(safe).not.toContain('test@example.com')
    expect(safe).not.toContain('token=abc')
    expect(safe).not.toContain('Enrico')
  })

  it('stabilizza il fingerprint ignorando numeri variabili', () => {
    expect(buildDiagnosticFingerprint('launcher', 'update', 'errore 123'))
      .toBe(buildDiagnosticFingerprint('launcher', 'update', 'errore 456'))
  })

  it('costruisce il documento Firebase canonico', () => {
    const document = buildDiagnosticDocument({
      eventId: 'evt-1',
      component: 'electron',
      severity: 'fatal',
      code: 'uncaught',
      message: 'boom',
      occurredAt: '2026-07-17T10:00:00Z'
    }, 'user-1', {
      suite: '0.4.0-dev.1',
      channel: 'develop'
    }, '2026-07-17T10:01:00Z')

    expect(document).toMatchObject({
      schemaVersion: 1,
      eventId: 'evt-1',
      userId: 'user-1',
      suiteVersion: '0.4.0-dev.1',
      channel: 'develop'
    })
  })

  it('deduplica entro la finestra e accetta dopo la scadenza', () => {
    expect(shouldCaptureDiagnostic(undefined, 10_000)).toBe(true)
    expect(shouldCaptureDiagnostic(9_000, 10_000, 5_000)).toBe(false)
    expect(shouldCaptureDiagnostic(5_000, 10_000, 5_000)).toBe(true)
  })

  it('normalizza severità e contesto', () => {
    expect(createLocalDiagnostic({
      severity: 'invalid' as any,
      context: { password: 'secret', retries: 2 }
    })).toMatchObject({
      severity: 'error',
      context: { password: '<redacted>', retries: 2 }
    })
  })
})
