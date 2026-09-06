// @vitest-environment jsdom
import { flushPromises, mount } from '@vue/test-utils'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const repositoryMocks = vi.hoisted(() => ({
  countClientDiagnostics: vi.fn(),
  countExpiredClientDiagnostics: vi.fn(),
  deleteExpiredClientDiagnostics: vi.fn(),
  loadClientDiagnosticsPage: vi.fn()
}))

vi.hoisted(() => {
  Object.assign(globalThis, { definePageMeta: vi.fn() })
})

vi.mock('~/repositories/clientDiagnosticsRepository', async (importOriginal) => ({
  ...await importOriginal<typeof import('~/repositories/clientDiagnosticsRepository')>(),
  ...repositoryMocks
}))

import AdminDiagnosticsPage from '~/pages/admin-diagnostics.vue'
import {
  ClientDiagnosticsCleanupError,
  type ClientDiagnosticsCleanupResult
} from '~/repositories/clientDiagnosticsRepository'

const cleanupCursor = {
  receivedAtMs: Date.parse('2026-07-01T10:00:00.000Z'),
  path: 'users/qa-pilot/diagnostics/expired-200'
}

function cleanupResult(overrides: Partial<ClientDiagnosticsCleanupResult> = {}): ClientDiagnosticsCleanupResult {
  return {
    cutoffMs: Date.parse('2026-07-19T10:00:00.000Z'),
    deleted: 200,
    batches: 1,
    done: false,
    nextCursor: cleanupCursor,
    estimate: {
      estimatedReads: 200,
      estimatedWrites: 200,
      maxEstimatedReads: 1000,
      maxEstimatedWrites: 1000,
      assumptions: []
    },
    ...overrides
  }
}

async function mountReadyPage() {
  const wrapper = mount(AdminDiagnosticsPage)
  await flushPromises()
  return wrapper
}

async function openCleanupDialog(wrapper: ReturnType<typeof mount>) {
  await wrapper.get('[data-testid="prepare-cleanup"]').trigger('click')
  await flushPromises()
  expect(wrapper.find('[data-testid="cleanup-dialog"]').exists()).toBe(true)
}

