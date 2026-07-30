import { describe, expect, it, vi } from 'vitest'
import {
  ADMIN_COCKPIT_DIRECTORY_LIMIT,
  ADMIN_COCKPIT_INSTALLATION_LIMIT,
  buildAdminCockpitSnapshot,
  loadAdminCockpitSnapshot,
  mapAdminCockpitInstallation,
} from '~/repositories/adminCockpitRepository'

function pilotDoc(uid: string, nickname: string) {
  return {
    id: uid,
    data: () => ({
      uid,
      nickname,
      role: 'pilot',
      directorySortName: nickname.toLowerCase(),
    }),
  }
}

function installationDoc(uid: string, installationId: string, overrides: Record<string, unknown> = {}) {
  return {
    id: installationId,
    ref: { parent: { parent: { id: uid } } },
    data: () => ({
      schemaVersion: 2,
      installationId,
      startedAt: '2026-07-30T18:00:00.000Z',
      lastContactAt: '2026-07-30T19:00:00.000Z',
      suiteVersion: '0.4.0-dev.4',
      channel: 'develop',
      updateState: 'current',
      lastCheckAt: null,
      components: {
        launcher: '0.4.0-dev.4',
        logger: null,
        webapp: '0.4.0-dev.4',
        kokoroRuntime: null,
      },
      health: { status: 'healthy', phase: 'ready', reasonCode: null },
      migration: { status: 'healthy', phase: 'completed', progress: 100, code: null, resumedFrom: null },
      ...overrides,
    }),
  }
}

describe('adminCockpitRepository', () => {
  it('mappa il contratto V2 e ricava il proprietario dal path Firestore', () => {
    const installation = mapAdminCockpitInstallation(installationDoc('pilot-1', 'install-a'))

    expect(installation).toMatchObject({
      ownerUid: 'pilot-1',
      installationId: 'install-a',
      suiteVersion: '0.4.0-dev.4',
      health: { status: 'healthy', phase: 'ready' },
      migration: { status: 'healthy', progress: 100 },
    })
  })

  it('rende leggibili multi-installazione, profili senza report e directory parziale', () => {
    const installations = [
      mapAdminCockpitInstallation(installationDoc('pilot-1', 'install-a'))!,
      mapAdminCockpitInstallation(installationDoc('pilot-1', 'install-b', {
        updateState: 'pending',
        health: { status: 'degraded', phase: 'sync', reasonCode: 'cloud_unavailable' },
      }))!,
      mapAdminCockpitInstallation(installationDoc('pilot-outside', 'install-c'))!,
    ]
    const snapshot = buildAdminCockpitSnapshot([
      { uid: 'pilot-1', nickname: 'Mario', role: 'pilot' },
      { uid: 'pilot-2', nickname: 'Luigi', role: 'pilot' },
    ], installations, { directoryLimitReached: true })

    expect(snapshot.rows.filter((row) => row.pilot.uid === 'pilot-1')).toHaveLength(2)
    expect(snapshot.rows.find((row) => row.pilot.uid === 'pilot-1')?.installationCount).toBe(2)
    expect(snapshot.rows.find((row) => row.pilot.uid === 'pilot-2')?.installation).toBeNull()
    expect(snapshot.rows.find((row) => row.pilot.uid === 'pilot-outside')?.directoryAvailable).toBe(false)
    expect(snapshot.attentionCount).toBe(1)
    expect(snapshot.coverageLimited).toBe(true)
    expect(snapshot.budget).toEqual({ readRequests: 2, maxDocuments: 300, writes: 0 })
  })

  it('carica due sole query bounded senza listener o scritture', async () => {
    const loadDirectory = vi.fn(async () => ({ docs: [pilotDoc('pilot-1', 'Mario')] }))
    const loadInstallations = vi.fn(async () => ({ docs: [installationDoc('pilot-1', 'install-a')] }))

    const snapshot = await loadAdminCockpitSnapshot({ loadDirectory, loadInstallations })

    expect(loadDirectory).toHaveBeenCalledTimes(1)
    expect(loadInstallations).toHaveBeenCalledTimes(1)
    expect(snapshot.pilotCount).toBe(1)
    expect(snapshot.installationCount).toBe(1)
    expect(snapshot.budget.readRequests).toBe(2)
    expect(snapshot.budget.writes).toBe(0)
  })

  it('segnala copertura bounded quando una query raggiunge il proprio limite', async () => {
    const directoryDocs = Array.from(
      { length: ADMIN_COCKPIT_DIRECTORY_LIMIT },
      (_, index) => pilotDoc(`pilot-${index}`, `Pilot ${index}`),
    )
    const installationDocs = Array.from(
      { length: ADMIN_COCKPIT_INSTALLATION_LIMIT },
      (_, index) => installationDoc(`pilot-${index}`, `install-${index}`),
    )

    const snapshot = await loadAdminCockpitSnapshot({
      loadDirectory: async () => ({ docs: directoryDocs }),
      loadInstallations: async () => ({ docs: installationDocs }),
    })

    expect(snapshot.directoryLimitReached).toBe(true)
    expect(snapshot.installationLimitReached).toBe(true)
    expect(snapshot.coverageLimited).toBe(true)
  })
})
