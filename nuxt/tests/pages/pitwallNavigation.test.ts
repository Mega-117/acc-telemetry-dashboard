// @vitest-environment jsdom
import { shallowMount } from '@vue/test-utils'
import { nextTick, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PitwallConcept from '~/components/pitwall/concept/PitwallConcept.vue'

const fake = vi.hoisted(() => ({ store: null as any }))
vi.mock('~/composables/usePitwallStore', () => ({ usePitwallStore: () => fake.store }))
const homeRequest = ref(0)
vi.mock('~/composables/usePitwallConceptMode', () => ({ usePitwallConceptMode: () => ({ homeRequest }) }))

beforeEach(() => {
  fake.store = {
    selectedRace: ref(null), races: ref([]), myRoom: ref(null),
    pitwall: ref({ state: 'off' }), friends: ref([]), people: ref([]),
    searchQuery: ref(''), found: ref([]), meId: ref('me'),
    error: ref(null), notice: ref(null), clockWarning: ref(null),
    enterRace: vi.fn(),
  }
})

describe('Pitwall navigation with the existing global store', () => {
  it('opens the lobby when no room is selected', () => {
    const page = shallowMount(PitwallConcept)
    expect(page.find('.pwc-home').exists()).toBe(true)
    page.unmount()
  })

  it('opens home on remount while preserving room membership without joining again', () => {
    fake.store.selectedRace.value = { id: 'room' }
    const first = shallowMount(PitwallConcept)
    expect(first.find('.pwc-home').exists()).toBe(true)
    first.unmount()
    const returned = shallowMount(PitwallConcept)
    expect(returned.find('.pwc-home').exists()).toBe(true)
    expect(fake.store.selectedRace.value.id).toBe('room')
    expect(fake.store.enterRace).not.toHaveBeenCalled()
    returned.unmount()
  })

  it('returns to the lobby when the selected room is removed', async () => {
    vi.stubGlobal('scrollTo', vi.fn())
    fake.store.selectedRace.value = { id: 'room' }
    const page = shallowMount(PitwallConcept)
    page.findComponent({ name: 'PitwallConceptRaces' }).vm.$emit('enter', { id: 'room' })
    await nextTick()
    expect(page.findComponent({ name: 'PitwallConceptLive' }).exists()).toBe(true)
    fake.store.selectedRace.value = null
    await nextTick()
    expect(page.find('.pwc-home').exists()).toBe(true)
    page.unmount()
    vi.unstubAllGlobals()
  })

  it('a repeated navbar request returns home without leaving the room or sending an order', async () => {
    vi.stubGlobal('scrollTo', vi.fn())
    fake.store.selectedRace.value = { id: 'room' }
    const page = shallowMount(PitwallConcept)
    page.findComponent({ name: 'PitwallConceptRaces' }).vm.$emit('enter', { id: 'room' })
    await nextTick()
    expect(page.findComponent({ name: 'PitwallConceptLive' }).exists()).toBe(true)
    homeRequest.value++
    await nextTick()
    expect(page.find('.pwc-home').exists()).toBe(true)
    expect(fake.store.selectedRace.value.id).toBe('room')
    expect(fake.store.enterRace).toHaveBeenCalledTimes(1)
    page.unmount(); vi.unstubAllGlobals()
  })
})
