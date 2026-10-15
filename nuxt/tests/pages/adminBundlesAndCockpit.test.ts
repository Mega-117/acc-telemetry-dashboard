// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { flushPromises, mount } from '@vue/test-utils'
import { ref } from 'vue'

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  download: vi.fn(),
  snapshot: vi.fn()
}))

vi.mock('~/composables/useFirebaseAuth', () => ({
  useFirebaseAuth: () => ({ currentUser: ref({ uid: 'admin', getIdToken: async () => 'tok' }) })
}))
vi.mock('~/repositories/diagnosticBundlesRepository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/repositories/diagnosticBundlesRepository')>()),
  listDiagnosticBundles: mocks.list,
  downloadDiagnosticBundle: mocks.download
}))
vi.mock('~/repositories/adminCockpitRepository', async (importOriginal) => ({
  ...(await importOriginal<typeof import('~/repositories/adminCockpitRepository')>()),
  loadAdminCockpitSnapshot: mocks.snapshot
}))

import BundlesPage from '~/pages/admin/diagnostic-bundles.vue'
import CockpitPage from '~/pages/admin/cockpit.vue'

beforeEach(() => {
  vi.stubGlobal('definePageMeta', vi.fn())
  vi.stubGlobal('useHead', vi.fn())
  vi.clearAllMocks()
})
afterEach(() => vi.unstubAllGlobals())

const item = (over: Record<string, unknown> = {}) => ({
  key: 'diag/11111111-2222/2026-10-15/daily-20261015T095554-028d6d83.jsonl.gz',
  installationId: '11111111-2222', date: '2026-10-15', kind: 'daily', bundleId: 'daily-20261015T095554-028d6d83',
  size: 2048, uploadedAt: '2026-10-15T09:55:56Z', uploaderUid: 'u', ...over
})

describe('admin diagnostic bundles page', () => {
  it('lists bundles, labels the kind in Italian and filters by installation on click', async () => {
    mocks.list.mockResolvedValue({ items: [item(), item({ key: 'k2', kind: 'anomaly', size: 5 }),
      item({ key: 'k3', kind: 'capture', size: 5 }), item({ key: 'k4', kind: 'shutdown', size: 5 }),
      item({ key: 'k5', kind: 'future-kind', size: 5 })], cursor: null })
    const view = mount(BundlesPage, { global: { stubs: { NuxtLink: true } } })
    await flushPromises()
    const kinds = view.findAll('.kind').map((cell) => cell.text())
    expect(kinds).toEqual(['giornaliero', 'anomalia', 'cattura', 'chiusura', 'future-kind'])
    expect(view.text()).toContain('2.0 KB')
    expect(view.text()).toContain('5 pacchetti')
    await view.get('button.link-button').trigger('click')
    await flushPromises()
    expect(mocks.list).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ installationId: '11111111-2222' }))
  })

  it('shows the readable error for a non-admin and an empty state', async () => {
    mocks.list.mockRejectedValueOnce(new Error('Questo account non è autorizzato a leggere i pacchetti.'))
    const view = mount(BundlesPage, { global: { stubs: { NuxtLink: true } } })
    await flushPromises()
    expect(view.get('[role="alert"]').text()).toContain('non è autorizzato')
    mocks.list.mockResolvedValueOnce({ items: [], cursor: null })
    await view.findAll('button').find((b) => b.text().includes('Aggiorna'))!.trigger('click')
    await flushPromises()
    expect(view.text()).toContain('Nessun pacchetto')
  })

  it('offers "Carica altri" only with a cursor and appends the next page', async () => {
    mocks.list.mockResolvedValueOnce({ items: [item()], cursor: 'c1' })
    const view = mount(BundlesPage, { global: { stubs: { NuxtLink: true } } })
    await flushPromises()
    mocks.list.mockResolvedValueOnce({ items: [item({ key: 'k3' })], cursor: null })
    await view.findAll('button').find((b) => b.text() === 'Carica altri')!.trigger('click')
    await flushPromises()
    expect(view.findAll('tbody tr')).toHaveLength(2)
    expect(view.text()).not.toContain('Carica altri')
  })
})

