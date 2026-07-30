import { describe, expect, it } from 'vitest'
import {
  CLIENT_HEARTBEAT_INTERVAL_MS,
  buildClientHeartbeatPayload,
  getClientHeartbeatStatus,
  normalizeSuiteVersionInfo,
  shouldSendClientHeartbeat
} from '~/services/monitoring/clientHeartbeatService'

describe('clientHeartbeatService', () => {
  it('costruisce il payload canonico da current.json normalizzato', () => {
    const payload = buildClientHeartbeatPayload({
      suite: '0.4.0-dev.2',
      baseVersion: '0.4.0',
      channel: 'develop',
      candidateRevision: 2,
      launcher: '0.4.0-dev.2',
      logger: '0.4.0-dev.1',
      webapp: '0.4.0-dev.2',
      kokoroRuntime: '1.0.0',
      updateState: 'pending',
      lastCheckAt: '2026-07-17T10:00:00Z'
    }, '2026-07-17T10:05:00Z', {
      identity: {
        installationId: '11111111-1111-4111-8111-111111111111',
        createdAt: '2026-07-01T08:00:00Z',
        fallback: false
      },
      runtimeState: {
        phase: 'ready',
        capabilities: {},
        events: [],
        migrationProgress: {
          phase: 'completed',
          progress: 100,
          status: 'healthy'
        }
      }
    })

    expect(payload).toMatchObject({
      suiteVersion: '0.4.0-dev.2',
      clientRuntime: {
        schemaVersion: 2,
        installationId: '11111111-1111-4111-8111-111111111111',
        channel: 'develop',
        updateState: 'pending',
        lastHeartbeatAt: '2026-07-17T10:05:00Z',
        components: {
          launcher: '0.4.0-dev.2',
          logger: '0.4.0-dev.1',
          webapp: '0.4.0-dev.2',
          kokoroRuntime: '1.0.0'
        }
      },
      installationRuntime: {
        schemaVersion: 2,
        installationId: '11111111-1111-4111-8111-111111111111',
        startedAt: '2026-07-01T08:00:00Z',
        lastContactAt: '2026-07-17T10:05:00Z',
        health: { status: 'healthy', phase: 'ready' },
        migration: { status: 'healthy', phase: 'completed', progress: 100 }
      }
    })
  })

  it('non pubblica un falso report senza identita persistente', () => {
    expect(buildClientHeartbeatPayload(
      { suite: '0.4.0' },
      '2026-07-17T10:05:00Z',
      { identity: { installationId: null, createdAt: null, fallback: true } }
    )).toBeNull()
  })

  it('supporta il bridge legacy privo del campo suite', () => {
    expect(normalizeSuiteVersionInfo({
      launcher: '0.3.5',
      webapp: '0.3.5'
    })).toMatchObject({
      suite: '0.3.5',
      updateState: 'current'
    })
  })

  it('invia subito, poi rispetta il rate limit', () => {
    const now = Date.parse('2026-07-17T10:30:00Z')
    expect(shouldSendClientHeartbeat(null, now)).toBe(true)
    expect(shouldSendClientHeartbeat('2026-07-17T10:20:00Z', now)).toBe(false)
    expect(shouldSendClientHeartbeat(
      new Date(now - CLIENT_HEARTBEAT_INTERVAL_MS).toISOString(),
      now
    )).toBe(true)
  })

  it('classifica client recente, non recente e sconosciuto', () => {
    const now = Date.parse('2026-07-17T12:00:00Z')
    expect(getClientHeartbeatStatus('2026-07-17T11:01:00Z', now)).toBe('recent')
    expect(getClientHeartbeatStatus('2026-07-17T10:59:59Z', now)).toBe('stale')
    expect(getClientHeartbeatStatus(undefined, now)).toBe('unknown')
  })
})
