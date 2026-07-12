import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const stopRoute = readFileSync(resolve(process.cwd(), 'server/api/dev/kokoro-stop.post.ts'), 'utf8')
const voiceLab = readFileSync(resolve(process.cwd(), 'app/pages/dev-voice-lab.vue'), 'utf8')
const app = readFileSync(resolve(process.cwd(), 'app/app.vue'), 'utf8')
const lifecycle = readFileSync(resolve(process.cwd(), 'app/composables/useKokoroVoiceLabLifecycle.ts'), 'utf8')
const voiceLabRuntime = readFileSync(resolve(process.cwd(), 'app/composables/useVoiceLabRuntime.ts'), 'utf8')
const spotterRuntime = readFileSync(resolve(process.cwd(), 'app/pages/spotter-audio-runtime.vue'), 'utf8')

describe('kokoro VoiceLab lifecycle', () => {
  it('non spegne processi Kokoro non gestiti da ACC Suite', () => {
    expect(stopRoute).toContain('getManagedKokoroPid()')
    expect(stopRoute).toContain("reason: 'not-managed'")
    expect(stopRoute).toContain('stopManagedKokoroProcess()')
  })

  it('usa una finestra idle di 10 secondi fuori dal VoiceLab', () => {
    expect(lifecycle).toContain('KOKORO_IDLE_SHUTDOWN_MS = 10_000')
    expect(lifecycle).toContain("VOICE_LAB_MARKER = 'kokoro-voice-lab-active'")
    expect(lifecycle).toContain("window.location.pathname.replace(/\\/+$/, '') === VOICE_LAB_PATH")
    expect(lifecycle).toContain('const voiceLabRuntime = useVoiceLabRuntime()')
    expect(lifecycle).toContain('voiceLabRuntime.kokoroStop()')
    expect(app).toContain('kokoroVoiceLabLifecycle.leaveVoiceLab()')
    expect(app).toContain('kokoroVoiceLabLifecycle.resumePendingLeaveIfNeeded()')
    expect(voiceLab).toContain('kokoroLifecycle.beginWork()')
    expect(voiceLab).toContain('kokoroLifecycle.endWork()')
  })

  it('rende espliciti autosave, anteprima e azioni globali per il pilota', () => {
    expect(voiceLab).toContain('Voce anteprima')
expect(voiceLab).toContain('Testo condiviso tra Sara e Nicola · salvataggio automatico')
    expect(voiceLab).toContain('reference-copy-field')
    expect(voiceLab).toContain('reference-switch')
    expect(voiceLab).toContain('reference-listen')
    expect(voiceLab).toContain('Velocità voce')
    expect(voiceLab).toContain('option v-for="speed in TRACK_VOICE_SPEED_OPTIONS"')
    expect(voiceLab).toContain('Quando pronunciarlo')
    expect(voiceLab).toContain('Usa in pista')
    expect(voiceLab).toContain('role="switch"')
    expect(voiceLab).toContain(':aria-checked="entry.enabled !== false"')
    expect(voiceLab).toContain('Audio da aggiornare')
    expect(voiceLab).toContain('Azzera anticipi/ritardi')
    expect(voiceLab).toContain('window.confirm(')
    expect(voiceLab).toContain("Vale per Sara e Nicola. I testi non cambiano.")
    expect(voiceLab).toContain('referencesWithStaleAudio')
    expect(voiceLab).toContain('referencesNeedingAudioUpdate')
expect(voiceLab).toContain('flushReferenceAutoSaves()')
    expect(voiceLab).toContain("window.addEventListener('pagehide', handleVoiceLabPageHide)")
    expect(voiceLabRuntime).toContain('keepalive: true')
  })

  it('ricarica i riferimenti senza azzerare il giro gia pronunciato', () => {
    expect(spotterRuntime).toContain('subscribeTrackVoiceReferencesChanged(async () =>')
    expect(spotterRuntime).toContain("phase !== 'active' || previousPhase === 'active'")
    expect(spotterRuntime).not.toMatch(/subscribeTrackVoiceReferencesChanged[\s\S]{0,180}resetTrackVoiceReferenceLapState/)
  })
})
