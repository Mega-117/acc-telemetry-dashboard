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
    }, '2026-07-17T10:05:00Z')

    expect(payload).toMatchObject({
      suiteVersion: '0.4.0-dev.2',
      clientRuntime: {
        schemaVersion: 1,
        channel: 'develop',
        updateState: 'pending',
        lastHeartbeatAt: '2026-07-17T10:05:00Z',
        components: {
          launcher: '0.4.0-dev.2',
          logger: '0.4.0-dev.1',
          webapp: '0.4.0-dev.2',
          kokoroRuntime: '1.0.0'
        }
      }
    })
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
    expect(getClientHeartbeatStatus('2026-07-17T11:00:00Z', now)).toBe('recent')
    expect(getClientHeartbeatStatus('2026-07-15T11:00:00Z', now)).toBe('stale')
    expect(getClientHeartbeatStatus(undefined, now)).toBe('unknown')
  })
})
