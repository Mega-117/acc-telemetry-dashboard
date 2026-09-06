// @vitest-environment jsdom
import { shallowMount } from '@vue/test-utils'
import { nextTick, ref } from 'vue'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import PitwallConcept from '~/components/pitwall/concept/PitwallConcept.vue'

const fake = vi.hoisted(() => ({ store: null as any }))
vi.mock('~/composables/usePitwallStore', () => ({ usePitwallStore: () => fake.store }))

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

  it('restores the selected room after a page remount without joining again', () => {
    fake.store.selectedRace.value = { id: 'room' }
    const first = shallowMount(PitwallConcept)
    expect(first.findComponent({ name: 'PitwallConceptLive' }).exists()).toBe(true)
    first.unmount()
    const returned = shallowMount(PitwallConcept)
    expect(returned.findComponent({ name: 'PitwallConceptLive' }).exists()).toBe(true)
    expect(fake.store.enterRace).not.toHaveBeenCalled()
    returned.unmount()
  })

  it('returns to the lobby when the selected room is removed', async () => {
    vi.stubGlobal('scrollTo', vi.fn())
    fake.store.selectedRace.value = { id: 'room' }
    const page = shallowMount(PitwallConcept)
    fake.store.selectedRace.value = null
    await nextTick()
    expect(page.find('.pwc-home').exists()).toBe(true)
    page.unmount()
    vi.unstubAllGlobals()
  })
})
