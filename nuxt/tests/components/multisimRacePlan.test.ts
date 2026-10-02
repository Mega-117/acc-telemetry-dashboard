// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest'
import { createApp, nextTick, ref } from 'vue'
import GaraPage from '~/components/pages/GaraPage.vue'

const state = vi.hoisted(() => ({ game: {} as any, frame: {} as any, stop: vi.fn() }))
vi.mock('vue-router', () => ({ useRoute: () => ({ query: {} }), useRouter: () => ({ push: vi.fn() }) }))
vi.mock('~/composables/useGameContext', () => ({ useGameContext: () => ({ consultedGame: state.game }) }))
vi.mock('~/composables/useFastStatePoller', () => ({ useFastStatePoller: () => ({ fastState: state.frame, startFastStatePolling: vi.fn(), stopFastStatePolling: state.stop }) }))
let app: ReturnType<typeof createApp>, host: HTMLDivElement
afterEach(() => { app?.unmount(); host?.remove() })
async function input(id: string, value: string) {
  const field = host.querySelector<HTMLInputElement>(id)!
  field.value = value; field.dispatchEvent(new Event('input', { bubbles: true })); await nextTick()
}
it('renders the actual planner for EVO, keeps fuel unknown, calculates manual input and resets on game change', async () => {
  state.game = ref('evo'); state.frame = ref({ commonLive: null })
  host = document.createElement('div'); document.body.append(host)
  app = createApp(GaraPage); app.config.warnHandler = () => {}; app.component('LayoutPageContainer', { template: '<main><slot /></main>' }); app.mount(host)
  expect(host.querySelector('[data-test="race-laps"]')!.textContent).toBe('—')
  expect(host.textContent).not.toContain('3.1')
  await input('#race-pace', '120')
  expect(host.querySelector('[data-test="race-laps"]')!.textContent).toBe('30')
  expect(host.querySelector('[data-test="race-fuel"]')!.textContent).toBe('—')
  await input('#race-fuel', '2.5')
  expect(host.querySelector('[data-test="race-fuel"]')!.textContent).toBe('75.0 L')
  state.game.value = 'acc'; await nextTick()
  expect(host.querySelector('[data-test="race-laps"]')!.textContent).toBe('—')
})
