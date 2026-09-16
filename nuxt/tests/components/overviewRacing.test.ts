// @vitest-environment jsdom
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import Calendar from '~/components/overview/UpcomingRacesCard.vue'
import Activity from '~/components/cards/ActivityCard.vue'

const mocks = vi.hoisted(() => ({ load: vi.fn(), create: vi.fn(), update: vi.fn(), remove: vi.fn() }))
vi.mock('~/composables/useFirebaseAuth', () => ({ useFirebaseAuth: () => ({ currentUser: ref({ uid: 'qa' }), userRole: ref('pilot') }) }))
vi.mock('~/composables/useRuntimeCapabilityGate', () => ({ useRuntimeCapabilityGate: () => ({ gate: () => ref({ allowed: true }) }) }))
vi.mock('~/repositories/raceCalendarRepository', () => ({ loadRaceCalendarEvents: mocks.load, createRaceCalendarEvent: mocks.create, updateRaceCalendarEvent: mocks.update, deleteRaceCalendarEvent: mocks.remove }))
const event = { id: 'event', title: 'Gara QA', startsAt: '2099-10-01T19:00', trackName: 'Monza', carName: 'Ferrari' }
beforeEach(() => { vi.clearAllMocks(); mocks.load.mockResolvedValue([event]) })

describe('racing overview components', () => {
  it('opens the existing create form, validates and persists through the repository', async () => {
    const wrapper = mount(Calendar, { props: { userId: 'qa', racing: true }, global: { stubs: { teleport: true } } })
    await flushPromises()
    expect(wrapper.get('[aria-label="Aggiungi gara"] svg circle').exists()).toBe(true)
    expect(wrapper.get('[aria-label="Opzioni prossima gara"] svg').exists()).toBe(true)
    await wrapper.get('[aria-label="Aggiungi gara"]').trigger('click')
    await wrapper.get('form').trigger('submit')
    expect(wrapper.text()).toContain('Titolo, data e pista sono obbligatori')
    const fields = wrapper.findAll('input')
    await fields[0]!.setValue('Nuova gara')
    await fields[1]!.setValue('2099-10-02T18:00')
    await fields[2]!.setValue('Spa')
    await wrapper.get('form').trigger('submit'); await flushPromises()
    expect(mocks.create).toHaveBeenCalledWith('qa', expect.objectContaining({ title: 'Nuova gara', trackName: 'Spa' }))
    expect(wrapper.find('form').exists()).toBe(false)
    wrapper.unmount()
  })
  it('offers edit and delete from the race menu, retaining confirmation', async () => {
    const wrapper = mount(Calendar, { props: { userId: 'qa', racing: true }, global: { stubs: { teleport: true } } })
    await flushPromises()
    await wrapper.get('.race-options__menu button').trigger('click')
    expect((wrapper.get('input').element as HTMLInputElement).value).toBe('Gara QA')
    await wrapper.get('input').setValue('Gara aggiornata')
    await wrapper.get('form').trigger('submit'); await flushPromises()
    expect(mocks.update).toHaveBeenCalledWith('qa', 'event', expect.objectContaining({ title: 'Gara aggiornata' }))
    await wrapper.findAll('.race-options__menu button')[1]!.trigger('click')
    expect(mocks.remove).not.toHaveBeenCalled()
    await wrapper.get('[aria-label="Chiudi"]').trigger('click')
    expect(mocks.remove).not.toHaveBeenCalled()
    wrapper.unmount()
  })
  it('shows seven calendar days with real zero values and matching totals', () => {
    const wrapper = mount(Activity, { props: { racing: true, data: Array.from({ length: 7 }, (_, i) => ({ day: `D${i}`, dateLabel: `${i + 1}/09`, practice: i === 0 ? 28 : 0, qualify: 0, race: 0 })), practiceTotal: { minutes: 28, sessions: 1 }, qualifyTotal: { minutes: 0, sessions: 0 }, raceTotal: { minutes: 0, sessions: 0 } } })
    expect(wrapper.findAll('.bar-column')).toHaveLength(7)
    expect(wrapper.findAll('.bar-total').map(x => x.text())).toEqual(['28min', '0', '0', '0', '0', '0', '0'])
    expect(wrapper.get('.legend-item--practice').text()).toContain('28')
    wrapper.unmount()
  })
})