describe('admin cockpit scope', () => {
  const NOW = Date.now()
  const installation = (ownerUid: string, version: string, ageDays: number) => ({
    ownerUid, installationId: `${ownerUid}-i`, installationRegisteredAt: null, lastSuiteLaunchAt: null, lastDashboardOpenedAt: null,
    lastContactAt: new Date(NOW - ageDays * 86_400_000).toISOString(), suiteVersion: version, channel: 'develop',
    updateState: 'current', lastCheckAt: null, components: { launcher: null, logger: null, webapp: null, kokoroRuntime: null },
    health: { status: 'healthy', phase: 'ready', reasonCode: null }, migration: { status: 'ok', phase: 'done', progress: 100, code: null, resumedFrom: null }
  })
  const row = (inst: ReturnType<typeof installation>) => ({
    rowId: inst.installationId, pilot: { uid: inst.ownerUid, nickname: inst.ownerUid, role: 'pilot' }, installation: inst,
    installationCount: 1, directoryAvailable: true
  })

  it('counts only real, active (7 d), latest-version installations and hides tests by default', async () => {
    const rows = [
      row(installation('real-a', '0.4.5-dev.3', 1)),
      row(installation('real-b', '0.4.4-dev.1', 2)),
      row(installation('real-c', '0.4.9-dev.9', 30)),
      row(installation('9pRwnLZ3ciZwl4X5eQ5vjKUHy6z2', '0.9.0-dev.1', 0))
    ]
    mocks.snapshot.mockResolvedValue({ rows, pilotCount: 4, installationCount: 4, attentionCount: 0, coverageLimited: false,
      directoryLimitReached: false, installationLimitReached: false, budget: { readRequests: 2, maxDocuments: 300, writes: 0 } })
    const view = mount(CockpitPage, { global: { stubs: { AdminCockpitTable: { props: ['rows'], template: '<div class="rows">{{ rows.length }}</div>' } } } })
    await flushPromises()
    expect(view.get('.metric--primary strong').text()).toBe('1')
    expect(view.get('.rows').text()).toBe('1')
    expect(view.text()).toContain('1 di prova escluse')

    const boxes = view.findAll('.scope-toggles input')
    for (const box of boxes) await box.setValue(false)
    await flushPromises()
    expect(view.get('.rows').text()).toBe('4')
  })

  it('warns that zero attention is not proof of health when in-scope installations have not reported recently', async () => {
    const quiet = installation('real-a', '0.4.5-dev.3', 1)
    const fresh = { ...installation('real-b', '0.4.5-dev.3', 0), lastContactAt: new Date(NOW - 60_000).toISOString() }
    mocks.snapshot.mockResolvedValue({ rows: [row(quiet), row(fresh)], pilotCount: 2, installationCount: 2, attentionCount: 0,
      coverageLimited: false, directoryLimitReached: false, installationLimitReached: false,
      budget: { readRequests: 2, maxDocuments: 300, writes: 0 } })
    const view = mount(CockpitPage, { global: { stubs: { AdminCockpitTable: true } } })
    await flushPromises()
    expect(view.get('.metric-caveat').text()).toContain('1 senza contatto nelle ultime 2 ore')

    mocks.snapshot.mockResolvedValue({ rows: [row(fresh)], pilotCount: 1, installationCount: 1, attentionCount: 0,
      coverageLimited: false, directoryLimitReached: false, installationLimitReached: false,
      budget: { readRequests: 2, maxDocuments: 300, writes: 0 } })
    const allFresh = mount(CockpitPage, { global: { stubs: { AdminCockpitTable: true } } })
    await flushPromises()
    expect(allFresh.find('.metric-caveat').exists()).toBe(false)
  })
})
