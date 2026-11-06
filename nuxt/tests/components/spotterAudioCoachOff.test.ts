// @vitest-environment jsdom
// 06/11 (user): Feedback coach switched off (ADAPTIVE_COACH_AVAILABLE). The real audio runtime with the
// coach enabled in the settings, in a session it would speak in: with the switch off it never becomes
// active; with the switch on (control) it does. Codex P3 of the dev.13 review.
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createApp, nextTick, ref } from 'vue'
import SpotterAudio from '~/pages/spotter-audio-runtime.vue'

const mocks = vi.hoisted(() => ({ fast: {} as any, settings: {} as any, usage: [] as any[], coachOn: false }))
vi.mock('~/services/usage/usageClient', () => ({ recordUsage: (event: any) => mocks.usage.push(event) }))
vi.mock('~/composables/useFastStatePoller', () => ({ useFastStatePoller: () => ({ fastState: mocks.fast, startFastStatePolling() {}, stopFastStatePolling() {} }) }))
vi.mock('~/composables/useLiveStatePoller', () => ({ useLiveStatePoller: () => ({ liveLap: ref({ lapsCompleted: null, track: null }), startLiveStatePolling() {}, stopLiveStatePolling() {} }) }))
vi.mock('~/composables/useCoachStatePoller', () => ({ useCoachStatePoller: () => ({ coachState: { value: null }, startCoachStatePolling() {}, stopCoachStatePolling() {} }) }))
vi.mock('~/composables/useFirebaseAuth', () => ({ useFirebaseAuth: () => ({ canEnterApp: { value: true }, isSecondaryLocalRuntime: { value: true }, isLocalRuntimeAttested: { value: true } }) }))
vi.mock('~/composables/useSpotterVoiceSettings', () => ({
  get ADAPTIVE_COACH_AVAILABLE() { return mocks.coachOn },
  useSpotterVoiceSettings: () => mocks.settings,
}))
vi.mock('~/composables/usePublicPath', () => ({ usePublicPath: () => ({ getPublicPath: (path: string) => path }) }))
vi.mock('~/composables/useVoiceLabRuntime', () => ({ useVoiceLabRuntime: () => ({ readVoicePoints: async () => ({ points: [] }) }) }))
vi.mock('~/services/spotter/trackVoiceReferenceChanges', () => ({ subscribeTrackVoiceReferencesChanged: () => () => {} }))

let app: ReturnType<typeof createApp>
let host: HTMLElement
async function settle() { for (let i = 0; i < 30; i++) await nextTick() }
function mount() {
  host = document.createElement('div'); document.body.appendChild(host)
  app = createApp(SpotterAudio); app.mount(host)
}
beforeEach(() => {
  mocks.usage = []
  mocks.fast = ref({ isFresh: true, isLive: true, sessionType: 0, lapsCompleted: 1,
    context: { sessionUid: 'A', track: 'Spa', sessionType: 0, sessionIndex: 0 }, info: { lapsCompleted: 1 }, tyreSetup: { pressureRecommendation: null } })
  mocks.settings = { targetLapVoiceEnabled: ref(false), selectedVoice: ref('if_sara'), coachEnabled: ref(false), pressureWarningsEnabled: ref(false),
    referencesEnabled: ref(false), adaptiveCoachEnabled: ref(true), adaptiveCoachMode: ref('all'),
    lapTimeSessionModes: ref(['practice']), pressureWarningSessionModes: ref(['practice']),
    referenceSessionModes: ref(['practice']), adaptiveCoachSessionModes: ref(['practice']),
    targetLapSessionModes: ref(['practice']), load() {} }
  vi.stubGlobal('definePageMeta', () => {})
  vi.stubGlobal('useHead', () => {})
  vi.stubGlobal('Audio', class { duration = 0.01; onended = null; onerror = null; ondurationchange = null; async play() {} pause() {} })
  ;(window as any).electronAPI = { infoTargetGetSettings: async () => ({ active: false, targetTimeMs: null, toleranceMs: 500 }), onInfoTargetSettings: () => () => {} }
})
afterEach(() => { app.unmount(); delete (window as any).electronAPI; host.remove(); vi.unstubAllGlobals() })

const coachActive = () => mocks.usage.filter(e => e.feature === 'voice.coach' && 'active' in e).some(e => e.active === true)

it('switch off: the coach never becomes active, even enabled in the settings', async () => {
  mocks.coachOn = false
  mount(); await settle()
  expect(mocks.usage.some(e => e.feature === 'voice.coach')).toBe(true)
  expect(coachActive()).toBe(false)
})

it('control: with the switch on, the same settings make it active', async () => {
  mocks.coachOn = true
  mount(); await settle()
  expect(coachActive()).toBe(true)
})
