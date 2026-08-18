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
