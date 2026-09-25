// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { createApp, nextTick, ref } from 'vue'
import SpotterAudio from '~/pages/spotter-audio-runtime.vue'

const mocks = vi.hoisted(() => ({ fast: {} as any, live: {} as any, settings: {} as any, played: [] as string[] }))
vi.mock('~/composables/useFastStatePoller', () => ({ useFastStatePoller: () => ({ fastState: mocks.fast, startFastStatePolling() {}, stopFastStatePolling() {} }) }))
vi.mock('~/composables/useLiveStatePoller', () => ({ useLiveStatePoller: () => ({ liveLap: mocks.live, startLiveStatePolling() {}, stopLiveStatePolling() {} }) }))
vi.mock('~/composables/useCoachStatePoller', () => ({ useCoachStatePoller: () => ({ coachState: { value: null }, startCoachStatePolling() {}, stopCoachStatePolling() {} }) }))
vi.mock('~/composables/useFirebaseAuth', () => ({ useFirebaseAuth: () => ({ canEnterApp: { value: true }, isSecondaryLocalRuntime: { value: true }, isLocalRuntimeAttested: { value: true } }) }))
vi.mock('~/composables/useSpotterVoiceSettings', () => ({ useSpotterVoiceSettings: () => mocks.settings }))
vi.mock('~/composables/usePublicPath', () => ({ usePublicPath: () => ({ getPublicPath: (path: string) => path }) }))
vi.mock('~/composables/useVoiceLabRuntime', () => ({ useVoiceLabRuntime: () => ({ readVoicePoints: async () => ({ points: [] }) }) }))
vi.mock('~/services/spotter/trackVoiceReferenceChanges', () => ({ subscribeTrackVoiceReferencesChanged: () => () => {} }))

let app: ReturnType<typeof createApp>
let host: HTMLElement
let targetUpdate: (settings: any) => void
let removeTargetListener: ReturnType<typeof vi.fn>
async function settle() { for (let i = 0; i < 30; i++) await nextTick() }
async function feed(lap: number, session: string, valid = true, time = 101_900) {
  mocks.fast.value = {
    isFresh: true, isLive: true, sessionType: 0, lapsCompleted: lap,
    context: { sessionUid: session, track: session === 'A' ? 'Spa' : 'Imola', sessionType: 0, sessionIndex: 0 },
    info: { lapsCompleted: lap, lastLapTimeMs: time, lastLapValid: valid }, lastLapTimeMs: time,
    tyreSetup: { pressureRecommendation: { sessionId: session, stintNumber: 1,
      completedLaps: lap, sourceCompletedLaps: lap, status: lap === 3 ? 'ready' : 'waiting_for_laps',
      eligible: lap === 3, needsAdjustment: lap === 3 } },
  }
  await settle()
}
beforeEach(() => {
  localStorage.clear()
  mocks.fast = ref({ isFresh: false, tyreSetup: { pressureRecommendation: null } })
  mocks.live = ref({ lapsCompleted: null, track: null }) // live poller never reports crossings
  mocks.played = []
  mocks.settings = { targetLapVoiceEnabled: ref(true), selectedVoice: ref('if_sara'), coachEnabled: ref(true), pressureWarningsEnabled: ref(true),
    referencesEnabled: ref(false), adaptiveCoachEnabled: ref(false), adaptiveCoachMode: ref('all'),
    lapTimeSessionModes: ref(['practice']), pressureWarningSessionModes: ref(['practice']),
    referenceSessionModes: ref(['practice']), adaptiveCoachSessionModes: ref(['practice']), load() {} }
  vi.stubGlobal('definePageMeta', () => {})
  vi.stubGlobal('useHead', () => {})
  vi.stubGlobal('Audio', class {
    duration = 0.01; onended: (() => void) | null = null; onerror = null; ondurationchange = null
    constructor(public path: string) {}
    async play() { mocks.played.push(this.path); queueMicrotask(() => this.onended?.()) }
    pause() {}
  })
  removeTargetListener = vi.fn()
  ;(window as any).electronAPI = {
    infoTargetGetSettings: async () => ({ active: false, targetTimeMs: null, toleranceMs: 500 }),
    onInfoTargetSettings: (callback: (settings: any) => void) => { targetUpdate = callback; return removeTargetListener },
  }
  host = document.createElement('div'); document.body.appendChild(host)
  app = createApp(SpotterAudio); app.mount(host)
})
afterEach(() => { app.unmount(); expect(removeTargetListener).toHaveBeenCalledOnce(); delete (window as any).electronAPI; host.remove(); vi.unstubAllGlobals() })

