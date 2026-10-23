import { describe, expect, it } from 'vitest'
import { buildStatusSummary, osFamily } from '~/utils/adminStatusSummary'

const NOW = Date.parse('2026-10-16T12:00:00Z')
const hoursAgo = (h: number) => new Date(NOW - h * 3_600_000).toISOString()
const TEST_UID = '9pRwnLZ3ciZwl4X5eQ5vjKUHy6z2'

const installation = (ownerUid: string, id: string, over: Record<string, unknown> = {}) => ({
  ownerUid, installationId: id, installationRegisteredAt: null, lastSuiteLaunchAt: null, lastDashboardOpenedAt: null,
  lastContactAt: hoursAgo(1), suiteVersion: '0.4.9-dev.15', channel: 'develop', updateState: 'current', lastCheckAt: null,
  components: { launcher: null, logger: null, webapp: null, kokoroRuntime: null },
  health: { status: 'healthy', phase: 'ready', reasonCode: null },
  migration: { status: 'completed', phase: 'done', progress: 100, code: null, resumedFrom: null },
  ...over,
})
const bundle = (installationId: string, over: Record<string, unknown> = {}) => ({
  key: `diag/${installationId}/2026-10-16/anomaly-20261016T100000-0000000${Math.floor(Math.random() * 9)}.jsonl.gz`,
  installationId, date: '2026-10-16', kind: 'anomaly', bundleId: 'anomaly-20261016T100000-00000001',
  size: 10, uploadedAt: hoursAgo(2), uploaderUid: 'pilot-a', trigger: null, os: null, ...over,
})
const run = (over: Partial<Parameters<typeof buildStatusSummary>[0]> = {}) => buildStatusSummary({
  installations: [], bundles: [], errors: [], names: { 'pilot-a': 'Mario' }, nowMs: NOW, ...over,
})

