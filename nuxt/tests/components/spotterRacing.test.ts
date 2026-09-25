// @vitest-environment jsdom
import { mount, flushPromises } from '@vue/test-utils'
import { ref } from 'vue'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import Spotter from '~/pages/spotter.vue'
import RacingSwitch from '~/components/ui/RacingSwitch.vue'

const fake = vi.hoisted(() => ({ settings: {} as any }))
vi.mock('~/composables/useFirebaseAuth', () => ({ useFirebaseAuth: () => ({ isAdmin: ref(false) }) }))
vi.mock('~/composables/usePublicPath', () => ({ usePublicPath: () => ({ getPublicPath: (path: string) => path }) }))
vi.mock('~/composables/useSpotterVoiceSettings', () => ({
  useSpotterVoiceSettings: () => fake.settings,
  spotterVoiceOptions: [{ id: 'if_sara', label: 'Sara' }, { id: 'im_nicola', label: 'Nicola' }],
}))
vi.mock('~/composables/useVoiceLabRuntime', () => ({ useVoiceLabRuntime: () => ({
  readVoicePoints: async () => ({ tracks: ['Spa'], points: [] }),
  kokoroReady: async () => ({ state: 'online', message: 'Motore online' }),
}) }))
let wrapper: ReturnType<typeof mount> | undefined
beforeEach(() => {
  vi.stubGlobal('definePageMeta', vi.fn())
  fake.settings = { selectedVoice: ref('if_sara'), voiceLabel: ref('Sara'), adaptiveCoachMode: ref('focus') }
  for (const name of ['referencesEnabled', 'coachEnabled', 'adaptiveCoachEnabled', 'pressureWarningsEnabled']) fake.settings[name] = ref(true)
  for (const name of ['referenceSessionModes', 'adaptiveCoachSessionModes', 'lapTimeSessionModes', 'pressureWarningSessionModes']) fake.settings[name] = ref(['practice'])
  for (const name of ['toggleReferences', 'toggleCoach', 'toggleAdaptiveCoach', 'togglePressureWarnings', 'selectVoice', 'setAdaptiveCoachMode', 'setReferenceSessionModes', 'setAdaptiveCoachSessionModes', 'setLapTimeSessionModes', 'setPressureWarningSessionModes']) fake.settings[name] = vi.fn()
})
afterEach(() => { wrapper?.unmount(); vi.unstubAllGlobals() })

describe('Spotter racing controls', () => {
  it('keeps all four feature switches, session policies, voice and coach mode wired', async () => {
    wrapper = mount(Spotter, { global: { components: { UiRacingSwitch: RacingSwitch }, stubs: { LayoutPageContainer: { template: '<main><slot /></main>' }, NuxtLink: { template: '<a><slot /></a>' } } } })
    await flushPromises()
    const switches = wrapper.findAll('[role="switch"]')
    expect(switches).toHaveLength(4)
    for (const [index, handler] of ['toggleReferences', 'toggleAdaptiveCoach', 'toggleCoach', 'togglePressureWarnings'].entries()) {
      await switches[index]!.trigger('click')
      expect(fake.settings[handler]).toHaveBeenCalledOnce()
    }
    const groups = wrapper.findAll('.session-mode-picker')
    for (const [index, handler] of ['setReferenceSessionModes', 'setAdaptiveCoachSessionModes', 'setLapTimeSessionModes', 'setPressureWarningSessionModes'].entries()) {
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