it('plays each lap and then third-lap pressure across server/track changes without live-state crossings', async () => {
  for (const session of ['A', 'B']) for (let lap = 0; lap <= 3; lap++) await feed(lap, session)
  expect(mocks.played).toEqual(Array.from({ length: 2 }, () => [
    '/voice/qualifying/lap-time-1019-if_sara.wav', '/voice/qualifying/lap-time-1019-if_sara.wav',
    '/voice/qualifying/lap-time-1019-if_sara.wav', '/voice/qualifying/pressureAdjustmentNeeded-if_sara.wav',
  ]).flat())
  await feed(3, 'B')
  expect(mocks.played).toHaveLength(8)
})
it('announces invalid lap times and never reads a time outside the full-WAV range', async () => {
  await feed(0, 'A'); await feed(1, 'A', false)
  await feed(2, 'A', true, 170_000); await feed(3, 'A', false, 170_000); await feed(4, 'A', true, 70_000)
  expect(mocks.played.filter(path => !path.includes('pressureAdjustmentNeeded'))).toEqual([
    '/voice/qualifying/time-invalid-if_sara.wav', '/voice/qualifying/lap-time-1019-if_sara.wav',
    // Out of range: valid laps stay silent, invalid laps keep only the dedicated track.
    '/voice/qualifying/time-invalid-if_sara.wav',
  ])
  expect(mocks.played.some(path => path.includes('/time-num-') || path.includes('/time-e-'))).toBe(false)
})
it('pressure still speaks when lap times are disabled', async () => {
  mocks.settings.coachEnabled.value = false
  await feed(0, 'A'); await feed(1, 'A'); await feed(2, 'A'); await feed(3, 'A')
  expect(mocks.played).toEqual(['/voice/qualifying/pressureAdjustmentNeeded-if_sara.wav'])
})

it('target broadcasts beat an older initial IPC response and work independently of lap/pressure voice', async () => {
  // Sent while the initial async get is pending: the older inactive snapshot must not win.
  targetUpdate({ active: true, targetTimeMs: 101_900, toleranceMs: 500, keepBetweenSessions: false })
  mocks.settings.coachEnabled.value = false
  mocks.settings.pressureWarningsEnabled.value = false
  await feed(0, 'A'); await feed(1, 'A'); await feed(1, 'A')
  await feed(2, 'A', true, 102_401); await feed(3, 'A', false)
  expect(mocks.played).toEqual(['/voice/qualifying/targetInside-if_sara.wav', '/voice/qualifying/targetOutside-if_sara.wav'])
  mocks.settings.targetLapVoiceEnabled.value = false; await feed(4, 'A')
  mocks.settings.targetLapVoiceEnabled.value = true; await feed(4, 'A')
  expect(mocks.played).toHaveLength(2)
  mocks.settings.selectedVoice.value = 'im_nicola'; await feed(5, 'A')
  expect(mocks.played.at(-1)).toBe('/voice/qualifying/targetInside-im_nicola.wav')
  targetUpdate({ active: false, targetTimeMs: null, toleranceMs: 500 }); await feed(6, 'A')
  expect(mocks.played).toHaveLength(3)
})
it('mounted audio queues target after the lap and same-frame pressure warning', async () => {
  targetUpdate({ active: true, targetTimeMs: 101_900, toleranceMs: 500, keepBetweenSessions: false })
  await feed(2, 'A'); await feed(3, 'A')
  expect(mocks.played).toEqual([
    '/voice/qualifying/lap-time-1019-if_sara.wav',
    '/voice/qualifying/pressureAdjustmentNeeded-if_sara.wav',
    '/voice/qualifying/targetInside-if_sara.wav',
  ])
})
