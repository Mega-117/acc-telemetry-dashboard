// @vitest-environment jsdom
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import ComparePage from '~/pages/dev-telemetry-compare.vue'

vi.mock('~/composables/useCoachStatePoller', () => ({ useCoachStatePoller: () => ({
  coachState: ref(null), startCoachStatePolling: vi.fn(), stopCoachStatePolling: vi.fn(),
}) }))

function trace(variant = 'full') {
  return { schema: 'racercore.laptrace.v1', grid_step_m: 2,
    meta: { game_id: 'synthetic', track: 'Spa', car: 'QA', track_variant: variant,
      lap_time_s: 120, complete: true, valid: null, fuel_l: null },
    channels: { time_s: [0, 1, 2], speed_kmh: [100, 110, 120] } }
}

beforeEach(() => vi.stubGlobal('definePageMeta', vi.fn()))
afterEach(() => { vi.unstubAllGlobals(); delete (window as any).electronAPI })

describe('common LapTrace comparison page', () => {
  it('renders available channels and refuses comparison across layouts', async () => {
    ;(window as any).electronAPI = {
      listLapTraces: vi.fn().mockResolvedValue(['reference', 'full', 'short'].map(id => ({ id, label: id }))),
      readLapTrace: vi.fn((id: string) => Promise.resolve(trace(id === 'short' ? 'short' : 'full'))),
    }
    const view = mount(ComparePage)
    await flushPromises()
    expect(definePageMeta).toHaveBeenCalledWith({ layout: 'dashboard', middleware: 'dev-tools' })
    expect(view.findAll('svg')).toHaveLength(1)
    expect(view.findAll('polyline')).toHaveLength(2)
    expect(view.text()).toContain('validità non disponibile')
    await view.get('select').setValue('short'); await flushPromises()
    expect(view.text()).toContain('Confronto non disponibile')
    expect(view.findAll('svg')).toHaveLength(0)
    view.unmount()
  })

  it('ignores a late lap response after another selection', async () => {
    let finish!: (value: unknown) => void
    ;(window as any).electronAPI = {
      listLapTraces: vi.fn().mockResolvedValue(['reference', 'first', 'late', 'last'].map(id => ({ id, label: id }))),
      readLapTrace: vi.fn((id: string) => id === 'late' ? new Promise(resolve => { finish = resolve }) : Promise.resolve(trace())),
    }
    const view = mount(ComparePage)
    await flushPromises()
    await view.get('select').setValue('late')
    await view.get('select').setValue('last'); await flushPromises()
    finish(trace('short')); await flushPromises()
    expect(view.get('select').element.value).toBe('last')
    expect(view.text()).not.toContain('Confronto non disponibile')
    expect(view.findAll('polyline')).toHaveLength(2)
    view.unmount()
  })
})