describe('admin status summary (PIP-540)', () => {
  it('is green with nothing to report', () => {
    const summary = run({ installations: [installation('pilot-a', 'inst-a')] as any })
    expect(summary.level).toBe('ok')
    expect(summary.issues).toEqual([])
  })

  it('a crash or an unclean exit is red, a stall is yellow, and they read in plain Italian', () => {
    const summary = run({
      bundles: [
        bundle('inst-a', { trigger: 'incident.main-stall', uploadedAt: hoursAgo(1), os: 'Windows 10 (19045)' }),
        bundle('inst-a', { trigger: 'app.unclean-exit', uploadedAt: hoursAgo(3) }),
      ] as any,
    })
    expect(summary.level).toBe('problem')
    expect(summary.issues.map((issue) => [issue.level, issue.title])).toEqual([
      ['problem', "L'app si è chiusa di colpo"],
      ['warn', "L'app si è bloccata per qualche secondo"],
    ])
    expect(summary.issues[0]).toMatchObject({ who: 'Mario', os: 'Windows 10 (19045)', count: 1 })
    expect(summary.issues[0]!.bundle?.installationId).toBe('inst-a')
  })

  it('groups repeats per installation, keeps the latest bundle and counts them', () => {
    const summary = run({
      bundles: [
        bundle('inst-a', { key: 'old', trigger: 'incident.main-stall', uploadedAt: hoursAgo(5) }),
        bundle('inst-a', { key: 'new', trigger: 'incident.main-stall', uploadedAt: hoursAgo(1) }),
        bundle('inst-a', { key: 'mid', trigger: 'incident.main-stall', uploadedAt: hoursAgo(3) }),
      ] as any,
    })
    expect(summary.level).toBe('warn')
    expect(summary.issues).toHaveLength(1)
    expect(summary.issues[0]).toMatchObject({ count: 3, lastAt: hoursAgo(1) })
    expect(summary.issues[0]!.bundle?.key).toBe('new')
  })

  it('old bundles without a reason, normal captures, daily bundles and old dates', () => {
    const summary = run({
      bundles: [
        bundle('inst-a'),
        bundle('inst-b', { kind: 'capture', trigger: 'capture.closed' }),
        bundle('inst-b', { kind: 'capture', trigger: 'capture.fallback' }),
        bundle('inst-c', { kind: 'daily' }),
        bundle('inst-d', { trigger: 'app.unclean-exit', uploadedAt: hoursAgo(24 * 9) }),
      ] as any,
    })
    expect(summary.issues.map((issue) => issue.title).sort()).toEqual([
      'Anomalia registrata', 'Cattura di ACC: usato un metodo di riserva',
    ])
  })

  it('PIP-567: an anomaly with a reason the panel does not know yet stays visible, with that reason', () => {
    const summary = run({
      bundles: [
        bundle('inst-a', { trigger: 'dev.forced' }),
        bundle('inst-b', { trigger: 'incident.brand-new-trigger', uploadedAt: hoursAgo(1) }),
        bundle('inst-c', { kind: 'capture', trigger: 'capture.something-new' }),
      ] as any,
    })
    expect(summary.level).toBe('warn')
    expect(summary.issues.map((issue) => [issue.title, issue.detail])).toEqual([
      ['Anomalia registrata', 'Motivo: incident.brand-new-trigger.'],
      ['Anomalia registrata', 'Motivo: dev.forced.'],
    ])
  })

  it('installation reports: data move stuck is red, failed or pending update and degraded start are yellow', () => {
    const summary = run({
      installations: [
        installation('pilot-a', 'stuck', { health: { status: 'degraded', phase: 'degraded', reasonCode: 'migration_progress' } }),
        installation('pilot-b', 'update', { health: { status: 'degraded', phase: 'degraded', reasonCode: 'update_failed_current_runtime_continues' } }),
        installation('pilot-c', 'other', { health: { status: 'degraded', phase: 'degraded', reasonCode: 'disk_full' } }),
        installation('pilot-d', 'pending', { updateState: 'pending' }),
        installation('pilot-e', 'gone', { lastContactAt: hoursAgo(24 * 20), health: { status: 'degraded', phase: 'degraded', reasonCode: 'x' } }),
        installation('pilot-f', 'migrated', { migration: { status: 'failed', phase: 'x', progress: 0, code: null, resumedFrom: null } }),
      ] as any,
    })
    expect(summary.issues.map((issue) => [issue.level, issue.title, issue.who])).toEqual([
      ['problem', 'Spostamento dei dati fermo a metà', 'Mario'],
      ['warn', 'Aggiornamento non riuscito', 'Installazione update'],
      ['warn', "L'app è partita con problemi", 'Installazione other'],
      ['warn', 'Aggiornamento in sospeso', 'Installazione pending'],
    ])
    expect(summary.issues[2]!.detail).toContain('disk_full')
  })

  it('reported errors: fatal is red, grouped per user and code', () => {
    const summary = run({
      errors: [
        { userId: 'pilot-a', code: 'hud.stale', severity: 'error', receivedAt: hoursAgo(1) },
        { userId: 'pilot-a', code: 'hud.stale', severity: 'error', receivedAt: hoursAgo(2) },
        { userId: 'pilot-b', pilotNickname: 'Luca', code: undefined, severity: 'fatal', receivedAt: hoursAgo(1) },
        { userId: 'pilot-c', code: 'x', severity: 'error', receivedAt: hoursAgo(24 * 10) },
      ],
      names: { 'pilot-a': 'Mario', 'pilot-b': 'Luca' },
    })
    expect(summary.issues.map((issue) => [issue.level, issue.title, issue.count])).toEqual([
      ['problem', 'Errore grave segnalato: senza codice', 1],
      ['warn', 'Errore segnalato: hud.stale', 2],
    ])
  })

  it('test accounts are listed apart and never colour the light', () => {
    const summary = run({
      bundles: [bundle('inst-t', { uploaderUid: TEST_UID, trigger: 'app.unclean-exit' })] as any,
    })
    expect(summary.level).toBe('ok')
    expect(summary.testIssues).toHaveLength(1)
    expect(summary.testIssues[0]!.who).toBe('Installazione inst-t')
  })

  it('PIP-591: on a shared installation a real pilot anomaly is not hidden among the test accounts', () => {
    const summary = run({
      bundles: [
        bundle('inst-shared', { uploaderUid: TEST_UID, trigger: 'app.unclean-exit', uploadedAt: hoursAgo(3) }),
        bundle('inst-shared', { uploaderUid: 'pilot-a', trigger: 'app.unclean-exit', uploadedAt: hoursAgo(2) }),
      ] as any,
    })
    expect(summary.level).toBe('problem')
    expect(summary.issues).toHaveLength(1)
    expect(summary.issues[0]!.who).toBe('Mario')
    expect(summary.testIssues).toHaveLength(1)
  })

  it('counts Windows versions and who sends bundles among real active installations', () => {
    const summary = run({
      installations: [
        installation('pilot-a', 'inst-a'), installation('pilot-b', 'inst-b'), installation('pilot-c', 'inst-c'),
        installation(TEST_UID, 'inst-t'),
      ] as any,
      bundles: [
        bundle('inst-a', { kind: 'daily', os: 'Windows 10 (19045)', uploadedAt: hoursAgo(1) }),
        bundle('inst-a', { kind: 'daily', os: 'Windows 11 (22631)', uploadedAt: hoursAgo(30) }),
        bundle('inst-b', { kind: 'daily', os: 'Windows 11 (26200)' }),
        bundle('inst-t', { kind: 'daily', os: 'Windows 10 (19045)' }),
      ] as any,
    })
    expect(summary.windows).toEqual({ windows10: 1, windows11: 1, other: 0 })
    expect(summary.reporting).toEqual({ active: 3, sendingBundles: 2 })
  })

  it('osFamily reads the label written by the desktop app', () => {
    expect(osFamily('Windows 10 (19045)')).toBe('windows10')
    expect(osFamily('Windows 11 (26200)')).toBe('windows11')
    expect(osFamily('Windows 6.3.9600')).toBe('other')
    expect(osFamily(null)).toBe('other')
  })
})
