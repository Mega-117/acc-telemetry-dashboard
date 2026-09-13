// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createApp, nextTick, ref } from 'vue'
import VoiceLab from '~/pages/dev-voice-lab.vue'
import script from '~/config/voiceScript.json'
import { buildLapTimeVoiceEntry } from '~/services/overlay/lapTimeAnnouncer'

const mocks = vi.hoisted(() => ({
  auth: {} as any,
  runtime: {
    kokoroReady: vi.fn(), kokoroStart: vi.fn(), readVoicePoints: vi.fn(),
    writeVoicePoints: vi.fn(), saveReferenceWav: vi.fn(), synthesize: vi.fn(),
  },
  lifecycle: {
    enterVoiceLab: vi.fn(), leaveVoiceLab: vi.fn(), beginWork: vi.fn(),
    endWork: vi.fn(), scheduleShutdown: vi.fn(),
  },
  publish: vi.fn(), notify: vi.fn(),
}))
vi.mock('~/composables/useFirebaseAuth', () => ({ useFirebaseAuth: () => mocks.auth }))
vi.mock('~/composables/useAppNotifications', () => ({ useAppNotifications: () => ({ push: mocks.notify }) }))
vi.mock('~/composables/useKokoroVoiceLabLifecycle', () => ({ useKokoroVoiceLabLifecycle: () => mocks.lifecycle }))
vi.mock('~/composables/useVoiceLabRuntime', () => ({ useVoiceLabRuntime: () => mocks.runtime }))
vi.mock('~/services/spotter/trackVoiceReferenceChanges', () => ({ publishTrackVoiceReferencesChanged: mocks.publish }))

const online = { state: 'online', voices: [{ id: 'if_sara' }, { id: 'im_nicola' }] }
const point = {
  id: 'spa-1', track: 'Spa', type: 'braking_reference', normalized_car_position: 0.2,
  label: 'Les Combes', text: 'Frena prima del cartello', speed: 1.15, enabled: true,
  timing_offset_sec: -3, audio_paths: { if_sara: '/sara.wav', im_nicola: '/nicola.wav' },
}
const clone = <T,>(value: T): T => JSON.parse(JSON.stringify(value))
let host: HTMLDivElement
let app: ReturnType<typeof createApp> | undefined
let fetch: ReturnType<typeof vi.fn>
let play: ReturnType<typeof vi.spyOn>

// Drain Vue and mocked API promises without wall-clock delays or external I/O.
async function settle() {
  for (let i = 0; i < 30; i++) { await Promise.resolve(); await nextTick() }
}
function button(scope: string, label: string) {
  const result = [...host.querySelectorAll<HTMLButtonElement>(`${scope} button`)]
    .find(item => item.textContent?.replace(/\s+/g, ' ').trim() === label)
  expect(result, `${scope}: ${label}`).toBeDefined()
  return result!
}
async function click(scope: string, label: string) { button(scope, label).click(); await settle() }
async function input(selector: string, value: string, event = 'input') {
  const element = host.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(selector)!
  expect(element, selector).not.toBeNull()
  element.value = value
  if (event === 'change' && element instanceof HTMLInputElement) element.dispatchEvent(new Event('input', { bubbles: true }))
  element.dispatchEvent(new Event(event, { bubbles: true }))
  await settle()
}
async function mount(section = 'script', admin = true) {
  mocks.auth.isAdmin = ref(admin)
  vi.stubGlobal('useRoute', () => ({ query: { section } }))
  app = createApp(VoiceLab)
  app.config.warnHandler = () => {}
  app.mount(host)
  await settle()
}
function writes(url: string) {
  return fetch.mock.calls.filter(([path, options]) => path === url && options?.method === 'POST')
}

