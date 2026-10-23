// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from 'vitest'
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

beforeEach(() => vi.clearAllMocks())

describe('session picker paging (PIP-591)', () => {
  it('reads further pages when the first fifty are other tracks', async () => {
    const other = Array.from({ length: 50 }, (_, i) => session(`o${i}`, 'spa'))
    mocks.page
      .mockResolvedValueOnce({ sessions: other, state: { hasNext: true } })
      .mockResolvedValueOnce({ sessions: [session('m1', 'monza')], state: { hasNext: false } })
    const view = mount(SessionPickerModal, {
      props: { isOpen: true, currentTrack: 'monza', gameId: 'acc', excludeSessionId: 'current' },
      global: { stubs: { Teleport: true } },
    })
    await flushPromises()
    expect(mocks.page).toHaveBeenCalledTimes(2)
    expect(mocks.page.mock.calls[0]![1]).toEqual({ gameId: 'acc' })
    expect(mocks.page.mock.calls.map(call => call[2])).toEqual([1, 2])
    expect(view.findAll('.session-row')).toHaveLength(1)
  })

  it('stops after the page limit even if nothing matches', async () => {
    mocks.page.mockResolvedValue({ sessions: [session('o', 'spa')], state: { hasNext: true } })
    mount(SessionPickerModal, {
      props: { isOpen: true, currentTrack: 'monza', gameId: 'acc', excludeSessionId: 'current' },
      global: { stubs: { Teleport: true } },
    })
    await flushPromises()
    expect(mocks.page).toHaveBeenCalledTimes(10)
  })
})
