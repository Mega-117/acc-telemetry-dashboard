import { describe, expect, it } from 'vitest'
import { buildClientHeartbeatPayload, isRuntimeReportDue, runtimeReportSignature } from '~/services/monitoring/clientHeartbeatService'
const now = Date.parse('2026-09-27T12:00:00Z')
function payload(launch = '2026-09-27T11:00:00Z', version = '0.4.6') {
  return buildClientHeartbeatPayload({ suite: version }, new Date(now).toISOString(), {
    identity: { installationId: 'qa', createdAt: '2026-01-01', lastSuiteLaunchAt: launch }
  })!
}
describe('runtime report receipts', () => {
  it('does not repeat on reload or dashboard opening, but sends on new launch or version', () => {
    const p = payload()
    const receipt = { ...runtimeReportSignature(p), sentAt: now }
    p.installationRuntime.lastDashboardOpenedAt = new Date(now + 1).toISOString()
    expect(isRuntimeReportDue(JSON.parse(JSON.stringify(receipt)), p, now + 100)).toBe(false)
    expect(isRuntimeReportDue(receipt, payload('2026-09-27T12:00:01Z'), now + 1000)).toBe(true)
    expect(isRuntimeReportDue(receipt, payload(undefined, '0.4.7'), now + 1000)).toBe(true)
    expect(isRuntimeReportDue(receipt, p, now + 3600000)).toBe(true)
  })
  it('handles component changes, clock rollback and coalesces health transitions', () => {
    const p = payload()
    const receipt = { ...runtimeReportSignature(p), sentAt: now }
    p.installationRuntime.health.status = 'degraded'
    expect(isRuntimeReportDue(receipt, p, now + 500)).toBe(false)
    expect(isRuntimeReportDue(receipt, p, now + 60000)).toBe(true)
    expect(isRuntimeReportDue(receipt, p, now - 1)).toBe(true)
    p.clientRuntime.components.logger = 'new'
    expect(isRuntimeReportDue(receipt, p, now + 1)).toBe(true)
    expect(isRuntimeReportDue(null, p, now)).toBe(true)
  })
  it('reports the settled startup immediately, without sending intermediate progress', () => {
    const p = payload()
    const receipt = { ...runtimeReportSignature(p), sentAt: now }
    p.installationRuntime.health.phase = 'migrating'
    expect(isRuntimeReportDue(receipt, p, now + 10)).toBe(false)
    p.installationRuntime.health.phase = 'ready'
    expect(isRuntimeReportDue(receipt, p, now + 20)).toBe(true)
    const settled = { ...runtimeReportSignature(p), sentAt: now + 20 }
    expect(isRuntimeReportDue(settled, p, now + 30)).toBe(false)
  })
})
