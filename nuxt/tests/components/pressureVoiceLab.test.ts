// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, ref } from 'vue'
import VoiceLab from '~/pages/dev-voice-lab.vue'
import script from '~/config/voiceScript.json'

const mocks = vi.hoisted(() => ({ auth: {} as any, synthesize: vi.fn() }))
vi.mock('~/composables/useFirebaseAuth', () => ({ useFirebaseAuth: () => mocks.auth }))
vi.mock('~/composables/useAppNotifications', () => ({ useAppNotifications: () => ({ push: vi.fn() }) }))
vi.mock('~/composables/useKokoroVoiceLabLifecycle', () => ({ useKokoroVoiceLabLifecycle: () => ({
  enterVoiceLab: vi.fn(), leaveVoiceLab: vi.fn(), beginWork: vi.fn(), endWork: vi.fn(), scheduleShutdown: vi.fn(),
}) }))
vi.mock('~/composables/useVoiceLabRuntime', () => ({ useVoiceLabRuntime: () => ({
  kokoroReady: async () => ({ state: 'online', voices: [{ id: 'if_sara' }, { id: 'im_nicola' }] }),
  readVoicePoints: async () => ({ tracks: [], points: [] }), synthesize: mocks.synthesize,
}) }))

afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks() })
describe('pressure standard script admin flow', () => {
  it('opens the linked scenario after async admin auth and regenerates both standard WAVs', async () => {
    mocks.auth.isAdmin = ref(false)
    mocks.synthesize.mockReset().mockResolvedValue(new Blob(['wav'], { type: 'audio/wav' }))
    vi.stubGlobal('definePageMeta', () => {})
    vi.stubGlobal('useRoute', () => ({ query: { section: 'script', scenario: 'pressureAdjustmentNeeded' } }))
    HTMLElement.prototype.scrollIntoView = vi.fn()
    const fetch = vi.fn(async (url: string, options?: any) => {
      if (url === '/api/dev/voice-script' && !options) return JSON.parse(JSON.stringify(script))
      return { entries: [] }
    })
    vi.stubGlobal('$fetch', fetch)
    const host = document.createElement('div'); document.body.append(host)
    const app = createApp(VoiceLab)
    app.config.warnHandler = () => {}
    try {
      app.mount(host)
      await nextTick(); await new Promise(resolve => setTimeout(resolve, 10))
      expect(host.querySelector('.script-editor')).toBeNull()
      expect(fetch).not.toHaveBeenCalledWith('/api/dev/voice-script')
      mocks.auth.isAdmin.value = true
      await vi.waitFor(() => expect(host.querySelector('#voice-scenario-pressureAdjustmentNeeded')).not.toBeNull())
      const row = host.querySelector('#voice-scenario-pressureAdjustmentNeeded')!
      const input = row.querySelector('textarea')!
      input.value = 'correzioni pressioni disponibili.'
      input.dispatchEvent(new Event('input', { bubbles: true }))
      await nextTick()
      ;(row.querySelector('button.primary') as HTMLButtonElement).click()
      await vi.waitFor(() => expect(fetch.mock.calls.filter(([url]) => url === '/api/dev/voice-wav')).toHaveLength(2))
      expect(mocks.synthesize.mock.calls.map(call => call.slice(0, 2))).toEqual([
        [input.value, 'if_sara'], [input.value, 'im_nicola'],
      ])
      const saved = fetch.mock.calls.find(([url, options]) => url === '/api/dev/voice-script' && options?.method === 'POST')
      expect(saved?.[1].body.scenarios.find((entry: any) => entry.id === 'pressureAdjustmentNeeded').text).toBe(input.value)
      expect(fetch.mock.calls.filter(([url]) => url === '/api/dev/voice-wav').map(([, options]) => options.body.filename)).toEqual([
        'pressureAdjustmentNeeded-if_sara.wav', 'pressureAdjustmentNeeded-im_nicola.wav',
      ])
      mocks.auth.isAdmin.value = false; await nextTick()
      expect(host.querySelector('.script-editor')).toBeNull()
    } finally { app.unmount(); host.remove() }
  })
})
