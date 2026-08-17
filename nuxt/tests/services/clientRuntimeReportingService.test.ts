import { describe, expect, it, vi } from 'vitest'
import {
  CLIENT_RUNTIME_REPORT_READ_BUDGET,
  CLIENT_RUNTIME_REPORT_WRITE_BUDGET,
  writeClientRuntimeReport
} from '~/services/monitoring/clientRuntimeReportingService'
import type { ClientHeartbeatPayload } from '~/services/monitoring/clientHeartbeatService'

function payload(installationId: string): ClientHeartbeatPayload {
  const lastContactAt = '2026-07-30T19:00:00.000Z'
  return {
    suiteVersion: '0.4.0-dev.4',
    suiteVersionDetail: { suite: '0.4.0-dev.4', channel: 'develop' },
    suiteVersionUpdatedAt: lastContactAt,
    clientRuntime: {
      schemaVersion: 2,
      installationId,
      suiteVersion: '0.4.0-dev.4',
      channel: 'develop',
      updateState: 'current',
      lastHeartbeatAt: lastContactAt,
      lastCheckAt: null,
      components: { launcher: null, logger: null, webapp: null, kokoroRuntime: null }
    },
    installationRuntime: {
      schemaVersion: 2,
      installationId,
      startedAt: '2026-07-30T18:00:00.000Z',
      lastSuiteLaunchAt: '2026-07-30T18:45:00.000Z',
      lastDashboardOpenedAt: '2026-07-30T18:50:00.000Z',
      lastContactAt,
      suiteVersion: '0.4.0-dev.4',
      channel: 'develop',
      updateState: 'current',
      lastCheckAt: null,
      components: { launcher: null, logger: null, webapp: null, kokoroRuntime: null },
      health: { status: 'healthy', phase: 'ready', reasonCode: null },
      migration: { status: 'healthy', phase: 'completed', progress: 100, code: null, resumedFrom: null }
    }
  }
}

describe('clientRuntimeReportingService', () => {
  it('scrive una fonte per-installazione e due adapter con budget 3 write/0 read', async () => {
    const paths: string[] = []
    const set = vi.fn()
    const commit = vi.fn(async () => undefined)

    const result = await writeClientRuntimeReport({
      db: {},
      uid: 'pilot-1',
      payload: payload('install-a'),
      docFn: (_db, path) => {
        paths.push(path)
        return path
      },
      writeBatchFn: () => ({ set, commit })
    })

    expect(result).toEqual({
      writes: CLIENT_RUNTIME_REPORT_WRITE_BUDGET,
      reads: CLIENT_RUNTIME_REPORT_READ_BUDGET
    })
    expect(set).toHaveBeenCalledTimes(3)
    expect(commit).toHaveBeenCalledTimes(1)
    expect(set.mock.calls[0]?.[1]).toMatchObject({
      startedAt: '2026-07-30T18:00:00.000Z',
      lastSuiteLaunchAt: '2026-07-30T18:45:00.000Z',
      lastDashboardOpenedAt: '2026-07-30T18:50:00.000Z',
      lastContactAt: '2026-07-30T19:00:00.000Z'
    })
    expect(paths).toEqual([
      'users/pilot-1/runtimeInstallations/install-a',
      'users/pilot-1',
      'pilotDirectory/pilot-1'
    ])
  })

  it('non tocca una installazione sibling quando cambia il writer', async () => {
    const documents = new Map<string, unknown>()
    const writeBatchFn = vi.fn(() => {
      const pending: Array<[unknown, unknown]> = []
      return {
        set: (ref: unknown, data: unknown) => pending.push([ref, data]),
        commit: async () => {
          for (const [ref, data] of pending) documents.set(String(ref), data)
        }
      }
    })
    const common = {
      db: {},
      uid: 'pilot-1',
      docFn: (_db: unknown, path: string) => path,
      writeBatchFn
    }

    await writeClientRuntimeReport({ ...common, payload: payload('install-a') })
    await writeClientRuntimeReport({ ...common, payload: payload('install-b') })
    await writeClientRuntimeReport({ ...common, payload: payload('install-a') })

    expect(documents.has('users/pilot-1/runtimeInstallations/install-a')).toBe(true)
    expect(documents.has('users/pilot-1/runtimeInstallations/install-b')).toBe(true)
  })

  it('mantiene atomiche e coerenti le tre proiezioni', async () => {
    const set = vi.fn()
    const commit = vi.fn(async () => { throw new Error('batch denied') })

    await expect(writeClientRuntimeReport({
      db: {},
      uid: 'pilot-1',
      payload: payload('install-a'),
      docFn: (_db, path) => path,
      writeBatchFn: () => ({ set, commit })
    })).rejects.toThrow('batch denied')

    expect(set).toHaveBeenCalledTimes(3)
    expect(commit).toHaveBeenCalledTimes(1)
    const installation = set.mock.calls[0]?.[1]
    const user = set.mock.calls[1]?.[1]
    const directory = set.mock.calls[2]?.[1]
    expect(installation.lastContactAt).toBe(user.clientRuntime.lastHeartbeatAt)
    expect(directory.clientLastHeartbeatAt).toBe(user.clientRuntime.lastHeartbeatAt)
    expect(directory.suiteVersion).toBe(user.suiteVersion)
  })
})
