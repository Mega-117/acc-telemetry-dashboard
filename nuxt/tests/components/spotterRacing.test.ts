// @vitest-environment jsdom
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Spotter from '~/pages/spotter.vue'
import RacingSwitch from '~/components/ui/RacingSwitch.vue'
import { useGameContext } from '~/composables/useGameContext'

const fake = vi.hoisted(() => ({ settings: {} as any, points: [] as any[] }))
vi.mock('~/composables/useFirebaseAuth', () => ({ useFirebaseAuth: () => ({ isAdmin: ref(false) }) }))
vi.mock('~/composables/usePublicPath', () => ({ usePublicPath: () => ({ getPublicPath: (path: string) => path }) }))
vi.mock('~/composables/useSpotterVoiceSettings', () => ({
  useSpotterVoiceSettings: () => fake.settings,
  spotterVoiceOptions: [{ id: 'if_sara', label: 'Sara' }, { id: 'im_nicola', label: 'Nicola' }],
}))
vi.mock('~/composables/useVoiceLabRuntime', () => ({ useVoiceLabRuntime: () => ({
  readVoicePoints: async () => ({ tracks: ['Spa'], points: fake.points }),
  kokoroReady: async () => ({ state: 'online', message: 'Motore online' }),
}) }))
let wrapper: ReturnType<typeof mount> | undefined
beforeEach(() => {
  useGameContext().selectGame('acc')
  fake.points = []
  vi.stubGlobal('definePageMeta', vi.fn())
  fake.settings = { selectedVoice: ref('if_sara'), voiceLabel: ref('Sara'), adaptiveCoachMode: ref('focus') }
  for (const name of ['referencesEnabled', 'coachEnabled', 'adaptiveCoachEnabled', 'pressureWarningsEnabled']) fake.settings[name] = ref(true)
  for (const name of ['referenceSessionModes', 'adaptiveCoachSessionModes', 'lapTimeSessionModes', 'pressureWarningSessionModes', 'targetLapSessionModes']) fake.settings[name] = ref(['practice'])
  for (const name of ['toggleReferences', 'toggleCoach', 'toggleAdaptiveCoach', 'togglePressureWarnings', 'selectVoice', 'setAdaptiveCoachMode', 'setReferenceSessionModes', 'setAdaptiveCoachSessionModes', 'setLapTimeSessionModes', 'setPressureWarningSessionModes', 'setTargetLapSessionModes']) fake.settings[name] = vi.fn()
})
afterEach(() => { wrapper?.unmount(); vi.unstubAllGlobals() })

describe('Spotter racing controls', () => {
  it('separates legacy ACC references and same-name game variants, including the editor link', async () => {
    fake.points = [
      { id: 'legacy', track: 'Spa', type: 'braking_reference', normalized_car_position: 0.1 },
      { id: 'evo-long', game_id: 'evo', track_variant: 'long', track: 'Spa', type: 'braking_reference', normalized_car_position: 0.2 },
      { id: 'evo-short', game_id: 'evo', track_variant: 'short', track: 'Spa', type: 'braking_reference', normalized_car_position: 0.3 },
    ]
    wrapper = mount(Spotter, { global: { stubs: { LayoutPageContainer: { template: '<main><slot /></main>' }, NuxtLink: { props: ['to'], template: '<a :href="to"><slot /></a>' } } } })
    await flushPromises()
    expect(wrapper.findAll('.reference-metrics dd')[0]!.text()).toBe('1')
    useGameContext().selectGame('evo')
    await flushPromises()
    expect(wrapper.findAll('.reference-metrics dd')[0]!.text()).toBe('0')
    await wrapper.get('select[aria-label="Variante riferimenti"]').setValue('long')
    expect(wrapper.findAll('.reference-metrics dd')[0]!.text()).toBe('1')
    expect(wrapper.get('.reference-panel a').attributes('href')).toContain('game=evo&variant=long&track=Spa')
    await wrapper.get('select[aria-label="Variante riferimenti"]').setValue('short')
    expect(wrapper.findAll('.reference-metrics dd')[0]!.text()).toBe('1')
    useGameContext().selectGame('acc')
    await flushPromises()
    expect(wrapper.findAll('.reference-metrics dd')[0]!.text()).toBe('1')
    expect(wrapper.get('.reference-panel a').attributes('href')).toContain('game=acc&variant=&track=Spa')
  })
  it('PIP-533: sessions only (no global switch), target included, voice and coach mode wired', async () => {
    wrapper = mount(Spotter, { global: { components: { UiRacingSwitch: RacingSwitch }, stubs: { LayoutPageContainer: { template: '<main><slot /></main>' }, NuxtLink: { template: '<a><slot /></a>' } } } })
    await flushPromises()
    expect(wrapper.findAll('.features [role="switch"]')).toHaveLength(0)
    const groups = wrapper.findAll('.session-mode-picker')
    for (const [index, handler] of ['setReferenceSessionModes', 'setAdaptiveCoachSessionModes', 'setLapTimeSessionModes', 'setPressureWarningSessionModes', 'setTargetLapSessionModes'].entries()) {
      await groups[index]!.findAll('button')[1]!.trigger('click')
      expect(fake.settings[handler]).toHaveBeenCalledWith(['practice', 'qualify'])
    }
    await wrapper.findAll('.voice-card')[1]!.trigger('click')
    expect(fake.settings.selectVoice).toHaveBeenCalledWith('im_nicola')
    await wrapper.get('select[aria-label="Modalità feedback coach"]').setValue('all')
    expect(fake.settings.setAdaptiveCoachMode).toHaveBeenCalledWith('all')
    expect(wrapper.text()).toContain('Gestisci in Voice Lab')
  })
})

it('hides unsupported EVO advice without altering ACC preferences', async () => {
  useGameContext().selectGame('evo')
  wrapper = mount(Spotter, { global: { components: { UiRacingSwitch: RacingSwitch } } })
  await flushPromises()
  expect(wrapper.text()).not.toContain('Feedback coach')
  expect(wrapper.text()).not.toContain('Avvisi pressioni')
  expect(wrapper.text()).toContain('Avvisi giro')
  useGameContext().selectGame('acc'); await flushPromises()
  expect(wrapper.text()).toContain('Feedback coach')
  expect(wrapper.text()).toContain('Avvisi pressioni')
  expect(fake.settings.toggleAdaptiveCoach).not.toHaveBeenCalled()
  expect(fake.settings.togglePressureWarnings).not.toHaveBeenCalled()
})
