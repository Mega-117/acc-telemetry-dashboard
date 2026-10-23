// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { ref } from 'vue'

const mocks = vi.hoisted(() => ({
  recent: vi.fn(),
  save: vi.fn(),
  snapshot: vi.fn(),
  diagnostics: vi.fn(),
}))

vi.mock('~/composables/useFirebaseAuth', () => ({
  useFirebaseAuth: () => ({ currentUser: ref({ uid: 'admin', getIdToken: async () => 'tok' }) })
}))
vi.mock('~/repositories/diagnosticBundlesRepository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/repositories/diagnosticBundlesRepository')>()),
  listRecentDiagnosticBundles: mocks.recent,
  saveDiagnosticBundle: mocks.save,
}))
vi.mock('~/repositories/adminCockpitRepository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/repositories/adminCockpitRepository')>()),
  loadAdminCockpitSnapshot: mocks.snapshot,
}))
vi.mock('~/repositories/clientDiagnosticsRepository', () => ({
  loadClientDiagnosticsPage: mocks.diagnostics,
}))

import StatusPage from '~/pages/admin/stato.vue'

const NOW = Date.now()
const ago = (h: number) => new Date(NOW - h * 3_600_000).toISOString()
const installation = (ownerUid: string, id: string) => ({
  ownerUid, installationId: id, installationRegisteredAt: null, lastSuiteLaunchAt: null, lastDashboardOpenedAt: null,
  lastContactAt: ago(1), suiteVersion: '0.4.9-dev.15', channel: 'develop', updateState: 'current', lastCheckAt: null,
  components: { launcher: null, logger: null, webapp: null, kokoroRuntime: null },
  health: { status: 'healthy', phase: 'ready', reasonCode: null },
  migration: { status: 'completed', phase: 'done', progress: 100, code: null, resumedFrom: null },
})
const snapshotWith = (...installations: ReturnType<typeof installation>[]) => ({
  rows: installations.map((inst) => ({ rowId: inst.installationId, installation: inst, installationCount: 1, directoryAvailable: true,
    pilot: { uid: inst.ownerUid, nickname: inst.ownerUid === 'pilot-a' ? 'Mario' : '', firstName: 'Luca', lastName: 'Bianchi', role: 'pilot' } })),
  pilotCount: installations.length, installationCount: installations.length, attentionCount: 0, coverageLimited: false,
  directoryLimitReached: false, installationLimitReached: false, budget: { readRequests: 2, maxDocuments: 300, writes: 0 },
})
const bundle = (over: Record<string, unknown> = {}) => ({
  key: 'diag/inst-a/2026-10-16/anomaly-20261016T100000-00000001.jsonl.gz', installationId: 'inst-a', date: '2026-10-16',
  kind: 'anomaly', bundleId: 'anomaly-20261016T100000-00000001', size: 10, uploadedAt: ago(2), uploaderUid: 'pilot-a',
  trigger: 'app.unclean-exit', os: 'Windows 10 (19045)', ...over,
})

beforeEach(() => {
  vi.stubGlobal('definePageMeta', vi.fn())
  vi.stubGlobal('useHead', vi.fn())
  vi.stubGlobal('useRuntimeConfig', () => ({ public: { diagnosticsIngestUrl: '' } }))
  vi.clearAllMocks()
  mocks.snapshot.mockResolvedValue(snapshotWith(installation('pilot-a', 'inst-a'), installation('pilot-b', 'inst-b')))
  mocks.recent.mockResolvedValue({ items: [], complete: true })
  mocks.diagnostics.mockResolvedValue({ events: [], nextCursor: null, estimate: {} })
})
afterEach(() => vi.unstubAllGlobals())

const mountPage = () => mount(StatusPage, { global: { stubs: { NuxtLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } } } })

