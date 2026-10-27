// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { setLocale } from '~/i18n'
import { flushPromises, mount } from '@vue/test-utils'

const mocks = vi.hoisted(() => ({ page: vi.fn() }))
vi.mock('~/composables/useTelemetryGateway', () => ({ useTelemetryGateway: () => ({ getSessionsPage: mocks.page }) }))
vi.mock('~/composables/useFirebaseAuth', () => ({ useFirebaseAuth: () => ({ getUserProfile: vi.fn() }) }))

import SessionPickerModal from '~/components/ui/SessionPickerModal.vue'

const session = (id: string, track: string) => ({
  sessionId: id, fileHash: id, fileName: `${id}.json`, uploadedAt: null, rawChunkCount: 0, rawSizeBytes: 0,
  meta: { track, car: 'ferrari_296_gt3', date_start: '2026-10-01T10:00:00Z', date_end: null, session_type: 2, driver: null, gameId: 'acc' },
  summary: { laps: 5, lapsValid: 5, bestLap: null, avgCleanLap: null, totalTime: 600000, stintCount: 1 },
})
const mountPicker = () => mount(SessionPickerModal, {
  props: { isOpen: true, currentTrack: 'monza', gameId: 'acc', excludeSessionId: 'current' },
  global: { stubs: { Teleport: true } },
})

beforeEach(() => vi.clearAllMocks())

// PIP-665: these checks read the Italian texts; the default would follow the system language.
setLocale('it')

describe('session picker paging (PIP-591)', () => {
  it('opens with one page, the same unfiltered read as before', async () => {
    mocks.page.mockResolvedValueOnce({ sessions: [session('m1', 'monza')], state: { hasNext: false, currentPage: 1 } })
    const view = mountPicker()
    await flushPromises()
    expect(mocks.page).toHaveBeenCalledTimes(1)
    expect(mocks.page.mock.calls[0]!.slice(1)).toEqual([{}, 1, 50, true])
    expect(view.findAll('.session-row')).toHaveLength(1)
    expect(view.find('.spm-load-more').exists()).toBe(false)
  })

  it('reaches an older comparable session with "Carica altre sessioni"', async () => {
    mocks.page
      .mockResolvedValueOnce({ sessions: Array.from({ length: 50 }, (_, i) => session(`o${i}`, 'spa')), state: { hasNext: true, currentPage: 1 } })
      .mockResolvedValueOnce({ sessions: [session('m1', 'monza')], state: { hasNext: false, currentPage: 2 } })
    const view = mountPicker()
    await flushPromises()
    expect(view.findAll('.session-row')).toHaveLength(0)
    expect(view.get('.spm-empty').text()).toContain('tra le più recenti')
    await view.get('.spm-load-more').trigger('click')
    await flushPromises()
    expect(mocks.page.mock.calls[1]!.slice(1)).toEqual([{}, 2, 50, false])
    expect(view.findAll('.session-row')).toHaveLength(1)
    expect(view.find('.spm-load-more').exists()).toBe(false)
  })

  it('a failed later page is retried, not skipped', async () => {
    mocks.page
      .mockResolvedValueOnce({ sessions: [session('o1', 'spa')], state: { hasNext: true, currentPage: 1 } })
      // Il pager assorbe l'errore: lista vuota e pagina corrente ancora 1.
      .mockResolvedValueOnce({ sessions: [], state: { hasNext: true, currentPage: 1 } })
      .mockResolvedValueOnce({ sessions: [session('m1', 'monza')], state: { hasNext: false, currentPage: 2 } })
    const view = mountPicker()
    await flushPromises()
    await view.get('.spm-load-more').trigger('click')
    await flushPromises()
    expect(view.text()).toContain('Caricamento non riuscito')
    await view.get('.spm-load-more').trigger('click')
    await flushPromises()
    expect(mocks.page.mock.calls.map(call => call[2])).toEqual([1, 2, 2])
    expect(view.findAll('.session-row')).toHaveLength(1)
    expect(view.text()).not.toContain('Caricamento non riuscito')
  })
})