beforeEach(() => {
  vi.resetAllMocks(); vi.useFakeTimers()
  host = document.createElement('div'); document.body.append(host)
  vi.stubGlobal('definePageMeta', () => {})
  mocks.runtime.kokoroReady.mockResolvedValue(online)
  mocks.runtime.kokoroStart.mockResolvedValue({ status: 'starting' })
  mocks.runtime.readVoicePoints.mockResolvedValue({ tracks: ['Spa', 'Monza'], points: [clone(point)] })
  mocks.runtime.writeVoicePoints.mockResolvedValue({ ok: true })
  mocks.runtime.saveReferenceWav.mockImplementation(async ({ filename }) => ({ path: `/references/${filename}` }))
  mocks.runtime.synthesize.mockImplementation(async () => ({ arrayBuffer: async () => new Uint8Array([87, 65, 86]).buffer }))
  vi.stubGlobal('URL', class extends URL {
    static createObjectURL = vi.fn(() => 'blob:voice-preview')
    static revokeObjectURL = vi.fn()
  })
  vi.spyOn(HTMLMediaElement.prototype, 'load').mockImplementation(() => {})
  vi.spyOn(HTMLMediaElement.prototype, 'pause').mockImplementation(() => {})
  play = vi.spyOn(HTMLMediaElement.prototype, 'play').mockResolvedValue(undefined)
  fetch = vi.fn(async (url: string, options?: any) => {
    if (options?.method === 'POST') return { ok: true }
    if (url === '/api/dev/voice-script') return clone(script)
    if (url === '/api/dev/coach-voice-script') return {
      defaultSpeed: 1.15, voices: ['if_sara', 'im_nicola'],
      phrases: [{ key: 'brake', text: 'Frena prima del punto', enabled: true }],
    }
    if (url.startsWith('/api/dev/lap-time-voice-catalog')) return { entries: [
      { ...buildLapTimeVoiceEntry(900, 'if_sara', 1.15), exists: true },
      { ...buildLapTimeVoiceEntry(901, 'if_sara', 1.15), exists: false },
    ] }
    throw new Error(`Unexpected request ${url}`)
  })
  vi.stubGlobal('$fetch', fetch)
})
afterEach(async () => {
  app?.unmount(); app = undefined
  await settle(); host.remove()
  vi.clearAllTimers(); vi.useRealTimers()
  vi.restoreAllMocks(); vi.unstubAllGlobals()
})