describe('admin status page (PIP-540)', () => {
  it('green light and a plain sentence when nothing happened', async () => {
    const view = mountPage()
    await flushPromises()
    expect(view.get('.verdict').classes()).toContain('verdict--ok')
    expect(view.get('.verdict strong').text()).toBe('Tutto ok')
    expect(view.text()).toContain('Nessun problema negli ultimi 7 giorni')
    expect(view.text()).toContain('2 installazioni attive non mandano ancora pacchetti')
  })

  it('red light with the problem in words, who, Windows, and a download button', async () => {
    mocks.recent.mockResolvedValue({ items: [bundle(), bundle({ key: 'k2', installationId: 'inst-b', uploaderUid: 'pilot-b', trigger: 'incident.main-stall', os: 'Windows 11 (26200)' })], complete: true })
    const view = mountPage()
    await flushPromises()
    expect(view.get('.verdict').classes()).toContain('verdict--problem')
    expect(view.get('.verdict strong').text()).toBe('C’è un problema')
    expect(view.text()).toContain('Windows 10: 1 · Windows 11: 1')
    const [first, second] = view.findAll('.issue')
    expect(first!.text()).toContain("L'app si è chiusa di colpo")
    expect(first!.text()).toContain('Mario · Windows 10 (19045) · 1 volta')
    expect(second!.text()).toContain('Luca Bianchi')
    await first!.get('button').trigger('click')
    await flushPromises()
    expect(mocks.save).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ installationId: 'inst-a' }))
  })

  it('yellow light for errors, linking to Diagnostica', async () => {
    mocks.diagnostics.mockResolvedValue({ events: [
      { userId: 'pilot-a', pilotNickname: 'Mario', code: 'hud.stale', severity: 'error', receivedAt: ago(1) },
      { userId: 'pilot-a', code: 'just.warning', severity: 'warning', receivedAt: ago(1) },
    ], nextCursor: null, estimate: {} })
    const view = mountPage()
    await flushPromises()
    expect(view.get('.verdict').classes()).toContain('verdict--warn')
    expect(view.get('.verdict strong').text()).toBe('Una cosa da guardare')
    expect(view.get('.issue a').attributes('href')).toBe('/admin-diagnostics')
  })

  it('PIP-591: asks the server for errors and fatals only, and a full page is not "Tutto ok"', async () => {
    mocks.diagnostics.mockImplementation(async ({ filters }: any) => ({
      events: [], nextCursor: filters.severity === 'error' ? { receivedAtMs: 1, path: 'p' } : null, estimate: {},
    }))
    const view = mountPage()
    await flushPromises()
    expect(mocks.diagnostics.mock.calls.map(([options]: any) => options.filters.severity).sort()).toEqual(['error', 'fatal'])
    expect(view.get('.verdict').classes()).toContain('verdict--warn')
    expect(view.text()).toContain('Molti errori: ho letto solo i più recenti')
    expect(view.text()).not.toContain('Nessun problema negli ultimi')
  })

  it('PIP-591: installations beyond the read limit are not "Tutto ok"', async () => {
    mocks.snapshot.mockResolvedValue({ ...snapshotWith(installation('pilot-a', 'inst-a')), coverageLimited: true })
    const view = mountPage()
    await flushPromises()
    expect(view.get('.verdict strong').text()).toBe('Nessun problema nei dati letti, ma sono incompleti')
    expect(view.text()).toContain('Molte installazioni: ne ho lette solo una parte')
  })

  it('says which source could not be read and still shows the rest', async () => {
    mocks.recent.mockRejectedValue(new Error('Failed to fetch'))
    mocks.diagnostics.mockRejectedValue(new Error('quota'))
    const view = mountPage()
    await flushPromises()
    expect(view.get('[role="alert"]').text()).toContain('pacchetti diagnostici, errori segnalati')
    // PIP-591: con una fonte mancante non si dice "Tutto ok".
    expect(view.get('.verdict').classes()).toContain('verdict--warn')
    expect(view.get('.verdict strong').text()).toBe('Nessun problema nei dati letti, ma sono incompleti')
  })

  it('test accounts are hidden behind a toggle and a failed download is explained', async () => {
    mocks.recent.mockResolvedValue({ items: [bundle({ uploaderUid: '9pRwnLZ3ciZwl4X5eQ5vjKUHy6z2' })], complete: false })
    mocks.save.mockRejectedValue(new Error('Sessione scaduta: accedi di nuovo.'))
    const view = mountPage()
    await flushPromises()
    expect(view.get('.verdict strong').text()).toBe('Nessun problema nei dati letti, ma sono incompleti')
    expect(view.text()).toContain('ho letto solo i primi 2000')
    expect(view.findAll('.issue')).toHaveLength(0)
    await view.get('.tests__toggle').trigger('click')
    expect(view.findAll('.issue')).toHaveLength(1)
    await view.get('.issue button').trigger('click')
    await flushPromises()
    expect(view.text()).toContain('Sessione scaduta')
  })
})