describe('admin diagnostics cleanup flow', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    repositoryMocks.countClientDiagnostics.mockResolvedValue({
      total: 0,
      capped: false,
      estimate: { estimatedReads: 1, estimatedWrites: 0, maxEstimatedReads: 2, maxEstimatedWrites: 0, assumptions: [] }
    })
    repositoryMocks.loadClientDiagnosticsPage.mockResolvedValue({
      events: [],
      nextCursor: null,
      estimate: { estimatedReads: 50, estimatedWrites: 0, maxEstimatedReads: 50, maxEstimatedWrites: 0, assumptions: [] }
    })
    repositoryMocks.countExpiredClientDiagnostics.mockResolvedValue({
      total: 400,
      capped: false,
      estimate: { estimatedReads: 1, estimatedWrites: 0, maxEstimatedReads: 2, maxEstimatedWrites: 0, assumptions: [] }
    })
  })

  it('riassume tre nickname e gli altri senza richieste aggiuntive, aggiornandosi al refresh', async () => {
    const rows = Array.from({ length: 10 }, (_, i) => ({
      userId: `private-id-${i}`, pilotNickname: `Pilota ${i}`, eventId: `event-${i}`,
      occurredAt: '2026-09-06T09:00:00Z', component: 'frontend', severity: 'error',
      code: 'test', message: 'Errore sintetico', context: {}
    }))
    repositoryMocks.loadClientDiagnosticsPage.mockResolvedValueOnce({ events: [...rows, rows[0]], nextCursor: null })
    const wrapper = await mountReadyPage()
    const summary = wrapper.get('[aria-label="Utenti negli errori di questa pagina"]')
    expect(summary.text()).toContain('10 utenti con errori')
    expect(summary.findAll('.diagnostic-users__name')).toHaveLength(3)
    expect(summary.get('summary').text()).toBe('+7 altri')
    expect(summary.findAll('ul li')).toHaveLength(7)
    expect(summary.findAll('.diagnostic-users__name')[0]!.text()).toMatch(/Pilota 0\s*· 2 errori/)
    expect(summary.text()).not.toContain('private-id')
    await summary.get('summary').trigger('click')
    expect(repositoryMocks.loadClientDiagnosticsPage).toHaveBeenCalledTimes(1)
    expect(repositoryMocks.countClientDiagnostics).toHaveBeenCalledTimes(1)
    const refresh = wrapper.findAll('button').find(button => button.text() === 'Aggiorna')!
    await refresh.trigger('click')
    await flushPromises()
    expect(wrapper.get('[aria-label="Utenti negli errori di questa pagina"]').text()).toContain('0 utenti con errori')
    expect(wrapper.find('details').exists()).toBe(false)
    expect(repositoryMocks.loadClientDiagnosticsPage).toHaveBeenCalledTimes(2)
    wrapper.unmount()
  })

  it('recaps error types per user and opens loaded details without cloud calls', async () => {
    const base = { userId: 'a', pilotNickname: 'Rico', component: 'electron', severity: 'error',
      code: 'HUD', message: 'HUD failed', stack: 'at hud()', occurredAt: '2026-09-06T09:00:00Z' }
    repositoryMocks.loadClientDiagnosticsPage.mockResolvedValueOnce({ events: [
      { ...base, eventId: 'one', context: { _aggVersion: 1, _aggCount: 15000 } },
      { ...base, eventId: 'two' },
      { ...base, eventId: 'three', userId: 'b', pilotNickname: 'Nico' },
      ...Array.from({ length: 4 }, (_, i) => ({ ...base, eventId: `other-${i}`, code: `OTHER-${i}` }))
    ], nextCursor: null })
    const wrapper = await mountReadyPage()
    const recap = wrapper.get('[aria-label="Riepilogo errori di questa pagina"]')
    expect(recap.text()).toContain('5 tipi di errore')
    expect(recap.findAll('.diagnostic-recap__item')).toHaveLength(3)
    expect(recap.findAll('.diagnostic-recap__item')[0]!.text()).toContain('Rico: 15001 volte')
    expect(recap.findAll('.diagnostic-recap__item')[0]!.text()).toContain('Nico: 1 volta')
    await recap.get('.diagnostic-recap__toggle').trigger('click')
    expect(recap.findAll('.diagnostic-recap__item')).toHaveLength(5)
    await recap.findAll('.diagnostic-recap__open')[0]!.trigger('click')
    expect(wrapper.find('.detail-backdrop').exists()).toBe(true)
    expect(repositoryMocks.loadClientDiagnosticsPage).toHaveBeenCalledTimes(1)
    expect(repositoryMocks.countClientDiagnostics).toHaveBeenCalledTimes(1)
    expect(repositoryMocks.countExpiredClientDiagnostics).not.toHaveBeenCalled()
    expect(repositoryMocks.deleteExpiredClientDiagnostics).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it.each([0, 1, 3, 4])('limita correttamente anteprima e pluralizzazione con %s utenti', async (count) => {
    repositoryMocks.loadClientDiagnosticsPage.mockResolvedValueOnce({
      events: Array.from({ length: count }, (_, i) => ({userId: `id-${i}`, pilotNickname: `Nico ${i}`, eventId: `e-${i}`, occurredAt: '2026-09-06T09:00:00Z'})), nextCursor: null
    })
    const wrapper = await mountReadyPage()
    const summary = wrapper.get('[aria-label="Utenti negli errori di questa pagina"]')
    expect(summary.findAll('.diagnostic-users__name')).toHaveLength(Math.min(count, 3))
    expect(summary.text()).toContain(`${count} ${count === 1 ? 'utente' : 'utenti'} con errori`)
    expect(summary.find('details').exists()).toBe(count > 3)
    if (count === 4) expect(summary.get('summary').text()).toBe('+1 altro')
    wrapper.unmount()
  })

  it.each([
    ['failed-precondition', 'configurazione Firebase non ancora disponibile'],
    ['permission-denied', 'Accesso alla diagnostica negato'],
    ['resource-exhausted', 'Quota Firebase esaurita'],
    ['unavailable', 'Controlla la connessione']
  ])('distingue il fallimento %s da una lista vuota', async (code, message) => {
    repositoryMocks.loadClientDiagnosticsPage.mockRejectedValueOnce({ code })
    const wrapper = await mountReadyPage()
    expect(wrapper.text()).toContain(message)
    expect(wrapper.text()).not.toContain('Nessun errore nei filtri selezionati')
    expect(wrapper.find('[aria-label="Utenti negli errori di questa pagina"]').exists()).toBe(false)
    expect(repositoryMocks.deleteExpiredClientDiagnostics).not.toHaveBeenCalled()
    wrapper.unmount()
  })

  it('richiede conferma al momento dell’azione e annulla con zero write', async () => {
    const wrapper = await mountReadyPage()
    await openCleanupDialog(wrapper)

    expect(repositoryMocks.deleteExpiredClientDiagnostics).not.toHaveBeenCalled()
    await wrapper.get('[data-testid="cancel-cleanup"]').trigger('click')
    await flushPromises()

    expect(repositoryMocks.deleteExpiredClientDiagnostics).not.toHaveBeenCalled()
    expect(repositoryMocks.countClientDiagnostics).toHaveBeenCalledTimes(1)
    expect(wrapper.find('[data-testid="cleanup-dialog"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('mostra progresso bounded e ricarica righe e totale se si annulla dopo una mutazione parziale', async () => {
    repositoryMocks.deleteExpiredClientDiagnostics.mockImplementationOnce(async (options) => {
      const progress = cleanupResult()
      options.onProgress?.(progress)
      return progress
    })
    const wrapper = await mountReadyPage()
    await openCleanupDialog(wrapper)

    await wrapper.get('[data-testid="confirm-cleanup"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Progresso: 200 eliminati in 1 batch')
    expect(wrapper.get('[data-testid="confirm-cleanup"]').text()).toContain('Continua pulizia')

    await wrapper.get('[data-testid="cancel-cleanup"]').trigger('click')
    await flushPromises()
    expect(repositoryMocks.countClientDiagnostics).toHaveBeenCalledTimes(2)
    expect(repositoryMocks.loadClientDiagnosticsPage).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[data-testid="cleanup-dialog"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('invalida cache e ricarica anche se la failure non espone progresso', async () => {
    repositoryMocks.deleteExpiredClientDiagnostics.mockRejectedValueOnce(new Error('ack ambiguo'))
    const wrapper = await mountReadyPage()
    await openCleanupDialog(wrapper)

    await wrapper.get('[data-testid="confirm-cleanup"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Pulizia non completata')

    await wrapper.get('[data-testid="cancel-cleanup"]').trigger('click')
    await flushPromises()
    expect(repositoryMocks.countClientDiagnostics).toHaveBeenCalledTimes(2)
    expect(repositoryMocks.loadClientDiagnosticsPage).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[data-testid="cleanup-dialog"]').exists()).toBe(false)
    wrapper.unmount()
  })

  it('riprende dal cursor esposto dopo failure e ricarica lo stato coerente al completamento', async () => {
    repositoryMocks.deleteExpiredClientDiagnostics
      .mockRejectedValueOnce(new ClientDiagnosticsCleanupError(cleanupResult()))
      .mockResolvedValueOnce(cleanupResult({ deleted: 5, batches: 1, done: true, nextCursor: cleanupCursor }))
    const wrapper = await mountReadyPage()
    await openCleanupDialog(wrapper)

    await wrapper.get('[data-testid="confirm-cleanup"]').trigger('click')
    await flushPromises()
    expect(wrapper.text()).toContain('Pulizia parziale dopo 200 eliminazioni')
    expect(wrapper.get('[data-testid="confirm-cleanup"]').text()).toContain('Continua pulizia')

    await wrapper.get('[data-testid="confirm-cleanup"]').trigger('click')
    await flushPromises()
    expect(repositoryMocks.deleteExpiredClientDiagnostics).toHaveBeenNthCalledWith(2, expect.objectContaining({
      cursor: cleanupCursor
    }))
    expect(repositoryMocks.countClientDiagnostics).toHaveBeenCalledTimes(2)
    expect(repositoryMocks.loadClientDiagnosticsPage).toHaveBeenCalledTimes(2)
    expect(wrapper.find('[data-testid="cleanup-dialog"]').exists()).toBe(false)
    wrapper.unmount()
  })
})