describe('Voice Lab user interactions', () => {
  it('regenerates edited steps in both voices and keeps failed edits retryable', async () => {
    await mount()
    await click('.mode-tabs', '60 min'); await click('.mode-tabs', '30 min')
    const original = host.querySelector<HTMLTextAreaElement>('.phrase-row textarea')!.value
    await input('.phrase-row textarea', 'Testo nuovo della prima fase')
    await input('.phrase-row input', '1.2')
    await click('.script-editor', 'Salva e rigenera modifiche (1)')
    expect(writes('/api/dev/voice-script')).toHaveLength(1)
    expect(mocks.runtime.synthesize.mock.calls).toEqual([
      ['Testo nuovo della prima fase', 'if_sara', 1.2], ['Testo nuovo della prima fase', 'im_nicola', 1.2],
    ])
    expect(writes('/api/dev/voice-wav').map(([, options]) => options.body.filename))
      .toEqual([expect.stringMatching(/^step-.*-if_sara.wav$/), expect.stringMatching(/^step-.*-im_nicola.wav$/)])
    expect(button('.script-editor', 'Tutto salvato').disabled).toBe(true)
    await input('.phrase-row textarea', original)
    mocks.runtime.synthesize.mockRejectedValueOnce(new Error('engine unavailable'))
    await click('.script-editor', 'Salva e rigenera modifiche (1)')
    expect(host.querySelector('.row-status--error')?.textContent).toContain('engine unavailable')
    expect(host.textContent).toContain('0/1 rigenerate')
    expect(button('.script-editor', 'Salva e rigenera modifiche (1)').disabled).toBe(false)
    await vi.advanceTimersByTimeAsync(3500); await settle()
    await vi.advanceTimersByTimeAsync(1000); await settle()
    expect(host.querySelectorAll('.toast')).toHaveLength(0)
  })

  it('plays edited text in the selected voice, handles player errors and releases URLs', async () => {
    await mount()
    await click('.script-editor .voice-toggle', 'Nicola')
    await input('.playground textarea', 'Una frase di prova')
    await input('.playground input', '1.3')
    await click('.playground', 'Play')
    expect(mocks.runtime.synthesize).toHaveBeenLastCalledWith('Una frase di prova', 'im_nicola', 1.3)
    const audio = host.querySelector('audio')!
    audio.dispatchEvent(new Event('play')); await settle()
    expect(host.textContent).toContain('Riproduzione in corso.')
    audio.dispatchEvent(new Event('ended')); await settle()
    expect(host.textContent).toContain('Audio completato.')
    audio.dispatchEvent(new Event('error')); await settle()
    expect(host.textContent).toContain('Audio non riproducibile.')
    await click('.phrase-row', 'Ascolta')
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:voice-preview')
    expect(HTMLMediaElement.prototype.pause).toHaveBeenCalled()
    play.mockRejectedValueOnce(Object.assign(new Error('blocked'), { name: 'NotAllowedError' }))
    await click('.playground', 'Play')
    expect(host.textContent).toContain('Premi Play')
    mocks.runtime.synthesize.mockRejectedValueOnce(new Error('synthesis down'))
    await click('.playground', 'Play')
    expect(host.textContent).toContain('Sintesi non riuscita: synthesis down')
    app!.unmount(); app = undefined
    expect(mocks.lifecycle.leaveVoiceLab).toHaveBeenCalledOnce()
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:voice-preview')
  })

  it('autosaves references, preserves both WAV paths and flushes on pagehide', async () => {
    await mount('references', false)
    expect(host.querySelector('.lab-section-tabs')).toBeNull()
    expect(fetch).not.toHaveBeenCalledWith('/api/dev/voice-script')
    await input('.reference-row textarea', 'Frena al cartello nuovo')
    await input('.reference-row select', '1.25', 'change')
    await input('.reference-setting--timing select', '4', 'change')
    expect(mocks.runtime.writeVoicePoints).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(600); await settle()
    expect(mocks.runtime.writeVoicePoints).toHaveBeenCalledOnce()
    expect(mocks.runtime.writeVoicePoints.mock.calls[0]![0].points[0]).toMatchObject({
      text: 'Frena al cartello nuovo', speed: 1.25, timing_offset_sec: 4, audio_paths: point.audio_paths,
    })
    expect(mocks.publish).toHaveBeenCalledOnce()
    await click('.reference-track-select', 'Nicola')
    await click('.reference-row', '▶ Ascolta')
    expect(mocks.runtime.synthesize).toHaveBeenLastCalledWith('Frena al cartello nuovo', 'im_nicola', 1.25)
    host.querySelector<HTMLButtonElement>('.reference-availability')!.click(); await settle()
    window.dispatchEvent(new Event('pagehide')); await settle()
    expect(mocks.runtime.writeVoicePoints.mock.lastCall![0].points[0].enabled).toBe(false)
    expect(button('.reference-row', '▶ Ascolta').disabled).toBe(true)
    await input('.reference-track-select select', 'Monza', 'change')
    expect(host.textContent).toContain('Nessun riferimento registrato per Monza')
  })

  it('generates both reference voices and resets timing only after confirmation', async () => {
    await mount('references')
    await input('.reference-row textarea', 'Frena al nuovo riferimento')
    await click('.reference-global-actions', 'Aggiorna 1 riferimento')
    expect(mocks.runtime.saveReferenceWav.mock.calls.map(([body]) => body.filename))
      .toEqual(['spa-1-if_sara.wav', 'spa-1-im_nicola.wav'])
    expect(mocks.runtime.writeVoicePoints.mock.lastCall![0].points[0].audio_paths)
      .toEqual({ if_sara: '/references/spa-1-if_sara.wav', im_nicola: '/references/spa-1-im_nicola.wav' })
    expect(button('.reference-global-actions', 'Audio aggiornato').disabled).toBe(true)
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    const count = mocks.runtime.writeVoicePoints.mock.calls.length
    await click('.reference-global-actions', 'Azzera anticipi/ritardi')
    expect(mocks.runtime.writeVoicePoints).toHaveBeenCalledTimes(count)
    confirm.mockReturnValue(true)
    await click('.reference-global-actions', 'Azzera anticipi/ritardi')
    expect(mocks.runtime.writeVoicePoints.mock.lastCall![0].points[0]).toMatchObject({ timing_offset_sec: 0, text: 'Frena al nuovo riferimento' })
    expect(host.textContent).toContain('Timing ripristinato su 1/1 riferimenti')
    await click('.reference-global-actions', 'Ricarica')
    expect(mocks.runtime.readVoicePoints).toHaveBeenCalledTimes(2)
  })

  it('keeps reference generation retryable after synthesis or persistence failures', async () => {
    await mount('references')
    await input('.reference-row textarea', 'Frase da rigenerare')
    mocks.runtime.writeVoicePoints.mockRejectedValueOnce(new Error('disk full'))
    await vi.advanceTimersByTimeAsync(600); await settle()
    expect(host.textContent).toContain('disk full')
    mocks.runtime.synthesize.mockRejectedValue(new Error('engine busy'))
    await click('.reference-global-actions', 'Aggiorna 1 riferimento')
    expect(host.textContent).toContain('Generate 0/2')
    expect(button('.reference-global-actions', 'Aggiorna 1 riferimento').disabled).toBe(false)
    mocks.runtime.readVoicePoints.mockRejectedValueOnce(new Error('read failed'))
    await click('.reference-global-actions', 'Ricarica')
    expect(host.textContent).toContain('Riferimenti non caricati: read failed')
  })

  it('edits coach phrases, persists availability, regenerates voices and handles missing WAVs', async () => {
    await mount(); await click('.lab-section-tabs', 'Coach')
    await input('.coach-editor textarea', 'Frena')
    expect(button('.coach-editor', 'Salva + Rigenera').disabled).toBe(true)
    await input('.coach-editor textarea', 'Frena prima del cartello')
    await input('.coach-editor select', '1.25', 'change')
    await click('.coach-editor', 'Salva + Rigenera')
    expect(writes('/api/dev/coach-voice-wav').map(([, options]) => options.body.filename))
      .toEqual(['brake-if_sara.wav', 'brake-im_nicola.wav'])
    expect(mocks.runtime.synthesize).toHaveBeenLastCalledWith('Frena prima del cartello', 'im_nicola', 1.25)
    host.querySelector<HTMLButtonElement>('.coach-editor .reference-availability')!.click(); await settle()
    expect(writes('/api/dev/coach-voice-script').at(-1)![1].body.phrases[0].enabled).toBe(false)
    expect(button('.coach-editor', '▶ Ascolta').disabled).toBe(true)
    host.querySelector<HTMLButtonElement>('.coach-editor .reference-availability')!.click(); await settle()
    await click('.coach-editor .play-actions', 'Nicola')
    play.mockRejectedValueOnce(new Error('missing'))
    await click('.coach-editor', '▶ Ascolta')
    expect(host.textContent).toContain('WAV non trovato per brake (im_nicola)')
    await click('.coach-editor .play-actions', 'Sara'); await click('.coach-editor', '▶ Ascolta')
    await click('.coach-editor', 'Rigenera tutte (Sara + Nicola)')
    expect(host.textContent).toContain('1/1 frasi rigenerate')
    mocks.runtime.synthesize.mockRejectedValueOnce(new Error('coach synthesis failed'))
    await click('.coach-editor', 'Rigenera tutte (Sara + Nicola)')
    expect(host.textContent).toContain('0/1 frasi rigenerate')
    expect(host.textContent).toContain('coach synthesis failed')
    fetch.mockRejectedValueOnce(new Error('load failed'))
    await click('.coach-editor', 'Ricarica')
    expect(host.textContent).toContain('Copione coach non disponibile')
  })

  it('plays cached lap WAVs, synthesizes missing ones and bounds generation requests', async () => {
    await mount()
    await click('.lap-time-row', 'Ascolta')
    expect(mocks.runtime.synthesize).not.toHaveBeenCalled()
    expect(host.querySelector('audio')?.getAttribute('src')).toContain('.wav?t=')
    await click('.lap-time-row.is-missing', 'Ascolta')
    expect(mocks.runtime.synthesize).toHaveBeenCalledOnce()
    await click('.lap-time-preview', 'Ascolta esempio')
    await click('.lap-time-row', 'Rigenera')
    expect(writes('/api/dev/lap-time-voice-generate').at(-1)![1].body).toMatchObject({ fromTenths: 900, toTenths: 900, voice: 'if_sara', force: true })
    await click('.lap-time-controls', 'Nicola')
    await input('.lap-time-controls input[type=range]', '1.2')
    await click('.lap-time-library', 'Rigenera vista')
    expect(writes('/api/dev/lap-time-voice-generate').at(-1)![1].body).toMatchObject({ fromTenths: 900, toTenths: 909, voice: 'im_nicola', speed: 1.2 })
    await input('.lap-time-controls label:nth-of-type(2) input', '1000', 'change')
    expect(button('.lap-time-library', 'Rigenera vista').disabled).toBe(true)
    await input('.lap-time-controls label:nth-of-type(1) input', '1001', 'change')
    expect(button('.lap-time-library', 'Rigenera vista').disabled).toBe(false)
    fetch.mockRejectedValueOnce(new Error('generation failed'))
    await click('.lap-time-library', 'Rigenera vista')
    expect(host.textContent).toContain('Generazione tempi fallita: generation failed')
    fetch.mockRejectedValueOnce(new Error('catalog failed'))
    await click('.lap-time-library', 'Aggiorna')
    expect(host.textContent).toContain('Libreria tempi non caricata: catalog failed')
  })

  it('waits for warmup, enables playback and clears polling on unmount', async () => {
    mocks.runtime.kokoroReady.mockResolvedValueOnce({ state: 'starting' }).mockResolvedValueOnce({ state: 'starting' })
    await mount('references', false)
    expect(mocks.runtime.kokoroStart).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(3000); await settle()
    expect(host.querySelector('.server-card strong')?.textContent).toContain('3s')
    await vi.advanceTimersByTimeAsync(3000); await settle()
    expect(host.querySelector('.server-card strong')?.textContent).toBe('Online')
    expect(mocks.notify).toHaveBeenCalledWith('Motore vocale Kokoro online.', 'success')
    app!.unmount(); app = undefined
    expect(vi.getTimerCount()).toBe(0)
  })

  it('reports startup failure, permits retry and times out persistent warmup', async () => {
    mocks.runtime.kokoroReady.mockRejectedValueOnce(new Error('offline'))
    mocks.runtime.kokoroStart.mockRejectedValueOnce(new Error('startup failed'))
    await mount('references', false)
    expect(host.textContent).toContain('Avvio automatico fallito: startup failed')
    mocks.runtime.kokoroReady.mockResolvedValue({ state: 'starting' })
    await click('.server-card', 'Riprova avvio')
    await vi.advanceTimersByTimeAsync(123000); await settle()
    expect(host.querySelector('.server-card strong')?.textContent).toBe('Offline')
    expect(host.textContent).toContain('non ha completato il warmup in tempo')
  })
})
